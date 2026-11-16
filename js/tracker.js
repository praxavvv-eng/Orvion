// js/tracker.js – Episode tracker (ES module)
//
// Opens a bottom sheet for one watchlist entry (series / anime / K-drama): season selector, episode list,
// one-tap watched/unwatched, mark whole season, "watched up to here", next-episode card, overall progress.
//
// Data safety
//   • Progress lives in an optional `progress` map on the entry's EXISTING Firestore document (see js/watchlist.js).
//     No new documents or collections are created, so nothing can be duplicated or orphaned.
//   • Saves use field paths per season and are coalesced (rapid taps become one write) and retried on failure.
//   • Opening the tracker never writes. Only an explicit tap does.
import { saveProgress, progressSummary, normalizeStatus, statusLabel } from './watchlist.js';

const UI = window.OrvionUI;
const { el, icon, openModal, closeModal } = UI;

// ---------------------------------------------------------------------------
// Pure helpers (exported so they can be unit-tested without a browser)
// ---------------------------------------------------------------------------

export function localISODate(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * How many episodes of each season have aired, from TMDB's /tv/{id} response.
 * Specials (season 0) are returned too but never count towards completion.
 * Returns { seasons: [{ number, name, count, aired }], totals: { "1": 12 }, ongoing }.
 */
export function airedCounts(basics, today) {
  const now = today || localISODate();
  const status = String((basics && basics.status) || '');
  const ended = status === 'Ended' || status === 'Canceled';
  const last = basics && basics.last_episode_to_air;
  const lastSeason = last && Number(last.season_number) > 0 ? Number(last.season_number) : 0;
  const lastEpisode = last ? Number(last.episode_number) || 0 : 0;

  const seasons = [];
  const totals = {};
  (Array.isArray(basics && basics.seasons) ? basics.seasons : []).forEach((s) => {
    if (!s || !Number.isInteger(s.season_number) || s.season_number < 0) return;
    const number = s.season_number;
    const count = Number(s.episode_count) || 0;
    let aired;
    if (number === 0) aired = count;
    else if (ended) aired = count;
    else if (lastSeason) aired = number < lastSeason ? count : (number === lastSeason ? (lastEpisode ? Math.min(count, lastEpisode) : count) : 0);
    else aired = s.air_date && s.air_date <= now ? count : 0;
    if (count <= 0 && aired <= 0) return;
    seasons.push({ number, name: number === 0 ? 'Specials' : (s.name || 'Season ' + number), count, aired });
    if (number > 0) totals[String(number)] = aired;
  });
  seasons.sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number));
  return { seasons, totals, ongoing: !ended };
}

/** New watched map after marking everything up to (season, episode) – earlier regular seasons are completed in full. */
export function watchedUpTo(watched, totals, season, episode) {
  const next = {};
  Object.keys(watched || {}).forEach((k) => { next[k] = Array.isArray(watched[k]) ? watched[k].slice() : []; });
  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
  if (season > 0) {
    for (let s = 1; s < season; s += 1) {
      const aired = Number(totals && totals[String(s)]) || 0;
      if (aired > 0) next[String(s)] = range(aired);
    }
  }
  const cap = season > 0 ? (Number(totals && totals[String(season)]) || episode) : episode;
  const merged = new Set(next[String(season)] || []);
  range(Math.min(episode, cap)).forEach((n) => merged.add(n));
  next[String(season)] = Array.from(merged).sort((a, b) => a - b);
  return next;
}

// ---------------------------------------------------------------------------
// Save queue: coalesces taps per document and retries failures
// ---------------------------------------------------------------------------
const queues = new Map(); // docId -> { entry, touched:Set, status, timer, inflight, errored }
const listeners = new Set();
let saveState = 'idle';

function setSaveState(state) {
  saveState = state;
  listeners.forEach((fn) => fn(state));
}

function emitProgress(entry) {
  window.dispatchEvent(new CustomEvent('orvion:progress-changed', { detail: { docId: entry.docId } }));
}

function ensureProgress(entry) {
  if (!entry.progress || typeof entry.progress !== 'object') entry.progress = {};
  if (!entry.progress.watched || typeof entry.progress.watched !== 'object') entry.progress.watched = {};
  return entry.progress;
}

function queueFor(entry) {
  let q = queues.get(entry.docId);
  if (!q) {
    q = { entry, touched: new Set(), status: null, timer: null, inflight: false, errored: false };
    queues.set(entry.docId, q);
  }
  q.entry = entry;
  return q;
}

function scheduleSave(entry, seasons, status) {
  const q = queueFor(entry);
  (seasons || []).forEach((s) => q.touched.add(String(s)));
  if (status) q.status = status;
  clearTimeout(q.timer);
  q.timer = setTimeout(() => flush(entry.docId), 500);
  setSaveState('saving');
}

async function flush(docId) {
  const q = queues.get(docId);
  if (!q) return;
  clearTimeout(q.timer);
  q.timer = null;
  if (q.inflight) { q.timer = setTimeout(() => flush(docId), 250); return; }
  if (!q.touched.size && !q.status) return;

  const entry = q.entry;
  const progress = ensureProgress(entry);
  const touched = Array.from(q.touched);
  const status = q.status;
  q.touched.clear();
  q.status = null;
  q.inflight = true;

  const watched = {};
  touched.forEach((s) => { watched[s] = Array.isArray(progress.watched[s]) ? progress.watched[s] : []; });
  const change = { watched, totals: progress.totals || {}, ongoing: !!progress.ongoing };
  if (progress.last) change.last = progress.last;
  if (status) change.status = status;

  const result = await saveProgress(docId, change);
  q.inflight = false;

  if (!result.success) {
    touched.forEach((s) => q.touched.add(s));
    if (status) q.status = status;
    q.errored = true;
    setSaveState('error');
    UI.showToast(result.message || 'Couldn’t save progress', 'error', {
      actionLabel: 'Retry',
      onAction: () => flush(docId)
    });
    return;
  }

  q.errored = false;
  if (result.completedAt) entry.completedAt = result.completedAt;
  if (q.touched.size || q.status) flush(docId);
  else setSaveState('saved');
}

function flushAll() {
  queues.forEach((q, docId) => { if (q.touched.size || q.status) flush(docId); });
}

window.addEventListener('online', flushAll);
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

// ---------------------------------------------------------------------------
// Quick action for cards: mark the next episode watched without opening the sheet
// ---------------------------------------------------------------------------
export function markNextEpisode(entry) {
  const summary = progressSummary(entry);
  if (!summary || !summary.next) return null;
  const { s, e } = summary.next;
  const progress = ensureProgress(entry);
  const key = String(s);
  const list = new Set(Array.isArray(progress.watched[key]) ? progress.watched[key] : []);
  list.add(e);
  progress.watched[key] = Array.from(list).sort((a, b) => a - b);
  progress.last = { s, e };
  progress.updated = Date.now();
  let status = null;
  if (normalizeStatus(entry.status) === 'plan') { entry.status = 'watching'; status = 'watching'; }
  scheduleSave(entry, [key], status);
  emitProgress(entry);
  return { marked: { s, e }, summary: progressSummary(entry) };
}

export function canTrack(entry) {
  return !!(entry && entry.docId && entry.category && entry.category !== 'movie');
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------
const basicsCache = new Map(); // tmdb id -> { time, data }
const seasonCache = new Map(); // "id:season" -> season payload
const BASICS_TTL = 10 * 60 * 1000;

let refs = null;
const ctx = {
  token: 0,
  entry: null,
  seasons: [],
  totals: {},
  ongoing: false,
  season: 1,
  episodes: [],
  rows: new Map(),
  offlineSeason: false,
  abort: null,
  promptedDone: false
};

function ensureSheet() {
  if (refs) return refs;
  const { root, sheet } = UI.createSheetRoot('trackerModal', 'trackerTitle', 'tracker');
  const closeBtn = el('button', {
    class: 'tracker-close icon-btn',
    attrs: { type: 'button', 'aria-label': 'Close episode tracker' },
    on: { click: () => closeModal(root) }
  }, icon('close', 20));

  const backdrop = el('div', { class: 'tracker-backdrop', attrs: { 'aria-hidden': 'true' } });
  const posterBox = el('div', { class: 'tracker-poster' });
  const title = el('h2', { class: 'tracker-title', attrs: { id: 'trackerTitle' } });
  const meta = el('p', { class: 'tracker-meta' });
  const save = el('p', { class: 'tracker-save', attrs: { role: 'status', 'aria-live': 'polite' } });
  const top = el('div', { class: 'tracker-top' }, backdrop, el('div', { class: 'tracker-head' }, posterBox, el('div', { style: 'min-width:0' }, title, meta, save)));
  const body = el('div', { class: 'tracker-scroll' });
  sheet.append(closeBtn, top, body);

  listeners.add((state) => { save.dataset.state = state === 'idle' ? '' : state; });
  refs = { root, sheet, posterBox, title, meta, body, save, backdrop };
  return refs;
}

function getBasics(id, signal) {
  const cached = basicsCache.get(id);
  if (cached && Date.now() - cached.time < BASICS_TTL) return Promise.resolve(cached.data);
  return window.fetchTVBasics(id, { signal }).then((data) => {
    if (data) basicsCache.set(id, { time: Date.now(), data });
    return data;
  });
}

function watchedOf(season) {
  const progress = ctx.entry.progress;
  const list = progress && progress.watched && progress.watched[String(season)];
  return Array.isArray(list) ? list : [];
}

/** Summary that includes totals discovered this session, without touching the entry until the user marks something. */
function summaryNow() {
  const progress = ctx.entry.progress || {};
  return progressSummary({ progress: { watched: progress.watched || {}, totals: ctx.totals, ongoing: ctx.ongoing, updated: progress.updated } });
}

function seasonLabel(s) {
  return s.number === 0 ? 'Specials' : 'S' + s.number;
}

function formatAir(date) {
  if (!date) return '';
  try { return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return date; }
}

function isAired(ep) {
  if (ep.air_date) return ep.air_date <= localISODate();
  return !ctx.ongoing;
}

// ----- header -----
function renderTop() {
  const r = refs;
  const summary = summaryNow();
  const entry = ctx.entry;
  r.title.textContent = entry.title || 'Untitled';
  const parts = [statusLabel(entry.status)];
  if (ctx.seasons.length) parts.push(ctx.ongoing ? 'Ongoing' : 'Finished');
  if (summary && summary.total) parts.push(summary.watched + ' of ' + summary.total + ' episodes');
  r.meta.textContent = parts.join(' · ');
}

function renderPoster() {
  const r = refs;
  r.posterBox.replaceChildren();
  r.backdrop.replaceChildren();
  const poster = typeof ctx.entry.poster === 'string' && /^https:\/\//i.test(ctx.entry.poster) ? ctx.entry.poster.replace('/t/p/w500/', '/t/p/w185/') : '';
  if (poster) {
    const img = el('img', { attrs: { alt: '', decoding: 'async', draggable: 'false' } });
    img.addEventListener('error', () => img.remove());
    img.src = poster;
    r.posterBox.appendChild(img);
  }
}

function setBackdrop(path) {
  if (!path || !refs) return;
  const img = el('img', { attrs: { alt: '', decoding: 'async', draggable: 'false' } });
  img.addEventListener('load', () => img.classList.add('loaded'));
  img.addEventListener('error', () => img.remove());
  img.src = window.tmdbImage(path, 'w780');
  refs.backdrop.replaceChildren(img);
}

// ----- summary: ring + three figures that answer "how far am I?" at a glance -----
function renderSummary() {
  const summary = summaryNow();
  const done = !!(summary && summary.completed);
  nodes.ring.set(summary ? summary.pct : 0, done);
  const watched = summary ? summary.watched : 0;
  const left = summary ? Math.max(0, summary.total - summary.watched) : 0;
  const info = seasonInfo(ctx.season);
  const seasonAired = info ? (info.number === 0 ? ctx.episodes.length : info.aired) : 0;
  const seasonDone = info ? watchedOf(ctx.season).filter((n) => info.number === 0 || n <= seasonAired).length : 0;
  nodes.figs.watched.textContent = String(watched);
  nodes.figs.left.textContent = String(left);
  nodes.figs.season.textContent = seasonDone + '/' + seasonAired;
  nodes.figs.seasonLabel.textContent = info && info.number === 0 ? 'Specials' : 'Season ' + ctx.season;
}

// ----- next card -----
function nextEpisodeName(next) {
  if (!next || next.s !== ctx.season) return '';
  const ep = ctx.episodes.find((x) => x.episode_number === next.e);
  return ep && ep.name ? ep.name : '';
}

function renderNext(container) {
  const summary = summaryNow();
  container.replaceChildren();
  container.className = 'tracker-next';
  if (!summary || !summary.total) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  if (summary.next) {
    const next = summary.next;
    const name = nextEpisodeName(next);
    container.append(
      el('div', { class: 'tracker-next-text' },
        el('div', { class: 'tracker-next-eyebrow', text: summary.watched ? 'Up next' : 'Start with' }),
        el('div', { class: 'tracker-next-title', text: 'S' + next.s + ' · E' + next.e }),
        name ? el('div', { class: 'tracker-next-sub', text: name }) : null
      ),
      el('button', { class: 'btn btn-primary', attrs: { type: 'button' }, on: { click: () => markEpisode(next.s, next.e, true) } }, icon('check', 18), 'Watched')
    );
  } else {
    container.classList.add('done');
    container.append(
      el('div', { class: 'tracker-next-text' },
        el('div', { class: 'tracker-next-eyebrow', text: summary.completed ? 'All caught up' : 'Nothing aired yet' }),
        el('div', { class: 'tracker-next-title', text: summary.completed ? (ctx.ongoing ? 'Waiting for new episodes' : 'Series complete') : 'Check back soon' })
      ),
      icon(summary.completed ? 'check' : 'clock', 30)
    );
  }
}

// ----- season tiles -----
function renderTabs(container) {
  container.replaceChildren();
  ctx.seasons.forEach((s) => {
    const done = watchedOf(s.number).filter((n) => s.number === 0 || n <= Math.max(s.aired, 0)).length;
    const aired = s.number === 0 ? 0 : s.aired;
    const complete = s.number > 0 && aired > 0 && done >= aired;
    const active = s.number === ctx.season;
    const name = el('span', { class: 'st-name' }, el('span', { text: seasonLabel(s) }), complete ? icon('check', 14) : null);
    const tile = el('button', {
      class: 'season-tile',
      attrs: { type: 'button', 'aria-pressed': active ? 'true' : 'false', 'aria-label': s.name + (aired ? ', ' + done + ' of ' + aired + ' watched' : '') + (complete ? ', completed' : '') },
      on: { click: () => selectSeason(s.number) }
    }, name, UI.progressBar(aired ? Math.round((done / aired) * 100) : 0, { done: complete }));
    container.appendChild(tile);
  });
  const activeTile = container.querySelector('.season-tile[aria-pressed="true"]');
  if (activeTile) activeTile.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
}

// ----- season panel -----
function seasonInfo(number) {
  return ctx.seasons.find((s) => s.number === number);
}

function updateRows() {
  const watched = new Set(watchedOf(ctx.season));
  const summary = summaryNow();
  const next = summary && summary.next;
  ctx.rows.forEach((row, number) => {
    const on = watched.has(number);
    const isNext = !!(next && next.s === ctx.season && next.e === number);
    row.classList.toggle('watched', on);
    row.classList.toggle('next', isNext);
    row.setAttribute('aria-pressed', on ? 'true' : 'false');
    const meta = row.querySelector('.ep-meta');
    const tag = meta && meta.querySelector('.ep-tag');
    if (meta && isNext && !tag) meta.prepend(el('span', { class: 'ep-tag', text: 'Up next' }));
    else if (tag && !isNext) tag.remove();
  });
}

function renderSeasonHeader(container) {
  container.replaceChildren();
  const info = seasonInfo(ctx.season);
  if (!info) return;
  const aired = info.number === 0 ? ctx.episodes.length : info.aired;
  const done = watchedOf(ctx.season).filter((n) => info.number === 0 || n <= aired).length;
  const complete = aired > 0 && done >= aired;
  const pct = aired ? Math.round((done / aired) * 100) : 0;

  const sub = [done + ' of ' + aired + ' watched'];
  if (aired > done) sub.push((aired - done) + ' left');
  if (info.number > 0 && info.count > info.aired) sub.push((info.count - info.aired) + ' not aired');

  const action = el('button', {
    class: 'btn btn-glass',
    attrs: { type: 'button' },
    on: { click: () => markSeason(ctx.season, !complete) }
  }, icon(complete ? 'undo' : 'check', 16), complete ? 'Clear' : 'Mark all');
  if (!aired) action.disabled = true;

  container.append(
    el('div', { class: 'season-head' },
      el('div', { class: 'season-info' }, el('div', { class: 'season-name', text: info.name }), el('div', { class: 'season-sub', text: sub.join(' · ') })),
      el('div', { class: 'season-actions' }, action)
    ),
    el('div', { class: 'season-progress' }, UI.progressBar(pct, { done: complete }))
  );
}

function buildRow(ep) {
  const number = ep.episode_number;
  const aired = isAired(ep);
  const name = ep.name || 'Episode ' + number;
  const metaBits = [];
  if (ep.air_date) metaBits.push(aired ? formatAir(ep.air_date) : 'Airs ' + formatAir(ep.air_date));
  else if (!aired) metaBits.push('Not announced');
  if (ep.runtime) metaBits.push(ep.runtime + ' min');

  const row = el('div', {
    class: 'ep-row' + (aired ? '' : ' unaired'),
    attrs: { role: 'button', tabindex: aired ? '0' : '-1', 'aria-pressed': 'false', 'aria-label': 'Episode ' + number + ': ' + name + (aired ? '' : ' (not aired yet)') },
    data: { ep: number }
  },
    el('span', { class: 'ep-num', text: String(number) }),
    el('span', { class: 'ep-text' }, el('span', { class: 'ep-title', text: name, attrs: { style: 'display:block' } }), el('span', { class: 'ep-meta', text: metaBits.join(' · '), attrs: { style: 'display:block' } })),
    el('span', { class: 'ep-check', attrs: { 'aria-hidden': 'true' } }, el('span', {}, icon(aired ? 'check' : 'lock', aired ? 16 : 14)))
  );

  const activate = (event) => {
    if (!aired) { UI.showToast(ep.air_date ? 'Airs ' + formatAir(ep.air_date) : 'This episode hasn’t aired yet', 'info'); return; }
    if (event && event.shiftKey) { markUpTo(ctx.season, number); return; }
    markEpisode(ctx.season, number);
  };
  row.addEventListener('click', activate);
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
  });
  if (aired) UI.attachLongPress(row, () => markUpTo(ctx.season, number));
  return row;
}

// Layout nodes of the scrolling body (created per open)
let nodes = null;

function paintAll() {
  if (!nodes) return;
  renderTop();
  renderSummary();
  renderNext(nodes.next);
  renderTabs(nodes.tabs);
  renderSeasonHeader(nodes.seasonHead);
  updateRows();
}

async function loadSeasonView(number, token) {
  const info = seasonInfo(number);
  nodes.list.replaceChildren(...Array.from({ length: Math.min(info ? Math.max(info.count, 3) : 6, 8) }, () => el('div', { class: 'ep-skeleton', attrs: { 'aria-hidden': 'true' } })));
  nodes.note.hidden = true;
  ctx.rows.clear();

  const cacheKey = ctx.entry.id + ':' + number;
  let season = seasonCache.get(cacheKey);
  if (!season) {
    if (ctx.abort) ctx.abort.abort();
    ctx.abort = new AbortController();
    const result = await window.fetchSeason(ctx.entry.id, number, { signal: ctx.abort.signal });
    if (token !== ctx.token || number !== ctx.season) return;
    if (result.ok) {
      season = result.season;
      seasonCache.set(cacheKey, season);
    }
  }
  if (token !== ctx.token || number !== ctx.season) return;

  let episodes;
  ctx.offlineSeason = false;
  if (season && Array.isArray(season.episodes) && season.episodes.length) {
    episodes = season.episodes.filter((e) => e && Number.isInteger(e.episode_number) && e.episode_number > 0);
  } else {
    const count = info ? (info.aired || info.count) : 0;
    if (!count) {
      nodes.list.replaceChildren(UI.createState({ compact: true, icon: 'film', title: 'No episodes listed yet', text: 'TMDB has no episodes for this season.' }));
      ctx.episodes = [];
      renderSeasonHeader(nodes.seasonHead);
      return;
    }
    ctx.offlineSeason = true;
    episodes = Array.from({ length: count }, (_, i) => ({ episode_number: i + 1, name: 'Episode ' + (i + 1), air_date: '1970-01-01' }));
  }
  ctx.episodes = episodes;

  // Exact aired count for this season (the show-level count is an estimate for ongoing series).
  if (number > 0 && !ctx.offlineSeason) {
    const airedNow = episodes.filter(isAired).length;
    if (info && info.aired !== airedNow) { info.aired = airedNow; ctx.totals[String(number)] = airedNow; }
  }

  nodes.list.replaceChildren(...episodes.map((ep) => {
    const row = buildRow(ep);
    ctx.rows.set(ep.episode_number, row);
    return row;
  }));
  UI.stagger(Array.from(nodes.list.children));
  nodes.note.hidden = !ctx.offlineSeason;
  if (ctx.offlineSeason) nodes.note.textContent = 'Episode titles couldn’t be loaded, so episodes are shown by number. Your progress still saves normally.';
  paintAll();

  // Bring the episode you are about to watch into view (only when it is in this season and off-screen).
  const summary = summaryNow();
  const target = summary && summary.next && summary.next.s === number ? ctx.rows.get(summary.next.e) : null;
  if (target && refs && !ctx.scrolled) {
    ctx.scrolled = true;
    requestAnimationFrame(() => {
      const box = refs.body.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      if (r.bottom > box.bottom - 40 || r.top < box.top) refs.body.scrollTo({ top: refs.body.scrollTop + (r.top - box.top) - box.height * 0.35, behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
    });
  }
}

function selectSeason(number) {
  if (!nodes || number === ctx.season && nodes.list.children.length) return;
  ctx.season = number;
  renderTabs(nodes.tabs);
  void loadSeasonView(number, ctx.token);
}

// ----- mutations -----
function finishChange(seasons) {
  const entry = ctx.entry;
  const progress = ensureProgress(entry);
  progress.totals = Object.assign({}, progress.totals || {}, ctx.totals);
  progress.ongoing = ctx.ongoing;
  progress.updated = Date.now();

  let status = null;
  const summary = summaryNow();
  if (summary && summary.watched > 0 && normalizeStatus(entry.status) === 'plan') { entry.status = 'watching'; status = 'watching'; }
  scheduleSave(entry, seasons, status);
  paintAll();
  emitProgress(entry);

  if (summary && summary.completed && !ctx.ongoing && normalizeStatus(entry.status) !== 'watched') {
    if (!ctx.promptedDone) {
      ctx.promptedDone = true;
      UI.showToast('You’ve finished every episode', 'success', {
        duration: 7000,
        actionLabel: 'Mark as Watched',
        onAction: () => {
          entry.status = 'watched';
          entry.completedAt = Date.now();
          scheduleSave(entry, [], 'watched');
          paintAll();
          emitProgress(entry);
        }
      });
    }
  } else if (!summary || !summary.completed) {
    ctx.promptedDone = false;
  }
}

function markEpisode(season, episode, jump) {
  const progress = ensureProgress(ctx.entry);
  const key = String(season);
  const set = new Set(watchedOf(season));
  const adding = !set.has(episode);
  if (adding) set.add(episode); else set.delete(episode);
  progress.watched[key] = Array.from(set).sort((a, b) => a - b);
  if (adding) progress.last = { s: season, e: episode };
  if (jump && season !== ctx.season) {
    ctx.season = season;
    void loadSeasonView(season, ctx.token);
  }
  UI.haptic(adding ? 10 : 6);
  finishChange([key]);

  // Marked something ahead of unwatched aired episodes? Offer to fill the gap in one tap.
  if (adding && season > 0) {
    const have = new Set(watchedOf(season));
    const aired = Number(ctx.totals[key]) || 0;
    let gap = 0;
    for (let e = 1; e < Math.min(episode, aired + 1); e += 1) if (!have.has(e)) gap += 1;
    if (gap > 0) {
      UI.showToast(gap + (gap === 1 ? ' earlier episode is' : ' earlier episodes are') + ' still unwatched', 'info', {
        duration: 6000,
        actionLabel: 'Mark them',
        onAction: () => markUpTo(season, episode)
      });
    }
  }
}

function snapshotWatched() {
  const copy = {};
  const map = ensureProgress(ctx.entry).watched;
  Object.keys(map).forEach((k) => { copy[k] = Array.isArray(map[k]) ? map[k].slice() : []; });
  return copy;
}

function restoreWatched(snapshot, seasons) {
  const progress = ensureProgress(ctx.entry);
  seasons.forEach((s) => { progress.watched[s] = (snapshot[s] || []).slice(); });
  finishChange(seasons);
}

function markSeason(season, on) {
  const info = seasonInfo(season);
  if (!info) return;
  const before = snapshotWatched();
  const progress = ensureProgress(ctx.entry);
  const key = String(season);
  const aired = season === 0 ? ctx.episodes.length : info.aired;
  progress.watched[key] = on ? Array.from({ length: aired }, (_, i) => i + 1) : [];
  if (on && aired) progress.last = { s: season, e: aired };
  finishChange([key]);
  UI.showToast(on ? info.name + ' marked as watched' : info.name + ' cleared', 'success', {
    duration: 5000,
    actionLabel: 'Undo',
    onAction: () => restoreWatched(before, [key])
  });
}

function markUpTo(season, episode) {
  const before = snapshotWatched();
  const progress = ensureProgress(ctx.entry);
  const next = watchedUpTo(progress.watched, ctx.totals, season, episode);
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k] || []));
  if (!changed.length) { UI.showToast('Already marked', 'info'); return; }
  progress.watched = next;
  progress.last = { s: season, e: episode };
  finishChange(changed);
  UI.showToast('Marked up to ' + (season === 0 ? 'Special ' : 'S' + season + ' · E') + episode, 'success', {
    duration: 6000,
    actionLabel: 'Undo',
    onAction: () => restoreWatched(before, changed)
  });
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------
function renderBodyShell() {
  const ring = UI.ring(0, 96);
  const fig = (label) => {
    const value = el('div', { class: 'fig-value', text: '0' });
    const caption = el('div', { class: 'fig-label', text: label });
    return { node: el('div', { class: 'fig' }, value, caption), value, caption };
  };
  const watched = fig('Watched');
  const left = fig('Left');
  const season = fig('Season');
  const summary = el('div', { class: 'tracker-summary' }, ring.node, el('div', { class: 'tracker-figs' }, watched.node, left.node, season.node));
  const next = el('div', { class: 'tracker-next', attrs: { hidden: true } });
  const tabs = el('div', { class: 'season-strip', attrs: { role: 'group', 'aria-label': 'Seasons' } });
  const seasonHead = el('div');
  const tip = el('p', { class: 'season-tip', text: 'Tip: long-press an episode (or Shift-click) to mark everything up to it.' });
  const note = el('p', { class: 'tracker-note', attrs: { hidden: true } });
  const list = el('div', { class: 'ep-list' });
  refs.body.replaceChildren(summary, next, tabs, seasonHead, tip, note, list);
  nodes = { summary, ring, figs: { watched: watched.value, left: left.value, season: season.value, seasonLabel: season.caption }, next, tabs, seasonHead, list, note };
}

function renderFailure(entry) {
  refs.body.replaceChildren(UI.createState({
    kind: 'error',
    icon: navigator.onLine === false ? 'wifiOff' : 'alert',
    title: 'Couldn’t load episodes',
    text: navigator.onLine === false ? 'You’re offline, and no episode list is saved for this title yet.' : 'The movie database did not respond.',
    actionLabel: 'Try again',
    actionIcon: 'refresh',
    onAction: () => { void openTracker(entry); }
  }));
  nodes = null;
}

export async function openTracker(entry) {
  if (!canTrack(entry)) {
    UI.showToast('Episode tracking is available for series, anime and K-dramas in your list.', 'info');
    return;
  }
  const r = ensureSheet();
  if (ctx.abort) ctx.abort.abort();
  const token = ++ctx.token;
  Object.assign(ctx, { entry, seasons: [], totals: {}, ongoing: false, season: 1, episodes: [], offlineSeason: false, promptedDone: false, scrolled: false });
  ctx.rows.clear();
  ctx.abort = null;

  renderPoster();
  r.title.textContent = entry.title || 'Untitled';
  r.meta.textContent = 'Loading episodes…';
  r.body.replaceChildren(el('div', { class: 'ep-list', attrs: { style: 'margin-top:20px' } }, ...Array.from({ length: 6 }, () => el('div', { class: 'ep-skeleton', attrs: { 'aria-hidden': 'true' } }))));
  nodes = null;
  openModal(r.root, { initialFocus: '.tracker-close', onClose: onClosed });

  ctx.abort = new AbortController();
  const basics = await getBasics(entry.id, ctx.abort.signal);
  if (token !== ctx.token) return;

  if (basics) {
    setBackdrop(basics.backdrop_path || basics.poster_path);
    const counts = airedCounts(basics);
    ctx.seasons = counts.seasons;
    ctx.totals = counts.totals;
    ctx.ongoing = counts.ongoing;
  } else if (entry.progress && entry.progress.totals && Object.keys(entry.progress.totals).length) {
    // Offline: rebuild the season list from what was saved last time.
    ctx.totals = Object.assign({}, entry.progress.totals);
    ctx.ongoing = !!entry.progress.ongoing;
    ctx.seasons = Object.keys(ctx.totals).map(Number).sort((a, b) => a - b).map((n) => ({ number: n, name: 'Season ' + n, count: ctx.totals[String(n)], aired: ctx.totals[String(n)] }));
  }

  if (!ctx.seasons.length) { renderFailure(entry); return; }

  renderBodyShell();
  const summary = summaryNow();
  const lastSeason = entry.progress && entry.progress.last ? entry.progress.last.s : 0;
  const preferred = (summary && summary.next && summary.next.s) || lastSeason || ctx.seasons[0].number;
  ctx.season = ctx.seasons.some((s) => s.number === preferred) ? preferred : ctx.seasons[0].number;
  paintAll();
  await loadSeasonView(ctx.season, token);
}

function onClosed() {
  if (ctx.abort) ctx.abort.abort();
  flushAll();
  if (ctx.entry) emitProgress(ctx.entry);
}

