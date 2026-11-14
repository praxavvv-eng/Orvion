// js/watchlist.js – Firebase initialisation + watchlist data layer
//
// Firestore schema. The original fields are UNCHANGED:
//   collection "watchlist" / auto-ID documents with the fields
//     id        number   TMDB id
//     title     string
//     poster    string   full poster URL (https://image.tmdb.org/t/p/w500/...) or ""
//     category  string   "movie" | "series" | "anime" | "kdrama"
//     status    string   "plan" | "watching" | "watched" | "dropped"   (legacy: "completed")
//     added     number   Date.now() at creation time
//
// Optional fields, added ONLY by explicit user actions and always safe to be missing (old documents never need them):
//     completedAt  number   Date.now() when the entry was moved to "watched" (never back-filled for old entries)
//     progress     map      episode tracker:
//                             watched  { "1": [1,2,3], "2": [1] }   watched episode numbers per season ("0" = specials)
//                             totals   { "1": 12, "2": 8 }          aired episode count per season, at last sync
//                             ongoing  boolean                      the show was still airing at last sync
//                             last     { s, e }                     most recently marked episode
//                             updated  number                       Date.now() of the last progress change
//
// This module never deletes or rewrites existing documents on its own. Documents are only
// written when the user explicitly adds, changes the status of, tracks progress for, or removes an entry.
// Progress is written with field paths ("progress.watched.2"), so saving one season never overwrites another.
//
// Firebase is loaded lazily the first time the data layer is used. If the Firebase CDN is unreachable the
// rest of the app (Home, Discover, Search, details) keeps working and only watchlist actions report an error;
// the next watchlist action simply tries again.
const FIREBASE_VERSION = "12.11.0";
const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-app.js";
const FIREBASE_FIRESTORE_URL = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Firebase (same project as before – web config values are identifiers, not secrets;
// access is governed by your Firestore security rules)
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBjYQqk2a6eeiONwEqDxY3Mk5E7mrLnix0",
  authDomain: "orvion-a2cb2.firebaseapp.com",
  projectId: "orvion-a2cb2",
  storageBucket: "orvion-a2cb2.firebasestorage.app",
  messagingSenderId: "125083462622",
  appId: "1:125083462622:web:d6d61bc9753f036887cb4f",
  measurementId: "G-YTC7RGMVQX"
};

const COLLECTION_NAME = "watchlist";

let firebasePromise = null;
let firebaseAttempts = 0;

/** Resolves to { fs, db }. A failed load is not cached, so a later call retries. */
function getFirebase() {
  if (firebasePromise) return firebasePromise;
  // A failed module fetch can be remembered by the browser for the same URL, so retries add a query string.
  const suffix = firebaseAttempts++ === 0 ? "" : "?retry=" + Date.now();
  firebasePromise = Promise.all([
    import(FIREBASE_APP_URL + suffix),
    import(FIREBASE_FIRESTORE_URL + suffix)
  ]).then(([appModule, fs]) => {
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    window.db = db; // kept for backwards compatibility
    return { fs, db };
  }).catch((error) => {
    firebasePromise = null;
    const err = new Error("Could not load Firebase");
    err.code = "unavailable";
    err.cause = error;
    throw err;
  });
  return firebasePromise;
}

async function getCollection() {
  const { fs, db } = await getFirebase();
  return { fs, db, col: fs.collection(db, COLLECTION_NAME) };
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
export const STATUSES = [
  { value: "plan", label: "Plan to Watch", short: "Plan" },
  { value: "watching", label: "Watching", short: "Watching" },
  { value: "watched", label: "Watched", short: "Watched" },
  { value: "dropped", label: "Dropped", short: "Dropped" }
];

export const CATEGORIES = [
  { value: "movie", label: "Movie", plural: "Movies" },
  { value: "series", label: "Series", plural: "Series" },
  { value: "anime", label: "Anime", plural: "Anime" },
  { value: "kdrama", label: "K-Drama", plural: "K-Drama" }
];

// Older versions of the status menu wrote "completed" while the tabs read "watched".
// Both are treated as "watched" when reading. Stored values are never rewritten in bulk.
const LEGACY_STATUS = { completed: "watched" };
const STATUS_VALUES = STATUSES.map((s) => s.value);
const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

/** Map a stored status to a canonical one. Unknown values fall back to "plan" for display only. */
export function normalizeStatus(raw) {
  const value = String(raw || "").toLowerCase();
  if (STATUS_VALUES.includes(value)) return value;
  if (LEGACY_STATUS[value]) return LEGACY_STATUS[value];
  return "plan";
}

export function statusLabel(raw) {
  const canonical = normalizeStatus(raw);
  const match = STATUSES.find((s) => s.value === canonical);
  return match ? match.label : "Plan to Watch";
}

export function categoryLabel(raw) {
  const match = CATEGORIES.find((c) => c.value === raw);
  return match ? match.label : "Other";
}

// ---------------------------------------------------------------------------
// Helpers: validation, error descriptions, write guards
// ---------------------------------------------------------------------------
const WRITE_TIMEOUT_MS = 20000;
const READ_TIMEOUT_MS = 15000;
const busyKeys = new Set(); // prevents double taps from producing duplicate writes

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Timed out");
      err.code = "orvion/timeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function offlineError() {
  const err = new Error("Offline");
  err.code = "orvion/offline";
  return err;
}

function invalidError(message) {
  const err = new Error(message);
  err.code = "orvion/invalid";
  return err;
}

/** Human-friendly message for a failed Firestore operation. */
export function describeError(error) {
  const code = (error && error.code) || "";
  if (code === "orvion/offline") return "You're offline. Reconnect and try again.";
  if (code === "orvion/timeout") return "Couldn't confirm the change. Check your connection and refresh to see the current state.";
  if (code === "orvion/invalid") return error.message;
  if (code === "orvion/busy") return "Still working on the previous request.";
  if (code === "permission-denied") return "Firestore refused this request. Check your Firestore security rules.";
  if (code === "unavailable") return "Can't reach the database right now.";
  if (code === "failed-precondition") return "The database needs an index for this request.";
  return "Something went wrong. Please try again.";
}

function failure(error) {
  return { success: false, error, message: describeError(error) };
}

/** Validate and normalise an entry before it is written to Firestore. Throws an `orvion/invalid` error. */
function cleanEntry(item) {
  const id = Number(item && item.id);
  if (!Number.isInteger(id) || id <= 0) throw invalidError("This title has no valid TMDB id.");

  const title = String((item && item.title) || "").trim().slice(0, 300);
  if (!title) throw invalidError("This title has no name.");

  const category = item && item.category;
  if (!CATEGORY_VALUES.includes(category)) throw invalidError("Choose a category.");

  const status = item && item.status;
  if (!STATUS_VALUES.includes(status)) throw invalidError("Choose a status.");

  let poster = typeof (item && item.poster) === "string" ? item.poster.trim() : "";
  if (!/^https:\/\//i.test(poster) || poster.length > 500 || /dummyimage\.com/i.test(poster)) poster = "";

  return { id, title, poster, category, status };
}

function assertOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw offlineError();
}

async function guarded(key, task) {
  if (busyKeys.has(key)) {
    const err = new Error("Busy");
    err.code = "orvion/busy";
    return failure(err);
  }
  busyKeys.add(key);
  try {
    assertOnline();
    return await task();
  } catch (error) {
    const expected = error && (error.code === "orvion/offline" || error.code === "orvion/invalid");
    (expected ? console.warn : console.error)("Watchlist operation failed:", error && error.code, error);
    return failure(error);
  } finally {
    busyKeys.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Add a new entry, or – if the same TMDB id + category already exists – update its status. */
export function addOrUpdateWatchlist(item) {
  let entry;
  try {
    entry = cleanEntry(item);
  } catch (error) {
    return Promise.resolve(failure(error));
  }

  return guarded("add:" + entry.id + ":" + entry.category, async () => {
    const { fs, col } = await getCollection();
    const q = fs.query(col, fs.where("id", "==", entry.id), fs.where("category", "==", entry.category));
    const snapshot = await withTimeout(fs.getDocs(q), READ_TIMEOUT_MS);

    if (!snapshot.empty) {
      const existing = snapshot.docs[0];
      const currentStatus = normalizeStatus(existing.data().status);
      if (currentStatus === entry.status) {
        return { success: true, isUpdate: true, unchanged: true, docId: existing.id };
      }
      const patch = { status: entry.status };
      if (entry.status === "watched") patch.completedAt = Date.now();
      await withTimeout(fs.updateDoc(existing.ref, patch), WRITE_TIMEOUT_MS);
      patchCachedEntry(existing.id, patch);
      return { success: true, isUpdate: true, docId: existing.id };
    }

    const created = {
      id: entry.id,
      title: entry.title,
      poster: entry.poster,
      category: entry.category,
      status: entry.status,
      added: Date.now()
    };
    if (entry.status === "watched") created.completedAt = created.added;
    const docRef = await withTimeout(fs.addDoc(col, created), WRITE_TIMEOUT_MS);
    appendCachedEntry(Object.assign({ docId: docRef.id }, created));
    return { success: true, isUpdate: false, docId: docRef.id };
  });
}

/** Change the status of one document, addressed by its Firestore document ID. */
export function updateWatchlistStatus(docId, newStatus) {
  if (!docId || typeof docId !== "string") return Promise.resolve(failure(invalidError("Missing entry id.")));
  if (!STATUS_VALUES.includes(newStatus)) return Promise.resolve(failure(invalidError("Choose a valid status.")));

  return guarded("doc:" + docId, async () => {
    const { fs, db } = await getFirebase();
    const patch = { status: newStatus };
    if (newStatus === "watched") patch.completedAt = Date.now();
    await withTimeout(fs.updateDoc(fs.doc(db, COLLECTION_NAME, docId), patch), WRITE_TIMEOUT_MS);
    patchCachedEntry(docId, patch);
    return { success: true, completedAt: patch.completedAt };
  });
}

/** Remove one document, addressed by its Firestore document ID. */
export function removeFromWatchlist(docId) {
  if (!docId || typeof docId !== "string") return Promise.resolve(failure(invalidError("Missing entry id.")));

  return guarded("doc:" + docId, async () => {
    const { fs, db } = await getFirebase();
    await withTimeout(fs.deleteDoc(fs.doc(db, COLLECTION_NAME, docId)), WRITE_TIMEOUT_MS);
    removeCachedEntry(docId);
    return { success: true };
  });
}

/**
 * Save episode progress for one document. `change` may contain:
 *   watched  { "<season>": [episode numbers] }   only the seasons that changed
 *   totals   { "<season>": airedCount }          replaced as a whole when given
 *   ongoing  boolean
 *   last     { s, e }
 *   status   "plan" | "watching" | "watched" | "dropped"
 * Uses field paths so concurrent edits to other seasons are never overwritten. Not guarded by the busy
 * lock on purpose: the tracker coalesces rapid taps itself and may call this again while a save is in flight.
 */
export async function saveProgress(docId, change) {
  if (!docId || typeof docId !== "string") return failure(invalidError("Missing entry id."));
  const c = change || {};
  try {
    assertOnline();
    const { fs, db } = await getFirebase();
    const now = Date.now();
    const update = { "progress.updated": now };
    const cachePatch = { progress: { updated: now } };

    if (c.watched && typeof c.watched === "object") {
      cachePatch.progress.watched = {};
      Object.keys(c.watched).forEach((season) => {
        if (!/^\d{1,3}$/.test(season)) return;
        const list = Array.from(new Set((c.watched[season] || []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 5000))).sort((a, b) => a - b);
        update["progress.watched." + season] = list;
        cachePatch.progress.watched[season] = list;
      });
    }
    if (c.totals && typeof c.totals === "object") {
      const totals = {};
      Object.keys(c.totals).forEach((season) => {
        const n = Number(c.totals[season]);
        if (/^\d{1,3}$/.test(season) && Number.isInteger(n) && n >= 0 && n < 5000) totals[season] = n;
      });
      update["progress.totals"] = totals;
      cachePatch.progress.totals = totals;
    }
    if (typeof c.ongoing === "boolean") { update["progress.ongoing"] = c.ongoing; cachePatch.progress.ongoing = c.ongoing; }
    if (c.last && Number.isInteger(c.last.s) && Number.isInteger(c.last.e)) {
      update["progress.last"] = { s: c.last.s, e: c.last.e };
      cachePatch.progress.last = { s: c.last.s, e: c.last.e };
    }
    if (c.status) {
      if (!STATUS_VALUES.includes(c.status)) return failure(invalidError("Choose a valid status."));
      update.status = c.status;
      cachePatch.status = c.status;
      if (c.status === "watched") { update.completedAt = now; cachePatch.completedAt = now; }
    }

    await withTimeout(fs.updateDoc(fs.doc(db, COLLECTION_NAME, docId), update), WRITE_TIMEOUT_MS);
    patchCachedEntry(docId, cachePatch);
    return { success: true, completedAt: update.completedAt };
  } catch (error) {
    const expected = error && (error.code === "orvion/offline" || error.code === "orvion/invalid");
    (expected ? console.warn : console.error)("Progress save failed:", error && error.code, error);
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function toItem(snapshotDoc) {
  return { ...snapshotDoc.data(), docId: snapshotDoc.id };
}

function newestFirst(a, b) {
  return (Number(b.added) || 0) - (Number(a.added) || 0);
}

/**
 * Load the whole library with a single read. Grouping by status/category happens in the UI,
 * which means no composite Firestore index is required and legacy "completed" entries are
 * included. A failed read is reported as `success: false` (it is NOT an empty library).
 */
export async function loadLibrary() {
  try {
    const { fs, col } = await getCollection();
    const snapshot = await withTimeout(fs.getDocs(col), READ_TIMEOUT_MS);
    const items = snapshot.docs.map(toItem).sort(newestFirst);
    storeLibraryCache(items);
    return { success: true, items };
  } catch (error) {
    console.error("Load library error:", error && error.code, error);
    return { success: false, items: [], error, message: describeError(error) };
  }
}

/** All entries for one TMDB id (may be several, one per category). Never throws. */
export async function findEntriesByTmdbId(tmdbId) {
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) return { success: true, items: [] };
  try {
    const { fs, col } = await getCollection();
    const q = fs.query(col, fs.where("id", "==", id));
    const snapshot = await withTimeout(fs.getDocs(q), READ_TIMEOUT_MS);
    return { success: true, items: snapshot.docs.map(toItem).sort(newestFirst) };
  } catch (error) {
    return { success: false, items: [], error };
  }
}

// ---------------------------------------------------------------------------
// Library snapshot cache (localStorage).
// Home, Stats and the "already saved" badges read this instead of re-reading every document on each page
// view, which keeps Firestore reads low. Writes patch the snapshot, so it never drifts from what the user did.
// ---------------------------------------------------------------------------
const LIBRARY_CACHE_KEY = "orvion:lib:v1";
const LIBRARY_MAX_AGE = 10 * 60 * 1000;

function announceLibrary() {
  try { window.dispatchEvent(new CustomEvent("orvion:library-updated")); } catch (e) { /* ignore */ }
}

export function readLibraryCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY) || "null");
    if (cached && Array.isArray(cached.items)) return cached;
  } catch (e) { /* corrupt or unavailable */ }
  return null;
}

function writeLibraryCache(time, items) {
  try { localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify({ t: time, items })); } catch (e) { /* quota/private mode – cache is optional */ }
}

export function storeLibraryCache(items) {
  writeLibraryCache(Date.now(), items);
  announceLibrary();
}

/** Mark the snapshot stale (it is kept for display until the next read replaces it). */
export function invalidateLibraryCache() {
  const cached = readLibraryCache();
  if (cached) writeLibraryCache(0, cached.items);
  announceLibrary();
}

function mergeDeep(target, patch) {
  Object.keys(patch).forEach((key) => {
    const value = patch[key];
    if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

/** Apply the same change that was just written to Firestore to the cached snapshot. */
export function patchCachedEntry(docId, patch) {
  const cached = readLibraryCache();
  if (!cached) return;
  const entry = cached.items.find((item) => item.docId === docId);
  if (!entry) return;
  mergeDeep(entry, JSON.parse(JSON.stringify(patch)));
  writeLibraryCache(cached.t, cached.items);
  announceLibrary();
}

export function appendCachedEntry(entry) {
  const cached = readLibraryCache();
  if (!cached) return;
  cached.items = [entry].concat(cached.items.filter((item) => item.docId !== entry.docId));
  writeLibraryCache(cached.t, cached.items);
  announceLibrary();
}

export function removeCachedEntry(docId) {
  const cached = readLibraryCache();
  if (!cached) return;
  writeLibraryCache(cached.t, cached.items.filter((item) => item.docId !== docId));
  announceLibrary();
}

/** Library from the snapshot when it is fresh, otherwise from Firestore. A failed read falls back to the old snapshot. */
export async function getLibraryCached(options) {
  const opts = options || {};
  const cached = readLibraryCache();
  const maxAge = opts.maxAge == null ? LIBRARY_MAX_AGE : opts.maxAge;
  if (cached && !opts.force && Date.now() - Number(cached.t || 0) < maxAge) {
    return { success: true, items: cached.items, cached: true };
  }
  const fresh = await loadLibrary();
  if (fresh.success) return fresh;
  if (cached) return { success: true, items: cached.items, cached: true, stale: true, message: fresh.message };
  return fresh;
}

// ---------------------------------------------------------------------------
// Progress maths (pure – no network, no DOM)
// ---------------------------------------------------------------------------

/**
 * Summarise an entry's episode progress. Returns null when the entry has no tracked progress.
 *   { watched, total, pct, next: {s,e} | null, completed, ongoing, specials, updated, hasTotals }
 * Only episodes inside the stored aired totals count towards the percentage.
 */
export function progressSummary(entry) {
  const p = entry && entry.progress;
  if (!p || typeof p !== "object") return null;
  const watchedMap = p.watched && typeof p.watched === "object" ? p.watched : {};
  const totals = p.totals && typeof p.totals === "object" ? p.totals : {};

  const seasonSet = new Set();
  Object.keys(totals).forEach((k) => { if (Number(k) > 0) seasonSet.add(Number(k)); });
  Object.keys(watchedMap).forEach((k) => { if (Number(k) > 0) seasonSet.add(Number(k)); });
  const seasons = Array.from(seasonSet).sort((a, b) => a - b);

  let watched = 0;
  let total = 0;
  let next = null;
  seasons.forEach((season) => {
    const done = new Set((Array.isArray(watchedMap[season]) ? watchedMap[season] : []).map(Number));
    const aired = Number(totals[season]) || 0;
    if (aired > 0) {
      let count = 0;
      done.forEach((n) => { if (n >= 1 && n <= aired) count += 1; });
      watched += count;
      total += aired;
      if (!next && count < aired) {
        for (let e = 1; e <= aired; e += 1) { if (!done.has(e)) { next = { s: season, e }; break; } }
      }
    } else {
      watched += done.size; // unknown total for this season: count what was marked, but it cannot define "next"
      total += done.size;
    }
  });

  const specials = Array.isArray(watchedMap[0]) ? watchedMap[0].length : (Array.isArray(watchedMap["0"]) ? watchedMap["0"].length : 0);
  return {
    watched,
    total,
    pct: total ? Math.round((watched / total) * 100) : 0,
    next,
    completed: total > 0 && watched >= total && !next,
    ongoing: !!p.ongoing,
    specials,
    updated: Number(p.updated) || 0,
    hasTotals: Object.keys(totals).length > 0
  };
}

/** Total tracked episodes (including specials) – used by Statistics. */
export function trackedEpisodeCount(entry) {
  const map = entry && entry.progress && entry.progress.watched;
  if (!map || typeof map !== "object") return 0;
  return Object.keys(map).reduce((sum, key) => sum + (Array.isArray(map[key]) ? map[key].length : 0), 0);
}

// Compatibility helpers kept from the previous API ----------------------------

/** Items for a status + category, evaluated client-side so legacy statuses are handled. */
export async function getItemsByStatusAndCategory(status, category) {
  const result = await loadLibrary();
  if (!result.success) return result;
  const wanted = normalizeStatus(status);
  return {
    success: true,
    items: result.items.filter((item) => normalizeStatus(item.status) === wanted && item.category === category)
  };
}

export async function getAllWatchlist() {
  return loadLibrary();
}

/** Real-time subscription (not used by the UI today; kept for compatibility). */
export function subscribeWatchlist(callback) {
  let unsubscribe = () => {};
  let cancelled = false;
  getCollection().then(({ fs, col }) => {
    if (cancelled) return;
    const q = fs.query(col, fs.orderBy("added", "desc"));
    unsubscribe = fs.onSnapshot(
      q,
      (snapshot) => callback(snapshot.docs.map(toItem)),
      (error) => console.error("Snapshot error:", error)
    );
  }).catch((error) => console.error("Subscribe error:", error));
  return () => { cancelled = true; unsubscribe(); };
}

window.watchlist = {
  addOrUpdate: addOrUpdateWatchlist,
  updateStatus: updateWatchlistStatus,
  remove: removeFromWatchlist,
  getAll: getAllWatchlist,
  load: loadLibrary,
  findByTmdbId: findEntriesByTmdbId,
  saveProgress: saveProgress,
  progressSummary: progressSummary,
  getCached: getLibraryCached,
  getByStatusAndCategory: getItemsByStatusAndCategory,
  subscribe: subscribeWatchlist
};
