// js/app.js – shared app behaviour + Home and Watchlist page controllers (ES module)
//
// Responsibilities
//   • appearance wiring, service-worker registration, install prompt
//   • shared sheets: add-to-watchlist, movie/TV details, manage entry
//   • Home page (incl. Continue watching) and Watchlist page controllers
// Appearance engine: js/boot.js · settings UI: js/appearance.js · episode tracker: js/tracker.js
// Discover logic lives in js/discover.js, search logic in js/search.js, statistics in js/stats.js.
import {
  addOrUpdateWatchlist,
  removeFromWatchlist,
  updateWatchlistStatus,
  loadLibrary,
  findEntriesByTmdbId,
  getLibraryCached,
  progressSummary,
  STATUSES,
  CATEGORIES,
  normalizeStatus,
  statusLabel,
  categoryLabel
} from './watchlist.js';
import { initAppearance } from './appearance.js';
import { openTracker, markNextEpisode, canTrack } from './tracker.js';

const UI = window.OrvionUI;
const { el, icon, openModal, closeModal, bindModal } = UI;

const $ = (id) => document.getElementById(id);

// =============================================================================
// 1. SHARED HELPERS
// =============================================================================
function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable – preference lasts for this visit only */ }
}

const { choiceGroup, createSheetRoot, setBusy } = UI;

function dispatchWatchlistChanged() {
  window.dispatchEvent(new CustomEvent('orvion:watchlist-changed'));
}

// =============================================================================
// 4. ADD / UPDATE SHEET
// =============================================================================
let addSheet = null;
let addItem = null;
let addLookupToken = 0;

function ensureAddSheet() {
  if (addSheet) return addSheet;
  const { root, sheet } = createSheetRoot('addModal', 'addModalTitle');
  const title = el('h3', { class: 'sheet-title', text: 'Add to watchlist', attrs: { id: 'addModalTitle' } });
  const sub = el('p', { class: 'sheet-sub' });
  const hint = el('p', { class: 'sheet-hint', attrs: { hidden: true } });

  const categoryGroup = choiceGroup({
    legend: 'Category',
    columns: 2,
    value: 'movie',
    options: CATEGORIES.map((c) => ({ value: c.value, label: c.label }))
  });
  const statusGroup = choiceGroup({
    legend: 'Status',
    columns: 2,
    value: 'plan',
    options: STATUSES.map((s) => ({ value: s.value, label: s.label }))
  });

  const cancel = el('button', { class: 'btn btn-glass', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => closeModal(root) } });
  const save = el('button', { class: 'btn btn-primary', attrs: { type: 'button', id: 'modalSave' } },
    el('span', { class: 'btn-label', text: 'Save' }));

  sheet.append(
    el('div', { class: 'sheet-head' }, title, sub, hint),
    el('div', { class: 'sheet-body' }, categoryGroup.node, statusGroup.node),
    el('div', { class: 'sheet-actions' }, cancel, save)
  );

  save.addEventListener('click', saveAddSheet);
  addSheet = { root, title, sub, hint, categoryGroup, statusGroup, save, label: save.querySelector('.btn-label') };
  return addSheet;
}

/** Open the add sheet for { id, title, poster, type } (type is "movie" | "tv"). */
function showAddModal(item) {
  if (!item || !item.id) return;
  const sheet = ensureAddSheet();
  const current = {
    id: Number(item.id),
    title: String(item.title || '').trim(),
    poster: typeof item.poster === 'string' ? item.poster : '',
    type: item.type === 'tv' ? 'tv' : 'movie'
  };
  current.category = CATEGORIES.some((c) => c.value === item.category) ? item.category : (current.type === 'tv' ? 'series' : 'movie');
  addItem = current;

  sheet.title.textContent = 'Add to watchlist';
  sheet.sub.textContent = current.title;
  sheet.hint.hidden = true;
  sheet.hint.textContent = '';
  sheet.label.textContent = 'Save';
  sheet.categoryGroup.set(current.category);
  sheet.statusGroup.set('plan');
  setBusy(sheet.save, false);
  openModal(sheet.root, { initialFocus: 'input:checked' });

  // Pre-select the existing entry (if any) so "Update" is the obvious action.
  const token = ++addLookupToken;
  findEntriesByTmdbId(current.id).then((result) => {
    if (token !== addLookupToken || addItem !== current || !result.success || !result.items.length) return;
    const first = result.items[0];
    if (CATEGORIES.some((c) => c.value === first.category)) sheet.categoryGroup.set(first.category);
    sheet.statusGroup.set(normalizeStatus(first.status));
    sheet.title.textContent = 'Update watchlist entry';
    sheet.label.textContent = 'Update';
    sheet.hint.textContent = 'In your list: ' + result.items.map((e) => categoryLabel(e.category) + ' · ' + statusLabel(e.status)).join(', ');
    sheet.hint.hidden = false;
  });
}

async function saveAddSheet() {
  const sheet = addSheet;
  if (!sheet || !addItem || sheet.save.disabled) return;
  const category = sheet.categoryGroup.value;
  const status = sheet.statusGroup.value;
  const item = { id: addItem.id, title: addItem.title, poster: addItem.poster, category, status };

  setBusy(sheet.save, true);
  const result = await addOrUpdateWatchlist(item);
  setBusy(sheet.save, false);

  if (!result.success) {
    UI.showToast(result.message || 'Error saving item', 'error');
    return; // keep the sheet open so nothing the user chose is lost
  }

  if (result.unchanged) UI.showToast('Already in your list as ' + statusLabel(status), 'info');
  else if (result.isUpdate) UI.showToast('Moved to ' + statusLabel(status), 'success');
  else UI.showToast('Added to watchlist', 'success');

  closeModal(sheet.root);
  dispatchWatchlistChanged();
  refreshDetailsStatus();
}

// =============================================================================
// 5. DETAILS SHEET
// =============================================================================
let detailsSheet = null;
let detailsToken = 0;
let detailsAbort = null;
let detailsCurrent = null; // { id, type, item }

function ensureDetailsSheet() {
  if (detailsSheet) return detailsSheet;
  const { root, sheet } = createSheetRoot('detailsModal', 'detailsTitle', 'details');
  const closeBtn = el('button', {
    class: 'details-close icon-btn glass',
    attrs: { type: 'button', 'aria-label': 'Close details' },
    on: { click: () => closeModal(root) }
  }, icon('close', 20));
  const scroll = el('div', { class: 'details-scroll' });
  sheet.append(closeBtn, scroll);
  detailsSheet = { root, scroll };
  return detailsSheet;
}

function formatRuntime(minutes) {
  const m = Number(minutes);
  if (!m || m < 1) return '';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? h + 'h ' + rest + 'm' : h + 'h';
}

function renderDetailsLoading() {
  detailsSheet.scroll.replaceChildren(
    el('div', { class: 'details-hero skeleton-block' }),
    el('div', { class: 'details-main' },
      el('div', { class: 'details-poster' }, el('span', { class: 'card-poster skeleton-block' })),
      el('div', { class: 'details-head' },
        el('h2', { class: 'details-title', text: 'Loading…', attrs: { id: 'detailsTitle' } }),
        el('div', { class: 'skeleton-line short' })
      ),
      el('div', { class: 'details-body' },
        el('div', { class: 'skeleton-line' }),
        el('div', { class: 'skeleton-line' }),
        el('div', { class: 'skeleton-line short' })
      )
    )
  );
}

function renderDetailsError(id, type) {
  detailsSheet.scroll.replaceChildren(
    el('div', { class: 'details-error' },
      el('h2', { class: 'sr-only', text: 'Details unavailable', attrs: { id: 'detailsTitle' } }),
      UI.createState({
        kind: 'error',
        icon: 'alert',
        title: "Couldn't load details",
        text: navigator.onLine === false ? "You're offline." : 'The movie database did not respond.',
        actionLabel: 'Try again',
        actionIcon: 'refresh',
        onAction: () => showItemDetails(id, type)
      })
    )
  );
}

function renderDetails(item, type) {
  const title = UI.titleOf(item);
  const year = UI.yearOf(item);
  const rating = UI.ratingOf(item);
  const runtime = formatRuntime(item.runtime || (Array.isArray(item.episode_run_time) ? item.episode_run_time[0] : 0));
  const seasons = Number(item.number_of_seasons) > 0 ? item.number_of_seasons + (item.number_of_seasons === 1 ? ' season' : ' seasons') : '';

  // Hero backdrop
  const hero = el('div', { class: 'details-hero' });
  if (item.backdrop_path) {
    const backdrop = el('img', { class: 'details-backdrop', attrs: { alt: '', decoding: 'async', draggable: 'false' } });
    backdrop.addEventListener('load', () => backdrop.classList.add('loaded'));
    backdrop.addEventListener('error', () => backdrop.remove());
    backdrop.src = window.tmdbImage(item.backdrop_path, 'w780');
    hero.appendChild(backdrop);
  }
  hero.appendChild(el('div', { class: 'details-hero-scrim', attrs: { 'aria-hidden': 'true' } }));

  // Poster
  const poster = el('div', { class: 'details-poster' }, el('span', { class: 'card-poster' }, UI.posterFallback()));
  if (item.poster_path) {
    poster.firstChild.appendChild(UI.posterImage(window.tmdbImage(item.poster_path, 'w342'), title + ' poster', { eager: true }));
  }

  // Meta line
  const meta = el('p', { class: 'details-meta' });
  if (rating) meta.appendChild(el('span', { class: 'meta-rating' }, icon('star', 14), el('span', { text: rating })));
  [year, UI.typeLabel(type), runtime || seasons].filter(Boolean).forEach((part) => meta.appendChild(el('span', { text: part })));

  // Genres
  const genres = el('div', { class: 'details-genres' });
  (Array.isArray(item.genres) ? item.genres : []).forEach((g) => {
    if (g && g.name) genres.appendChild(el('span', { class: 'genre-tag', text: g.name }));
  });

  // Actions
  const addBtn = el('button', { class: 'btn btn-primary', attrs: { type: 'button', id: 'detailsAddBtn' } },
    icon('plus', 18), el('span', { class: 'btn-label', text: 'Add to watchlist' }));
  addBtn.addEventListener('click', () => {
    showAddModal({ id: item.id, title: title, poster: UI.storedPoster(item), type: type, category: UI.suggestCategory(type, item.original_language, item.genres) });
  });
  const trackBtn = el('button', { class: 'btn btn-glass', attrs: { type: 'button', id: 'detailsTrackBtn', hidden: true } }, icon('layers', 18), 'Track episodes');
  const actions = el('div', { class: 'details-actions' }, addBtn, trackBtn);

  const videos = item.videos && Array.isArray(item.videos.results) ? item.videos.results : [];
  const trailer = videos.find((v) => v && v.type === 'Trailer' && v.site === 'YouTube' && /^[\w-]{6,20}$/.test(v.key || ''));
  if (trailer) {
    actions.appendChild(el('a', {
      class: 'btn btn-glass',
      attrs: { href: 'https://www.youtube.com/watch?v=' + trailer.key, target: '_blank', rel: 'noopener noreferrer' }
    }, icon('play', 18), 'Trailer'));
  }

  const head = el('div', { class: 'details-head' },
    el('h2', { class: 'details-title', text: title, attrs: { id: 'detailsTitle' } })
  );
  if (item.tagline) head.appendChild(el('p', { class: 'details-tagline', text: item.tagline }));
  head.append(meta, genres);

  const body = el('div', { class: 'details-body' },
    el('div', { class: 'details-status', attrs: { 'aria-live': 'polite' } }),
    actions,
    el('h3', { class: 'details-heading', text: 'Overview' }),
    el('p', { class: 'details-overview', text: item.overview || 'No overview available.' })
  );

  // Cast
  const cast = (item.credits && Array.isArray(item.credits.cast) ? item.credits.cast : []).filter((a) => a && a.name).slice(0, 10);
  if (cast.length) {
    const row = el('ul', { class: 'cast-row' });
    cast.forEach((actor) => {
      const avatar = el('span', { class: 'cast-avatar', attrs: { 'aria-hidden': 'true' } }, el('span', { text: actor.name.trim().charAt(0).toUpperCase() }));
      if (actor.profile_path) {
        const img = el('img', { attrs: { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } });
        img.addEventListener('error', () => img.remove());
        img.src = window.tmdbImage(actor.profile_path, 'w185');
        avatar.appendChild(img);
      }
      row.appendChild(el('li', { class: 'cast-item' },
        avatar,
        el('span', { class: 'cast-name', text: actor.name }),
        actor.character ? el('span', { class: 'cast-role', text: actor.character }) : null
      ));
    });
    body.append(el('h3', { class: 'details-heading', text: 'Cast' }), row);
  }

  detailsSheet.scroll.replaceChildren(hero, el('div', { class: 'details-main' }, poster, head, body));
  detailsSheet.scroll.scrollTop = 0;
}

/** Show which list(s) this title is already in, and relabel the main button accordingly. */
async function refreshDetailsStatus() {
  const current = detailsCurrent;
  if (!current || !detailsSheet) return;
  const result = await findEntriesByTmdbId(current.id);
  if (detailsCurrent !== current) return;
  const holder = detailsSheet.scroll.querySelector('.details-status');
  const label = detailsSheet.scroll.querySelector('#detailsAddBtn .btn-label');
  if (!holder || !label) return;

  holder.replaceChildren();
  if (result.success && result.items.length) {
    result.items.forEach((entry) => {
      holder.appendChild(el('span', { class: 'status-pill' },
        el('span', { class: 'status-dot', attrs: { 'data-status': normalizeStatus(entry.status) } }),
        el('span', { text: categoryLabel(entry.category) + ' · ' + statusLabel(entry.status) })
      ));
    });
    label.textContent = 'Update status';
  } else {
    label.textContent = 'Add to watchlist';
  }

  // Episode tracking is offered once a series / anime / K-drama is in the list.
  const trackBtn = detailsSheet.scroll.querySelector('#detailsTrackBtn');
  if (trackBtn) {
    const entry = result.success ? result.items.find(canTrack) : null;
    trackBtn.hidden = !entry;
    trackBtn.onclick = entry ? () => { closeModal(detailsSheet.root); openTracker(entry); } : null;
  }
}

async function showItemDetails(id, type) {
  const numericId = Number(id);
  const kind = type === 'tv' ? 'tv' : type === 'movie' ? 'movie' : null;
  if (!numericId || !kind) {
    console.error('Invalid item data', { id, type });
    return;
  }

  const sheet = ensureDetailsSheet();
  if (detailsAbort) detailsAbort.abort();
  detailsAbort = new AbortController();
  const token = ++detailsToken;
  detailsCurrent = null;

  renderDetailsLoading();
  openModal(sheet.root, { initialFocus: '.details-close' });

  const item = kind === 'movie'
    ? await window.fetchMovieDetails(numericId, { signal: detailsAbort.signal })
    : await window.fetchTVDetails(numericId, { signal: detailsAbort.signal });
  if (token !== detailsToken) return; // a newer request replaced this one

  if (!item) {
    renderDetailsError(numericId, kind);
    return;
  }
  detailsCurrent = { id: numericId, type: kind, item };
  renderDetails(item, kind);
  refreshDetailsStatus();
}

// =============================================================================
// 6. MANAGE-ENTRY SHEET (watchlist page): change status or remove, with confirmation
// =============================================================================
let manageSheet = null;
let manageEntry = null;

function ensureManageSheet() {
  if (manageSheet) return manageSheet;
  const { root, sheet } = createSheetRoot('manageModal', 'manageTitle');
  const title = el('h3', { class: 'sheet-title', text: 'Manage entry', attrs: { id: 'manageTitle' } });
  const sub = el('p', { class: 'sheet-sub' });
  const statusGroup = choiceGroup({
    legend: 'Status',
    columns: 2,
    value: 'plan',
    options: STATUSES.map((s) => ({ value: s.value, label: s.label }))
  });

  const removeBtn = el('button', { class: 'btn btn-danger', attrs: { type: 'button' } }, icon('trash', 18), 'Remove');
  const cancelBtn = el('button', { class: 'btn btn-glass', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => closeModal(root) } });
  const saveBtn = el('button', { class: 'btn btn-primary', attrs: { type: 'button' } }, el('span', { class: 'btn-label', text: 'Save' }));
  const mainActions = el('div', { class: 'sheet-actions' }, removeBtn, cancelBtn, saveBtn);
  const trackBtn = el('button', { class: 'btn btn-glass btn-block', attrs: { type: 'button' } }, icon('layers', 18), 'Track episodes');
  trackBtn.addEventListener('click', () => {
    const entry = manageEntry;
    if (!entry) return;
    closeModal(root);
    openTracker(entry);
  });

  const confirmText = el('p', { class: 'confirm-text' });
  const keepBtn = el('button', { class: 'btn btn-glass', text: 'Keep it', attrs: { type: 'button' } });
  const confirmBtn = el('button', { class: 'btn btn-danger-solid', attrs: { type: 'button' } }, el('span', { class: 'btn-label', text: 'Remove' }));
  const confirmBox = el('div', { class: 'confirm-box', attrs: { hidden: true, role: 'alertdialog' } },
    confirmText, el('div', { class: 'sheet-actions' }, keepBtn, confirmBtn));

  sheet.append(
    el('div', { class: 'sheet-head' }, title, sub),
    el('div', { class: 'sheet-body' }, statusGroup.node, trackBtn),
    mainActions,
    confirmBox
  );

  const showConfirm = (visible) => {
    confirmBox.hidden = !visible;
    mainActions.hidden = visible;
    if (visible) confirmBtn.focus();
  };

  removeBtn.addEventListener('click', () => {
    if (!manageEntry) return;
    confirmText.textContent = 'Remove “' + (manageEntry.title || 'this title') + '” from your watchlist? This can’t be undone.';
    showConfirm(true);
  });
  keepBtn.addEventListener('click', () => { showConfirm(false); removeBtn.focus(); });

  saveBtn.addEventListener('click', async () => {
    const entry = manageEntry;
    if (!entry || saveBtn.disabled) return;
    const newStatus = statusGroup.value;
    if (newStatus === normalizeStatus(entry.status)) { closeModal(root); return; }
    setBusy(saveBtn, true);
    const result = await updateWatchlistStatus(entry.docId, newStatus);
    setBusy(saveBtn, false);
    if (!result.success) { UI.showToast(result.message || 'Failed to update status', 'error'); return; }
    watchlistState.apply(entry.docId, (e) => {
      e.status = newStatus;
      if (newStatus === 'watched') e.completedAt = result.completedAt || Date.now();
    });
    UI.showToast('Moved to ' + statusLabel(newStatus), 'success');
    closeModal(root);
  });

  confirmBtn.addEventListener('click', async () => {
    const entry = manageEntry;
    if (!entry || confirmBtn.disabled) return;
    setBusy(confirmBtn, true);
    const result = await removeFromWatchlist(entry.docId);
    setBusy(confirmBtn, false);
    if (!result.success) { UI.showToast(result.message || 'Error removing item', 'error'); return; }
    watchlistState.remove(entry.docId);
    UI.showToast('Removed from watchlist', 'success');
    closeModal(root);
  });

  manageSheet = { root, sub, statusGroup, showConfirm, trackBtn };
  return manageSheet;
}

function showManageSheet(entry) {
  if (!entry || !entry.docId) return;
  const sheet = ensureManageSheet();
  manageEntry = entry;
  sheet.sub.textContent = entry.title || '';
  sheet.statusGroup.set(normalizeStatus(entry.status));
  sheet.showConfirm(false);
  sheet.trackBtn.hidden = !canTrack(entry);
  openModal(sheet.root, { initialFocus: 'input:checked' });
}

// =============================================================================
// 7. HOME PAGE
// =============================================================================
const CACHE_TTL = 60 * 60 * 1000;
const HOME_SECTIONS = [
  { key: 'trending', rowId: 'trendingScroll', label: 'Trending', type: 'movie', fetch: () => window.fetchTrending() },
  { key: 'popular', rowId: 'popularScroll', label: 'Popular', type: 'movie', fetch: () => window.fetchPopular() },
  { key: 'topRated', rowId: 'topRatedScroll', label: 'Top Rated', type: 'movie', fetch: () => window.fetchTopRated() },
  { key: 'tvPopular', rowId: 'tvScroll', label: 'Popular TV', type: 'tv', fetch: () => window.fetchTVPopular() }
];

function readCache(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem('orvion:cache:' + key) || 'null');
    if (parsed && parsed.data && Array.isArray(parsed.data.results)) return parsed;
  } catch (e) { /* corrupt or unavailable */ }
  return null;
}

function writeCache(key, data) {
  try {
    localStorage.setItem('orvion:cache:' + key, JSON.stringify({
      data: { results: data.results, total_pages: data.total_pages },
      timestamp: Date.now()
    }));
  } catch (e) { /* quota or privacy mode – caching is optional */ }
}

/** Fetch one home collection: fresh cache → network → stale cache. Failures are never cached. */
async function resolveSection(section, force) {
  const cached = readCache(section.key);
  if (cached && !force && Date.now() - Number(cached.timestamp || 0) < CACHE_TTL) {
    return { ok: true, data: cached.data, cached: true };
  }

  if (!section || typeof section.fetch !== 'function') {
    return { ok: false, error: { kind: 'configuration', message: 'This home section is not configured.' } };
  }

  try {
    const response = await section.fetch();
    if (response && response.ok === true && Array.isArray(response.results)) {
      if (response.results.length) writeCache(section.key, response);
      return { ok: true, data: response };
    }

    const error = response && response.error ? response.error : { kind: 'empty-response' };
    if (cached && Array.isArray(cached.data.results)) return { ok: true, data: cached.data, stale: true, error };
    return { ok: false, error };
  } catch (error) {
    console.error('Home section failed:', section.key, error);
    if (cached && Array.isArray(cached.data.results)) return { ok: true, data: cached.data, stale: true, error };
    return { ok: false, error };
  }
}

function homeApiErrorText(error) {
  if (typeof window.describeTMDBError === 'function') return window.describeTMDBError(error);
  if (navigator.onLine === false) return 'You’re offline. Reconnect and try again.';
  return 'The movie database did not respond. Please try again.';
}

async function loadHomeSection(section, force) {
  const row = $(section.rowId);
  if (!row) return null;

  row.setAttribute('aria-busy', 'true');
  row.replaceChildren(UI.skeletonCards(8));

  try {
    const outcome = await resolveSection(section, force);
    row.removeAttribute('aria-busy');

    if (!outcome || !outcome.ok) {
      row.replaceChildren(UI.createState({
        kind: 'error',
        compact: true,
        icon: navigator.onLine === false ? 'wifiOff' : 'alert',
        title: 'Couldn’t load ' + section.label,
        text: homeApiErrorText(outcome && outcome.error),
        actionLabel: 'Retry',
        actionIcon: 'refresh',
        onAction: () => loadHomeSection(section, true).then((again) => {
          if (Array.isArray(again) && again.length && section.key === 'trending') renderHero(again);
        })
      }));
      return null;
    }

    const items = (Array.isArray(outcome.data && outcome.data.results) ? outcome.data.results : [])
      .filter((item) => item && item.id)
      .slice(0, 16);

    if (!items.length) {
      row.replaceChildren(UI.createState({ compact: true, icon: 'film', title: 'Nothing to show right now', text: 'Check back a little later.' }));
      return items;
    }

    const cards = items.map((item) => window.createSmallCard(item, section.type));
    row.replaceChildren(...cards);
    UI.stagger(cards);
    row.dispatchEvent(new Event('scroll'));
    return items;
  } catch (error) {
    console.error('Could not render home section:', section && section.key, error);
    row.removeAttribute('aria-busy');
    row.replaceChildren(UI.createState({
      kind: 'error',
      compact: true,
      icon: 'alert',
      title: 'Couldn’t display ' + ((section && section.label) || 'content'),
      text: 'Something went wrong while displaying this section. Please retry.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
      onAction: () => loadHomeSection(section, true)
    }));
    return null;
  }
}

let heroObserver = null;
let heroTimer = null;
let heroPausedUntil = 0;

function startHeroAutoplay(track, count) {
  clearInterval(heroTimer);
  if (count < 2 || UI.reducedMotion()) return;
  const pause = () => { heroPausedUntil = Date.now() + 12000; };
  ['pointerdown', 'touchstart', 'wheel', 'focusin', 'keydown'].forEach((evt) => track.addEventListener(evt, pause, { passive: true }));
  heroTimer = setInterval(() => {
    if (document.hidden || Date.now() < heroPausedUntil || !track.isConnected) return;
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    track.scrollTo({ left: track.clientWidth * ((index + 1) % count), behavior: 'smooth' });
  }, 7000);
}

function renderHero(items) {
  const hero = $('hero');
  const track = $('heroTrack');
  const dots = $('heroDots');
  if (!hero || !track || !dots) return;

  const slides = (items || []).filter((item) => item && item.id && item.backdrop_path).slice(0, 6);
  if (!slides.length) { hero.hidden = true; document.body.classList.add('no-hero'); return; }
  hero.hidden = false;
  document.body.classList.remove('no-hero');

  if (heroObserver) heroObserver.disconnect();
  track.replaceChildren();
  dots.replaceChildren();

  const slideNodes = slides.map((item, index) => {
    const node = window.createHeroSlide(item, {
      type: 'movie',
      eager: index === 0,
      eyebrow: 'Trending this week',
      label: (index + 1) + ' of ' + slides.length + ': ' + UI.titleOf(item)
    });
    track.appendChild(node);
    return node;
  });

  const dotNodes = slides.map((item, index) => {
    const dot = el('button', {
      class: 'hero-dot' + (index === 0 ? ' active' : ''),
      attrs: { type: 'button', 'aria-label': 'Show featured title ' + (index + 1) + ' of ' + slides.length },
      on: { click: () => track.scrollTo({ left: track.clientWidth * index, behavior: UI.reducedMotion() ? 'auto' : 'smooth' }) }
    });
    if (index === 0) dot.setAttribute('aria-current', 'true');
    dots.appendChild(dot);
    return dot;
  });

  if ('IntersectionObserver' in window) {
    heroObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = slideNodes.indexOf(entry.target);
        slideNodes.forEach((node, i) => node.classList.toggle('is-active', i === index));
        dotNodes.forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
          if (i === index) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
      });
    }, { root: track, threshold: 0.6 });
    slideNodes.forEach((node) => heroObserver.observe(node));
  }
  startHeroAutoplay(track, slideNodes.length);
}

/** Desktop previous/next buttons for horizontal rows (hidden on touch via CSS). */
function initRowControls() {
  document.querySelectorAll('.row-controls[data-for]').forEach((controls) => {
    const row = $(controls.dataset.for);
    if (!row || controls.dataset.ready === '1') return;
    controls.dataset.ready = '1';
    const label = controls.dataset.label || 'row';

    const make = (dir, name, text) => el('button', {
      class: 'row-btn',
      attrs: { type: 'button', 'aria-label': text + ' ' + label },
      on: {
        click: () => row.scrollBy({ left: dir * Math.max(240, row.clientWidth * 0.85), behavior: UI.reducedMotion() ? 'auto' : 'smooth' })
      }
    }, icon(name, 18));

    const prev = make(-1, 'chevL', 'Scroll left:');
    const next = make(1, 'chevR', 'Scroll right:');
    controls.append(prev, next);

    let queued = false;
    const update = () => {
      queued = false;
      prev.disabled = row.scrollLeft <= 4;
      next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
    };
    row.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
    window.enableDragScroll(row);
  });
}

async function initHome() {
  try {
    initRowControls();
  } catch (error) {
    console.warn('Home row controls could not be initialized:', error);
  }

  void initContinueWatching();

  // Each section handles its own failure; one broken endpoint must not block the others.
  const results = await Promise.all(HOME_SECTIONS.map((section) => loadHomeSection(section, false)));
  const trending = results[0];
  if (Array.isArray(trending) && trending.length) renderHero(trending);
  else {
    const hero = $('hero');
    if (hero) hero.hidden = true;
    document.body.classList.add('no-hero');
  }
}

// ---------------------------------------------------------------------------
// Continue watching (Home): titles in "Watching", most recently updated first
// ---------------------------------------------------------------------------
function updatedAt(entry) {
  const progress = entry && entry.progress;
  return Math.max(Number(progress && progress.updated) || 0, Number(entry && entry.completedAt) || 0, Number(entry && entry.added) || 0);
}

function nextLabel(summary) {
  return summary && summary.next ? 'S' + summary.next.s + ' · E' + summary.next.e + ' next' : '';
}

function continueCard(entry, rerender) {
  const summary = progressSummary(entry);
  const type = entry.category === 'movie' ? 'movie' : 'tv';
  return window.createWatchlistCard(entry, {
    status: 'watching',
    statusLabel: statusLabel('watching'),
    categoryLabel: categoryLabel(entry.category),
    subText: nextLabel(summary) || (summary && summary.completed ? 'Caught up' : categoryLabel(entry.category)),
    subAccent: !!(summary && summary.next),
    progress: summary && summary.total ? { pct: summary.pct, done: summary.completed } : null,
    quick: summary && summary.next ? {
      label: 'Mark S' + summary.next.s + ' E' + summary.next.e + ' watched',
      onClick: async () => {
        const result = markNextEpisode(entry);
        if (!result) return;
        UI.showToast('Marked S' + result.marked.s + ' · E' + result.marked.e + ' watched', 'success');
        rerender();
      }
    } : null,
    onOpen: () => { if (canTrack(entry)) openTracker(entry); else showItemDetails(entry.id, type); }
  });
}

async function initContinueWatching() {
  const section = $('cwSection');
  const row = $('cwScroll');
  if (!section || !row) return;
  let entries = [];

  const render = () => {
    const list = entries
      .filter((e) => normalizeStatus(e.status) === 'watching')
      .sort((a, b) => updatedAt(b) - updatedAt(a))
      .slice(0, 14);
    section.hidden = !list.length;
    if (!list.length) return;
    const badge = section.querySelector('.count-badge');
    if (badge) badge.textContent = String(list.length);
    const cards = list.map((entry) => continueCard(entry, render));
    row.replaceChildren(...cards);
    UI.stagger(cards);
  };

  const result = await getLibraryCached();
  if (!result.success) return; // Continue watching is optional; Home must not show an error for it
  entries = result.items;
  window.enableDragScroll(row);
  render();

  let queued = false;
  window.addEventListener('orvion:progress-changed', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
}

// =============================================================================
// 8. WATCHLIST PAGE
// =============================================================================
const SORT_KEY = 'orvion:watchlist:sort';

const ROW_LIMIT = 24;
const BATCH_SIZE = 48;

const watchlistState = {
  entries: [],
  status: 'plan',
  category: 'all',
  query: '',
  sort: 'added',
  loaded: false,
  failed: false,
  render: () => {},
  apply(docId, mutate) {
    const entry = this.entries.find((e) => e.docId === docId);
    if (entry) mutate(entry);
    this.render();
  },
  remove(docId) {
    this.entries = this.entries.filter((e) => e.docId !== docId);
    this.render();
  }
};

function readWatchlistHash() {
  const [status, category] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  if (STATUSES.some((s) => s.value === status)) watchlistState.status = status;
  if (category && (category === 'all' || CATEGORIES.some((c) => c.value === category) || category === 'other')) watchlistState.category = category;
}

function writeWatchlistHash() {
  const hash = '#' + watchlistState.status + (watchlistState.category !== 'all' ? '/' + watchlistState.category : '');
  history.replaceState(null, '', location.pathname + location.search + hash);
}

function categoryKey(entry) {
  return CATEGORIES.some((c) => c.value === entry.category) ? entry.category : 'other';
}

function sortEntries(list) {
  const copy = list.slice();
  if (watchlistState.sort === 'title') {
    copy.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  } else if (watchlistState.sort === 'updated') {
    copy.sort((a, b) => updatedAt(b) - updatedAt(a));
  } else {
    copy.sort((a, b) => (Number(b.added) || 0) - (Number(a.added) || 0));
  }
  return copy;
}

/** "Added Mar 2025" from the stored timestamp; falls back to the category when a record has no `added` value. */
function addedText(entry) {
  const time = Number(entry.added);
  if (!time) return categoryLabel(entry.category);
  try {
    return 'Added ' + new Date(time).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch (e) {
    return categoryLabel(entry.category);
  }
}

function watchlistCard(entry) {
  const type = entry.category === 'movie' ? 'movie' : 'tv';
  const status = normalizeStatus(entry.status);
  const summary = progressSummary(entry);
  const hasProgress = !!(summary && summary.total);
  let subText = addedText(entry);
  let subAccent = false;
  if (hasProgress && summary.next && status !== 'watched') { subText = nextLabel(summary); subAccent = true; }
  else if (hasProgress && summary.completed) subText = 'Completed · ' + summary.total + ' eps';
  else if (hasProgress) subText = summary.watched + ' / ' + summary.total + ' eps';

  return window.createWatchlistCard(entry, {
    status: status,
    statusLabel: statusLabel(entry.status),
    categoryLabel: categoryLabel(entry.category),
    subText: subText,
    subAccent: subAccent,
    progress: hasProgress ? { pct: summary.pct, done: summary.completed } : null,
    quick: status === 'watching' && summary && summary.next ? {
      label: 'Mark ' + nextLabel(summary).replace(' next', '') + ' watched',
      onClick: async () => {
        const result = markNextEpisode(entry);
        if (result) UI.showToast('Marked S' + result.marked.s + ' · E' + result.marked.e + ' watched', 'success');
      }
    } : null,
    onOpen: () => {
      if (status === 'watching' && canTrack(entry)) openTracker(entry);
      else showItemDetails(entry.id, type);
    },
    onManage: showManageSheet
  });
}

const EMPTY_COPY = {
  plan: { title: 'Nothing planned yet', text: 'Save movies and shows you want to watch and they’ll wait for you here.' },
  watching: { title: 'Nothing in progress', text: 'Titles you’re currently watching will show up here.' },
  watched: { title: 'No finished titles yet', text: 'Mark something as watched to build your history.' },
  dropped: { title: 'Nothing dropped', text: 'Titles you stopped watching will be kept here.' }
};

function initWatchlist() {
  const content = $('watchlistContent');
  const tabs = $('statusTabs');
  const chips = $('categoryChips');
  const sortSelect = $('sortSelect');
  const summary = $('watchlistSummary');
  if (!content || !tabs || !chips) return;

  const savedSort = readPref(SORT_KEY, 'added');
  watchlistState.sort = savedSort === 'title' || savedSort === 'updated' ? savedSort : 'added';
  const filterInput = $('libFilter');
  let batchObserver = null;
  if (sortSelect) sortSelect.value = watchlistState.sort;
  readWatchlistHash();

  const segmented = UI.segmented(tabs, {
    onChange: (value) => {
      watchlistState.status = value;
      watchlistState.category = 'all';
      writeWatchlistHash();
      render();
    }
  });
  segmented.setValue(watchlistState.status, true);

  function selectCategory(value) {
    watchlistState.category = value;
    writeWatchlistHash();
    render();
    window.scrollTo({ top: 0, behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
  }

  function renderChips(inStatus) {
    const counts = {};
    inStatus.forEach((entry) => { const k = categoryKey(entry); counts[k] = (counts[k] || 0) + 1; });
    const keys = CATEGORIES.map((c) => c.value).concat('other').filter((k) => counts[k]);
    if (watchlistState.category !== 'all' && !counts[watchlistState.category]) watchlistState.category = 'all';

    chips.replaceChildren();
    if (keys.length < 2 && watchlistState.category === 'all') { chips.hidden = true; return; }
    chips.hidden = false;

    const make = (value, label, count) => {
      const active = watchlistState.category === value;
      const chip = el('button', {
        class: 'chip' + (active ? ' active' : ''),
        attrs: { type: 'button', 'aria-pressed': active ? 'true' : 'false' },
        on: { click: () => { if (watchlistState.category !== value) selectCategory(value); } }
      }, el('span', { text: label }), el('span', { class: 'chip-count', text: String(count) }));
      chips.appendChild(chip);
    };
    make('all', 'All', inStatus.length);
    keys.forEach((key) => make(key, key === 'other' ? 'Other' : categoryLabel(key), counts[key]));
  }

  function renderTabCounts() {
    const counts = {};
    watchlistState.entries.forEach((entry) => { const s = normalizeStatus(entry.status); counts[s] = (counts[s] || 0) + 1; });
    tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const badge = tab.querySelector('.seg-count');
      if (badge) badge.textContent = watchlistState.loaded && !watchlistState.failed ? String(counts[tab.dataset.value] || 0) : '';
    });
    segmented.refresh();
  }

  /** Render a long list in batches as the user scrolls, so hundreds of titles never block the page. */
  function renderBatched(grid, items) {
    if (batchObserver) { batchObserver.disconnect(); batchObserver = null; }
    let index = 0;
    const sentinel = el('div', { class: 'sentinel', attrs: { 'aria-hidden': 'true' } });
    const more = (first) => {
      const cards = items.slice(index, index + BATCH_SIZE).map(watchlistCard);
      index += BATCH_SIZE;
      grid.append(...cards);
      if (first) UI.stagger(cards);
      if (index >= items.length) {
        sentinel.remove();
        if (batchObserver) { batchObserver.disconnect(); batchObserver = null; }
      }
    };
    more(true);
    if (index < items.length) {
      grid.after(sentinel);
      if ('IntersectionObserver' in window) {
        batchObserver = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(false); }, { rootMargin: '800px 0px' });
        batchObserver.observe(sentinel);
      } else {
        while (index < items.length) more(false);
      }
    }
  }

  function duplicateNote() {
    const seen = new Map();
    watchlistState.entries.forEach((e) => { const k = e.id + ':' + e.category; seen.set(k, (seen.get(k) || 0) + 1); });
    let extra = 0;
    seen.forEach((n) => { if (n > 1) extra += n - 1; });
    if (!extra) return null;
    return el('p', { class: 'dupe-note', attrs: { role: 'note' } },
      extra + (extra === 1 ? ' title appears' : ' titles appear') + ' more than once in your library (same TMDB id and category). Orvion never deletes anything automatically – remove the extra copies from the ⋯ menu when you’re ready.');
  }

  function renderSkeleton() {
    const row = el('div', { class: 'row' });
    row.appendChild(UI.skeletonCards(6));
    content.replaceChildren(row);
    content.setAttribute('aria-busy', 'true');
  }

  function render() {
    content.removeAttribute('aria-busy');
    renderTabCounts();

    if (watchlistState.failed) {
      chips.hidden = true;
      content.replaceChildren(UI.createState({
        kind: 'error',
        icon: navigator.onLine === false ? 'wifiOff' : 'alert',
        title: 'Couldn’t load your watchlist',
        text: watchlistState.failureMessage || 'Please try again.',
        actionLabel: 'Try again',
        actionIcon: 'refresh',
        onAction: () => fetchLibrary(true)
      }));
      if (summary) summary.textContent = '';
      return;
    }

    if (summary) {
      const total = watchlistState.entries.length;
      summary.textContent = total ? total + (total === 1 ? ' title saved' : ' titles saved') : '';
    }

    if (batchObserver) { batchObserver.disconnect(); batchObserver = null; }
    const query = watchlistState.query.trim().toLowerCase();
    const inStatusAll = watchlistState.entries.filter((e) => normalizeStatus(e.status) === watchlistState.status);
    const inStatus = query ? inStatusAll.filter((e) => String(e.title || '').toLowerCase().indexOf(query) !== -1) : inStatusAll;
    renderChips(inStatus);
    const dupes = duplicateNote();

    if (query && !inStatus.length) {
      content.replaceChildren(UI.createState({
        icon: 'search',
        title: 'No matches',
        text: 'Nothing in this tab matches “' + watchlistState.query.trim() + '”.',
        actionLabel: 'Clear filter',
        onAction: () => { watchlistState.query = ''; if (filterInput) filterInput.value = ''; render(); }
      }));
      return;
    }

    if (!inStatus.length) {
      const copy = EMPTY_COPY[watchlistState.status];
      content.replaceChildren(UI.createState({
        icon: 'bookmark',
        title: copy.title,
        text: copy.text,
        secondaryHref: 'discover.html',
        secondaryLabel: 'Discover titles'
      }));
      return;
    }

    if (watchlistState.category !== 'all') {
      const filtered = sortEntries(inStatus.filter((e) => categoryKey(e) === watchlistState.category));
      const grid = el('div', { class: 'grid' });
      content.replaceChildren(...(dupes ? [dupes] : []), grid);
      renderBatched(grid, filtered);
      return;
    }

    const sections = [];
    CATEGORIES.map((c) => c.value).concat('other').forEach((key) => {
      const items = sortEntries(inStatus.filter((e) => categoryKey(e) === key));
      if (!items.length) return;
      const title = key === 'other' ? 'Other' : (CATEGORIES.find((c) => c.value === key) || {}).plural;
      const row = el('div', { class: 'row' });
      const cards = items.slice(0, ROW_LIMIT).map(watchlistCard);
      row.append(...cards);
      UI.stagger(cards);
      window.enableDragScroll(row);
      sections.push(el('section', { class: 'section library-section' },
        el('div', { class: 'section-head' },
          el('h2', { class: 'section-title' }, title, el('span', { class: 'count-badge', text: String(items.length) })),
          el('button', {
            class: 'link-btn',
            attrs: { type: 'button', 'aria-label': 'See all ' + title },
            on: { click: () => selectCategory(key) }
          }, 'See all', icon('chevR', 16))
        ),
        row
      ));
    });
    content.replaceChildren(...(dupes ? [dupes] : []), ...sections);
  }

  watchlistState.render = render;

  async function fetchLibrary(showSkeleton) {
    if (showSkeleton) renderSkeleton();
    const result = await loadLibrary();
    if (result.success) {
      watchlistState.entries = result.items;
      watchlistState.loaded = true;
      watchlistState.failed = false;
    } else if (!watchlistState.loaded || showSkeleton) {
      watchlistState.failed = true;
      watchlistState.failureMessage = result.message;
    }
    render();
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      watchlistState.sort = sortSelect.value === 'title' || sortSelect.value === 'updated' ? sortSelect.value : 'added';
      writePref(SORT_KEY, watchlistState.sort);
      render();
    });
  }

  if (filterInput) {
    let timer = null;
    filterInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { watchlistState.query = filterInput.value; render(); }, 140);
    });
  }

  let renderQueued = false;
  window.addEventListener('orvion:progress-changed', () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  });

  window.addEventListener('orvion:watchlist-changed', () => fetchLibrary(false));
  window.addEventListener('pageshow', (event) => { if (event.persisted) fetchLibrary(false); });

  fetchLibrary(true);
}

// =============================================================================
// 9. PWA: SERVICE WORKER + INSTALL PROMPT
// =============================================================================
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let registration = null;
  let reloading = false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => { registration = reg; })
      .catch((error) => console.warn('Service worker registration failed:', error));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && registration) registration.update().catch(() => {});
  });

  // A new worker took control: offer a refresh instead of reloading under the user's feet.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // first install – nothing to refresh
    UI.showToast('Orvion was updated.', 'info', {
      actionLabel: 'Refresh',
      duration: 15000,
      onAction: () => { reloading = true; window.location.reload(); }
    });
  });
}

let installEvent = null;

function initInstallPrompt() {
  const button = $('installAppBtn');
  if (!button) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) { button.hidden = true; return; }

  const offer = (event) => {
    installEvent = event;
    button.hidden = false;
  };
  if (window.__orvionInstallEvent) offer(window.__orvionInstallEvent); // captured early by the page bootstrap
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); offer(event); });

  button.addEventListener('click', async () => {
    if (!installEvent) return;
    const promptEvent = installEvent;
    installEvent = null;
    button.hidden = true;
    promptEvent.prompt();
    try { await promptEvent.userChoice; } catch (e) { /* dismissed */ }
    window.__orvionInstallEvent = null;
  });

  window.addEventListener('appinstalled', () => {
    button.hidden = true;
    installEvent = null;
    UI.showToast('Orvion installed', 'success');
  });
}

function initConnectivityToasts() {
  window.addEventListener('offline', () => UI.showToast('You’re offline', 'info', { duration: 3200 }));
  window.addEventListener('online', () => UI.showToast('Back online', 'success'));
}

// =============================================================================
// 10. INIT
// =============================================================================
function initApp() {
  initAppearance();
  initServiceWorker();
  initInstallPrompt();
  initConnectivityToasts();

  const page = document.body.classList;
  if (page.contains('home-page')) initHome();
  else if (page.contains('watchlist-page')) initWatchlist();
  else if (page.contains('discover-page') || page.contains('search-page')) {
    // Refresh the library snapshot (cheap when it is fresh) so "already in your list" badges are accurate.
    const warm = () => { getLibraryCached().catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 1500);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();

window.showAddModal = showAddModal;
window.showItemDetails = showItemDetails;
window.openTracker = openTracker;
