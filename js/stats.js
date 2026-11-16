// js/stats.js – Statistics dashboard (ES module)
//
// Honesty rules
//   • Everything shown comes from the saved library (Firestore snapshot) or from TMDB metadata for those titles.
//   • "Completed" activity uses `completedAt`, which Orvion only records from the moment a title is moved to
//     Watched in this version. Older entries have no completion date and are never given a made-up one.
//   • Watch time is labelled as an estimate and only counts titles whose runtime is actually known:
//     watched movies, plus tracked episodes of series with a known episode runtime.
import {
  getLibraryCached,
  normalizeStatus,
  progressSummary,
  trackedEpisodeCount,
  STATUSES,
  CATEGORIES,
  categoryLabel
} from './watchlist.js';

const UI = window.OrvionUI;
const { el, icon } = UI;
const $ = (id) => document.getElementById(id);

const META_KEY = 'orvion:meta:v1';
const META_MAX_AGE = 60 * 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLORS = { plan: 'var(--st-plan)', watching: 'var(--st-watching)', watched: 'var(--st-watched)', dropped: 'var(--st-dropped)' };
const CATEGORY_COLORS = { movie: '#60a5fa', series: '#a78bfa', anime: '#f472b6', kdrama: '#fb923c', other: '#94a3b8' };

// ---------------------------------------------------------------------------
// Pure computation (exported for tests)
// ---------------------------------------------------------------------------

function tmdbType(entry) { return entry.category === 'movie' ? 'movie' : 'tv'; }
function metaKey(entry) { return tmdbType(entry) + ':' + entry.id; }

const STATUS_RANK = { watched: 4, watching: 3, dropped: 2, plan: 1 };

function entryScore(entry) {
  const hasProgress = entry.progress && typeof entry.progress === 'object' ? 1 : 0;
  return STATUS_RANK[normalizeStatus(entry.status)] * 10 + hasProgress * 2 + (entry.completedAt ? 1 : 0);
}

/**
 * Count each title once. If the same TMDB id + category was saved more than once (a data-entry accident), the most
 * advanced copy is kept (Watched > Watching > Dropped > Plan, then one with episode progress), so a finished title
 * is never hidden behind a newer "Plan to Watch" duplicate. Nothing is modified or deleted in the library.
 */
export function uniqueEntries(items) {
  const best = new Map();
  let duplicates = 0;
  (items || []).forEach((entry) => {
    const key = entry.id + ':' + entry.category;
    const current = best.get(key);
    if (!current) { best.set(key, entry); return; }
    duplicates += 1;
    if (entryScore(entry) > entryScore(current)) best.set(key, entry);
  });
  return { items: Array.from(best.values()), duplicates };
}

export function monthBuckets(count, now) {
  const base = new Date(now);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: MONTHS[d.getMonth()], year: d.getFullYear() });
  }
  return out;
}

export function computeStats(rawItems, meta, now) {
  const { items, duplicates } = uniqueEntries(rawItems);
  const metaMap = meta || {};
  const stats = {
    total: items.length,
    duplicates,
    byStatus: { plan: 0, watching: 0, watched: 0, dropped: 0 },
    byCategory: { movie: 0, series: 0, anime: 0, kdrama: 0, other: 0 },
    watchedByCategory: { movie: 0, series: 0, anime: 0, kdrama: 0, other: 0 },
    episodes: 0,
    titlesTracked: 0,
    finishedSeries: 0,
    inProgress: [],
    recentCompleted: [],
    completedWithDate: 0,
    watchedTotal: 0,
    addedByMonth: {},
    completedByMonth: {},
    addedByYear: {},
    completedByYear: {},
    genres: {},
    genreCoverage: 0,
    ratingCounts: [0, 0, 0, 0, 0],
    ratingSum: 0,
    rated: 0,
    time: { minutes: 0, movies: 0, episodes: 0, unknown: 0 }
  };

  items.forEach((entry) => {
    const status = normalizeStatus(entry.status);
    const category = CATEGORIES.some((c) => c.value === entry.category) ? entry.category : 'other';
    stats.byStatus[status] += 1;
    stats.byCategory[category] += 1;
    if (status === 'watched') { stats.watchedTotal += 1; stats.watchedByCategory[category] += 1; }

    const addedAt = Number(entry.added) || 0;
    if (addedAt) {
      const d = new Date(addedAt);
      const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      stats.addedByMonth[mk] = (stats.addedByMonth[mk] || 0) + 1;
      stats.addedByYear[d.getFullYear()] = (stats.addedByYear[d.getFullYear()] || 0) + 1;
    }
    const doneAt = Number(entry.completedAt) || 0;
    if (status === 'watched' && doneAt) {
      stats.completedWithDate += 1;
      const d = new Date(doneAt);
      const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      stats.completedByMonth[mk] = (stats.completedByMonth[mk] || 0) + 1;
      stats.completedByYear[d.getFullYear()] = (stats.completedByYear[d.getFullYear()] || 0) + 1;
      stats.recentCompleted.push(entry);
    }

    const stars = Math.round(Number(entry.rating) || 0);
    if (stars >= 1 && stars <= 5) { stats.ratingCounts[stars - 1] += 1; stats.ratingSum += stars; stats.rated += 1; }

    const summary = progressSummary(entry);
    const tracked = trackedEpisodeCount(entry);
    stats.episodes += tracked;
    if (summary && summary.total > 0) {
      stats.titlesTracked += 1;
      if (summary.completed && !summary.ongoing) stats.finishedSeries += 1;
      if (status === 'watching' && !summary.completed) stats.inProgress.push({ entry, summary });
    }

    // Metadata-based figures (genres, time) – only for titles whose TMDB metadata has been fetched
    const m = metaMap[metaKey(entry)];
    if (m && !m.x) {
      stats.genreCoverage += 1;
      (m.g || []).forEach((name) => { stats.genres[name] = (stats.genres[name] || 0) + 1; });
      if (status === 'watched' && category === 'movie') {
        if (m.r > 0) { stats.time.minutes += m.r; stats.time.movies += 1; } else stats.time.unknown += 1;
      }
      if (category !== 'movie' && tracked > 0) {
        if (m.r > 0) { stats.time.minutes += m.r * tracked; stats.time.episodes += tracked; } else stats.time.unknown += 1;
      }
    }
  });

  stats.recentCompleted.sort((a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0));
  stats.recentCompleted = stats.recentCompleted.slice(0, 6);
  stats.inProgress.sort((a, b) => b.summary.updated - a.summary.updated);
  stats.inProgress = stats.inProgress.slice(0, 5);
  stats.metaMissing = items.length - stats.genreCoverage;
  stats.items = items;
  stats.now = now;
  return stats;
}

export function activitySeries(stats, metric, period) {
  const now = stats.now || Date.now();
  if (period === 'year') {
    const source = metric === 'completed' ? stats.completedByYear : stats.addedByYear;
    const years = Object.keys(source).map(Number);
    const current = new Date(now).getFullYear();
    const first = years.length ? Math.max(Math.min.apply(null, years), current - 7) : current;
    const out = [];
    for (let y = first; y <= current; y += 1) out.push({ label: String(y), value: source[y] || 0 });
    return out;
  }
  const source = metric === 'completed' ? stats.completedByMonth : stats.addedByMonth;
  return monthBuckets(12, now).map((b) => ({ label: b.label, value: source[b.key] || 0, year: b.year }));
}

export const MILESTONES = [
  { key: 'saved', label: 'Titles saved', icon: 'bookmark', steps: [10, 50, 100, 250, 500, 1000], get: (s) => s.total },
  { key: 'watched', label: 'Titles watched', icon: 'check', steps: [1, 10, 25, 50, 100, 250, 500, 1000], get: (s) => s.watchedTotal },
  { key: 'episodes', label: 'Episodes tracked', icon: 'layers', steps: [10, 50, 100, 250, 500, 1000, 2500], get: (s) => s.episodes },
  { key: 'finished', label: 'Series finished (tracked)', icon: 'flag', steps: [1, 5, 10, 25, 50], get: (s) => s.finishedSeries },
  { key: 'categories', label: 'Categories watched', icon: 'sparkle', steps: [1, 2, 3, 4], get: (s) => ['movie', 'series', 'anime', 'kdrama'].filter((k) => s.watchedByCategory[k] > 0).length }
];

export function milestoneState(def, stats) {
  const value = def.get(stats);
  const reached = def.steps.filter((n) => value >= n);
  const next = def.steps.find((n) => value < n) || null;
  const prev = reached.length ? reached[reached.length - 1] : 0;
  return { value, reached: reached.length ? reached[reached.length - 1] : 0, next, pct: next ? Math.round(((value - prev) / (next - prev)) * 100) : 100 };
}

export function formatDuration(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return total + ' min';
  const hours = total / 60;
  if (hours < 100) return (Math.round(hours * 10) / 10) + ' h';
  const days = hours / 24;
  return UI.formatNumber(Math.round(hours)) + ' h' + (days >= 2 ? ' (~' + (Math.round(days * 10) / 10) + ' days)' : '');
}

// ---------------------------------------------------------------------------
// Metadata cache + background fetch (genres, runtimes)
// ---------------------------------------------------------------------------
let metaStore = {};

function loadMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    metaStore = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { metaStore = {}; }
}

function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(metaStore)); } catch (e) { /* quota – the analysis simply repeats next visit */ }
}

function metaIsFresh(m) {
  return m && Date.now() - Number(m.t || 0) < META_MAX_AGE;
}

let analyseToken = 0;

async function analyse(entries, onProgress) {
  const token = ++analyseToken;
  const queue = entries.filter((e) => !metaIsFresh(metaStore[metaKey(e)]));
  const total = queue.length;
  if (!total) return;
  let done = 0;
  let sinceSave = 0;
  let paused = false;

  const worker = async () => {
    while (queue.length && token === analyseToken) {
      if (navigator.onLine === false) return;
      if (paused) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      const entry = queue.shift();
      const result = await window.fetchTitleMeta(tmdbType(entry), entry.id);
      if (token !== analyseToken) return;
      if (result.ok) {
        metaStore[metaKey(entry)] = { g: result.data.genres, r: result.data.runtime, e: result.data.episodes, t: Date.now() };
      } else if (result.error && result.error.status === 404) {
        metaStore[metaKey(entry)] = { x: 1, t: Date.now() }; // title no longer exists on TMDB – stop retrying it
      } else if (result.error && (result.error.kind === 'rate' || result.error.kind === 'timeout')) {
        queue.push(entry);
        paused = true;
        setTimeout(() => { paused = false; }, 3000);
        continue;
      } else {
        // network / server problem: leave it for the next visit
      }
      done += 1;
      sinceSave += 1;
      if (sinceSave >= 20) { saveMeta(); sinceSave = 0; }
      onProgress(done, total);
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);
  saveMeta();
  if (token === analyseToken) onProgress(done, total, true);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function card(title, children, options) {
  const o = options || {};
  const node = el('section', { class: 'stat-card' + (o.wide ? ' wide' : '') + (o.extraClass ? ' ' + o.extraClass : ''), attrs: { 'aria-label': title } });
  node.style.setProperty('--i', String(o.index || 0));
  node.appendChild(el('h2', { class: 'stat-title' }, el('span', { text: title }), o.action || null));
  [].concat(children).forEach((child) => { if (child) node.appendChild(child); });
  return node;
}

function countUp(node, target) {
  if (UI.reducedMotion() || target < 2) { node.textContent = UI.formatNumber(target); return; }
  const start = performance.now();
  const duration = 700;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = UI.formatNumber(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function splitCard(title, rows, total, index) {
  const bar = el('div', { class: 'split-bar', attrs: { role: 'img', 'aria-label': rows.map((r) => r.label + ' ' + r.value).join(', ') } });
  const legend = el('ul', { class: 'legend' });
  rows.forEach((row) => {
    if (row.value > 0) {
      const seg = el('i', { attrs: { title: row.label + ': ' + row.value } });
      seg.style.flex = String(row.value);
      seg.style.setProperty('--c', row.color);
      bar.appendChild(seg);
    }
    const item = el('li', {},
      el('span', { class: 'legend-dot' }),
      el('span', { class: 'legend-name', text: row.label }),
      el('span', { class: 'legend-value', text: UI.formatNumber(row.value) }),
      el('span', { class: 'legend-pct', text: total ? Math.round((row.value / total) * 100) + '%' : '0%' })
    );
    item.firstChild.style.setProperty('--c', row.color);
    legend.appendChild(item);
  });
  return card(title, [bar, legend], { index });
}

function kpi(value, label) {
  return el('div', { class: 'kpi' }, el('div', { class: 'kpi-value', text: value }), el('div', { class: 'kpi-label', text: label }));
}

function activityCard(stats, index) {
  const state = { metric: stats.completedWithDate ? 'completed' : 'added', period: 'month' };
  const holder = el('div');
  const note = el('p', { class: 'stat-note' });

  const seg = (items, key) => {
    const wrap = el('div', { class: 'mini-seg', attrs: { role: 'group', 'aria-label': key === 'metric' ? 'Metric' : 'Period' } });
    items.forEach(([value, label]) => {
      const button = el('button', { text: label, attrs: { type: 'button', 'aria-pressed': state[key] === value ? 'true' : 'false' }, on: { click: () => { state[key] = value; wrap.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', items[i][0] === value ? 'true' : 'false')); draw(); } } });
      wrap.appendChild(button);
    });
    return wrap;
  };

  const tools = el('div', { class: 'chart-tools' }, seg([['completed', 'Completed'], ['added', 'Added']], 'metric'), seg([['month', '12 months'], ['year', 'Years']], 'period'));
  if (state.metric === 'added') tools.firstChild.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', i === 1 ? 'true' : 'false'));

  function draw() {
    const series = activitySeries(stats, state.metric, state.period);
    const max = Math.max(1, ...series.map((p) => p.value));
    const total = series.reduce((sum, p) => sum + p.value, 0);
    const bars = el('div', { class: 'bars', attrs: { role: 'img', 'aria-label': (state.metric === 'completed' ? 'Titles completed' : 'Titles added') + ' per ' + (state.period === 'year' ? 'year' : 'month') + ': ' + series.map((p) => p.label + ' ' + p.value).join(', ') } });
    series.forEach((point, i) => {
      const bar = el('div', { class: 'bar' + (point.value ? '' : ' empty') });
      bar.style.height = point.value ? Math.max(4, (point.value / max) * 100) + '%' : '3px';
      bar.style.setProperty('--i', String(i));
      bars.appendChild(el('div', { class: 'bar-col' },
        el('span', { class: 'bar-val', text: point.value ? String(point.value) : '' }),
        bar,
        el('span', { class: 'bar-label', text: point.label })
      ));
    });
    holder.replaceChildren(bars);
    if (state.metric === 'completed') {
      note.textContent = stats.completedWithDate
        ? total + ' completed in this view. ' + stats.completedWithDate + ' of ' + stats.watchedTotal + ' watched titles have a recorded completion date; older entries were saved without one, so they can’t be placed on this chart.'
        : 'Completion dates are recorded from the moment you mark a title as Watched. Your existing watched titles were saved without a date, so this chart fills in as you finish things. Switch to “Added” to see when you saved titles.';
    } else {
      note.textContent = total + ' titles added in this view, based on the date each one was saved.';
    }
  }
  draw();
  return card('Activity', [tools, holder, note], { wide: true, index });
}

function genresCard(stats, progress, index) {
  const body = [];
  if (progress && !progress.finished) {
    const track = UI.progressBar(progress.total ? (progress.done / progress.total) * 100 : 0);
    body.push(el('div', { class: 'analyse', attrs: { role: 'status' } }, el('span', { text: 'Reading genres… ' + progress.done + ' / ' + progress.total }), track));
  }
  const entries = Object.keys(stats.genres).map((name) => [name, stats.genres[name]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) {
    body.push(el('p', { class: 'empty-hint', text: progress && !progress.finished ? 'Genres will appear here as titles are analysed.' : 'No genre data yet.' }));
  } else {
    const max = entries[0][1];
    const list = el('div', { class: 'hbars' });
    entries.forEach(([name, count]) => {
      const track = UI.progressBar((count / max) * 100);
      list.appendChild(el('div', { class: 'hbar' }, el('span', { class: 'hbar-name', text: name }), track, el('span', { class: 'hbar-value', text: String(count) })));
    });
    body.push(list);
    body.push(el('p', { class: 'stat-note', text: 'Based on TMDB genres for ' + stats.genreCoverage + ' of ' + stats.total + ' titles. A title with several genres counts once in each.' }));
  }
  return card('Top genres', body, { index, extraClass: 'genres-card' });
}

function timeCard(stats, index) {
  const parts = [];
  if (stats.time.movies) parts.push(stats.time.movies + ' watched ' + (stats.time.movies === 1 ? 'movie' : 'movies'));
  if (stats.time.episodes) parts.push(UI.formatNumber(stats.time.episodes) + ' tracked episodes');
  const value = stats.time.minutes > 0 ? '≈ ' + formatDuration(stats.time.minutes) : '—';
  return card('Estimated watch time', [
    el('div', { class: 'hero-total', text: value, attrs: { style: 'font-size:clamp(1.8rem,7vw,2.4rem)' } }),
    el('p', { class: 'stat-note', text: stats.time.minutes > 0
      ? 'An estimate from TMDB runtimes: ' + parts.join(' + ') + '. Series marked Watched without episode tracking, and titles without a known runtime, aren’t included.'
      : 'Appears once runtimes are loaded. It counts watched movies and tracked episodes only.' })
  ], { index });
}

function milestonesCard(stats, index) {
  const grid = el('div', { class: 'milestones' });
  MILESTONES.forEach((def) => {
    const st = milestoneState(def, stats);
    const done = st.reached > 0;
    const node = el('div', { class: 'milestone' + (done ? ' done' : '') },
      el('span', { class: 'milestone-icon' }, icon(def.icon, 18)),
      el('div', {}, el('div', { class: 'milestone-name', text: UI.formatNumber(st.value) + ' ' + def.label.toLowerCase() }),
        el('div', { class: 'milestone-sub', text: st.next ? 'Next milestone: ' + UI.formatNumber(st.next) : 'All milestones reached' })),
      UI.progressBar(st.pct, { done: !st.next })
    );
    grid.appendChild(node);
  });
  return card('Milestones', [grid], { wide: true, index });
}

function ratingsCard(stats, index) {
  if (!stats.rated) return null;
  const average = stats.ratingSum / stats.rated;
  const max = Math.max(1, ...stats.ratingCounts);
  const list = el('div', { class: 'hbars' });
  for (let star = 5; star >= 1; star -= 1) {
    const count = stats.ratingCounts[star - 1];
    list.appendChild(el('div', { class: 'hbar' }, el('span', { class: 'hbar-name', text: star + ' ★' }), UI.progressBar((count / max) * 100), el('span', { class: 'hbar-value', text: String(count) })));
  }
  return card('Your ratings', [
    el('div', { class: 'rating-summary' },
      el('span', { class: 'hero-total', text: average.toFixed(1), attrs: { style: 'font-size:2.6rem' } }),
      el('span', { class: 'hero-caption', text: 'average from ' + stats.rated + (stats.rated === 1 ? ' rated title' : ' rated titles') })),
    list
  ], { index });
}

function recentCard(stats, index) {
  if (!stats.recentCompleted.length) {
    return card('Recently completed', [el('p', { class: 'empty-hint', text: 'Titles you mark as Watched from now on will show up here with their completion date.' })], { index });
  }
  const list = el('div', { class: 'recent-done' });
  stats.recentCompleted.forEach((entry) => {
    const type = tmdbType(entry);
    const poster = el('span', { class: 'recent-done-poster' });
    if (typeof entry.poster === 'string' && /^https:\/\//i.test(entry.poster)) {
      const img = el('img', { attrs: { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } });
      img.addEventListener('error', () => img.remove());
      img.src = entry.poster.replace('/t/p/w500/', '/t/p/w185/');
      poster.appendChild(img);
    }
    list.appendChild(el('button', { class: 'recent-done-item', attrs: { type: 'button', 'aria-label': 'Open ' + entry.title }, on: { click: () => { if (window.showItemDetails) window.showItemDetails(entry.id, type); } } },
      poster,
      el('span', {}, el('span', { class: 'recent-done-title', text: entry.title, attrs: { style: 'display:block' } }), el('span', { class: 'recent-done-sub', text: categoryLabel(entry.category), attrs: { style: 'display:block' } })),
      el('span', { class: 'recent-done-date', text: new Date(entry.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) })
    ));
  });
  return card('Recently completed', [list], { index });
}

function inProgressCard(stats, index) {
  if (!stats.inProgress.length) return null;
  const list = el('div', { class: 'hbars' });
  stats.inProgress.forEach(({ entry, summary }) => {
    list.appendChild(el('div', { class: 'hbar' },
      el('span', { class: 'hbar-name', text: entry.title }),
      UI.progressBar(summary.pct),
      el('span', { class: 'hbar-value', text: summary.pct + '%' })
    ));
  });
  return card('In progress', [list, el('p', { class: 'stat-note', text: 'Episode progress for the series you’re currently watching.' })], { index });
}

function render(root, stats, analysis) {
  const completion = stats.total ? (stats.watchedTotal / stats.total) * 100 : 0;
  const ring = UI.ring(completion, 112);
  ring.set(completion, false, Math.round(completion) + '%');
  const totalNode = el('div', { class: 'hero-total', text: '0', attrs: { 'aria-live': 'off' } });
  countUp(totalNode, stats.total);

  const hero = el('section', { class: 'stat-card stat-hero wide', attrs: { 'aria-label': 'Overview' } },
    ring.node,
    el('div', {}, totalNode,
      el('p', { class: 'hero-caption', text: 'titles saved' }),
      el('p', { class: 'hero-caption', text: UI.formatNumber(stats.watchedTotal) + ' watched · ' + UI.formatNumber(stats.byStatus.plan) + ' planned' }))
  );

  const statusRows = STATUSES.map((s) => ({ label: s.label, value: stats.byStatus[s.value], color: STATUS_COLORS[s.value] }));
  const categoryRows = CATEGORIES.map((c) => ({ label: c.plural, value: stats.byCategory[c.value], color: CATEGORY_COLORS[c.value] }));
  if (stats.byCategory.other) categoryRows.push({ label: 'Other', value: stats.byCategory.other, color: CATEGORY_COLORS.other });

  const episodes = card('Episodes', [
    el('div', { class: 'kpi-grid' },
      kpi(UI.formatNumber(stats.episodes), 'episodes tracked'),
      kpi(UI.formatNumber(stats.titlesTracked), 'series tracked'),
      kpi(UI.formatNumber(stats.finishedSeries), 'series finished'),
      kpi(UI.formatNumber(stats.byStatus.watching), 'watching now')
    ),
    el('p', { class: 'stat-note', text: 'Only episodes you marked in the tracker are counted – never guessed from a title’s status.' })
  ], { index: 3 });

  const timeNode = timeCard(stats, 4);
  const genreNode = genresCard(stats, analysis, 7);
  const nodes = [
    hero,
    splitCard('By status', statusRows, stats.total, 1),
    splitCard('By category', categoryRows, stats.total, 2),
    episodes,
    timeNode,
    inProgressCard(stats, 5),
    ratingsCard(stats, 5),
    activityCard(stats, 6),
    genreNode,
    recentCard(stats, 8),
    milestonesCard(stats, 9)
  ].filter(Boolean);

  const grid = el('div', { class: 'stats-grid' });
  nodes.forEach((n, i) => { n.style.setProperty('--i', String(i)); grid.appendChild(n); });
  const children = [];
  if (stats.duplicates) {
    children.push(el('p', { class: 'dupe-note', attrs: { role: 'note', style: 'margin:0' } },
      stats.duplicates + (stats.duplicates === 1 ? ' duplicate entry was' : ' duplicate entries were') + ' ignored in these numbers (same TMDB id and category). Nothing was changed in your library.'));
  }
  children.push(grid);
  root.replaceChildren(...children);
  return { time: timeNode, genre: genreNode };
}

function renderSkeleton(root) {
  root.replaceChildren(el('div', { class: 'stats-grid', attrs: { 'aria-hidden': 'true' } },
    ...Array.from({ length: 4 }, (_, i) => el('div', { class: 'stat-card' + (i === 0 ? ' wide' : '') }, el('div', { class: 'skeleton-block', attrs: { style: 'height:' + (i === 0 ? 112 : 90) + 'px;border-radius:16px' } })))));
}

async function init() {
  const root = $('statsRoot');
  if (!root || !UI) return;
  renderSkeleton(root);
  loadMeta();

  const load = async (force) => {
    if (force) renderSkeleton(root);
    const result = await getLibraryCached({ force: !!force, maxAge: 2 * 60 * 1000 });
    if (!result.success) {
      root.replaceChildren(UI.createState({
        kind: 'error',
        icon: navigator.onLine === false ? 'wifiOff' : 'alert',
        title: 'Couldn’t load your statistics',
        text: result.message || 'Please try again.',
        actionLabel: 'Try again',
        actionIcon: 'refresh',
        onAction: () => load(true)
      }));
      return;
    }
    if (!result.items.length) {
      root.replaceChildren(UI.createState({
        icon: 'chart',
        title: 'No statistics yet',
        text: 'Save a few movies or shows and your viewing stats will appear here.',
        secondaryHref: 'discover.html',
        secondaryLabel: 'Discover titles'
      }));
      return;
    }

    const { items } = uniqueEntries(result.items);
    let analysis = { done: 0, total: 0, finished: true };
    const handles = render(root, computeStats(result.items, metaStore, Date.now()), analysis);

    // While TMDB metadata streams in, only the two cards that depend on it are refreshed (no full re-render, no flicker).
    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        const fresh = computeStats(result.items, metaStore, Date.now());
        const genre = genresCard(fresh, analysis, 7);
        const time = timeCard(fresh, 4);
        [genre, time].forEach((node) => node.classList.add('noanim'));
        if (handles.genre.isConnected) handles.genre.replaceWith(genre);
        if (handles.time.isConnected) handles.time.replaceWith(time);
        handles.genre = genre;
        handles.time = time;
      }, 400);
    };
    await analyse(items, (done, total, finished) => {
      analysis = { done, total, finished: !!finished };
      if (finished || done % 12 === 0) redraw();
    });
    if (analysis.total) { analysis.finished = true; redraw(); }
  };

  await load(false);
  window.addEventListener('pagehide', () => { analyseToken += 1; saveMeta(); });
}

if (document.body && document.body.classList.contains('stats-page')) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
