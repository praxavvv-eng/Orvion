// js/watchlist.js – Firebase initialisation + watchlist data layer
//
// Firestore schema (UNCHANGED from the previous version):
//   collection "watchlist" / auto-ID documents with the fields
//     id        number   TMDB id
//     title     string
//     poster    string   full poster URL (https://image.tmdb.org/t/p/w500/...) or ""
//     category  string   "movie" | "series" | "anime" | "kdrama"
//     status    string   "plan" | "watching" | "watched" | "dropped"   (legacy: "completed")
//     added     number   Date.now() at creation time
//
// This module never deletes or rewrites existing documents on its own. Documents are only
// written when the user explicitly adds, changes the status of, or removes an entry.
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
      await withTimeout(fs.updateDoc(existing.ref, { status: entry.status }), WRITE_TIMEOUT_MS);
      return { success: true, isUpdate: true, docId: existing.id };
    }

    const docRef = await withTimeout(
      fs.addDoc(col, {
        id: entry.id,
        title: entry.title,
        poster: entry.poster,
        category: entry.category,
        status: entry.status,
        added: Date.now()
      }),
      WRITE_TIMEOUT_MS
    );
    return { success: true, isUpdate: false, docId: docRef.id };
  });
}

/** Change the status of one document, addressed by its Firestore document ID. */
export function updateWatchlistStatus(docId, newStatus) {
  if (!docId || typeof docId !== "string") return Promise.resolve(failure(invalidError("Missing entry id.")));
  if (!STATUS_VALUES.includes(newStatus)) return Promise.resolve(failure(invalidError("Choose a valid status.")));

  return guarded("doc:" + docId, async () => {
    const { fs, db } = await getFirebase();
    await withTimeout(fs.updateDoc(fs.doc(db, COLLECTION_NAME, docId), { status: newStatus }), WRITE_TIMEOUT_MS);
    return { success: true };
  });
}

/** Remove one document, addressed by its Firestore document ID. */
export function removeFromWatchlist(docId) {
  if (!docId || typeof docId !== "string") return Promise.resolve(failure(invalidError("Missing entry id.")));

  return guarded("doc:" + docId, async () => {
    const { fs, db } = await getFirebase();
    await withTimeout(fs.deleteDoc(fs.doc(db, COLLECTION_NAME, docId)), WRITE_TIMEOUT_MS);
    return { success: true };
  });
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
  getByStatusAndCategory: getItemsByStatusAndCategory,
  subscribe: subscribeWatchlist
};
