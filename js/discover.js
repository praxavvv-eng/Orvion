// js/discover.js – single owner of the Discover page (ES module).
// Requests always settle into a visible success, empty, or retry state; filters never leave a skeleton stuck.
const UI = window.OrvionUI;
const $ = (id) => document.getElementById(id);

const SORT_LABELS = { popular: 'Popular', top: 'Top rated', new: 'Newest' };
const TYPE_LABELS = { movie: 'Movies', tv: 'TV Series' };

const state = {
  type: 'movie',
  genre: '',
  sort: 'popular',
  page: 1,
  totalPages: 1,
  loading: false,
  done: false,
  token: 0,
  abort: null,
  seen: new Set(),
  genres: [],
  genreToken: 0
};

let els = {};

function errorText(error) {
  if (typeof window.describeTMDBError === 'function') return window.describeTMDBError(error);
  if (navigator.onLine === false) return 'You’re offline. Reconnect and try again.';
  return 'The movie database did not respond. Please try again.';
}

// URL hash (#movie | #tv/28/top) – refresh/share restores the view.
function readHash() {
  let raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (error) { raw = ''; }
  const [type, genre, sort] = raw.split('/');
  if (type === 'movie' || type === 'tv') state.type = type;
  if (genre && /^\d+$/.test(genre)) state.genre = genre;
  if (sort && SORT_LABELS[sort]) state.sort = sort;
}

function writeHash() {
  const parts = [state.type];
  if (state.genre || state.sort !== 'popular') parts.push(state.genre || '0');
  if (state.sort !== 'popular') parts.push(state.sort);
  history.replaceState(null, '', location.pathname + location.search + '#' + parts.join('/'));
}

function genreName() {
  const match = state.genres.find((genre) => String(genre.id) === String(state.genre));
  return match ? match.name : '';
}

function renderSummary() {
  if (els.summaryText) {
    const parts = [TYPE_LABELS[state.type]];
    if (state.genre && genreName()) parts.push(genreName());
    if (state.sort !== 'popular') parts.push(SORT_LABELS[state.sort]);
    els.summaryText.textContent = parts.join(' · ');
  }
  if (els.clear) els.clear.hidden = !(state.genre || state.sort !== 'popular');
}

function renderGenreChips() {
  if (!els.genres) return;
  const chips = els.genres;
  chips.replaceChildren();
  if (!state.genres.length) { chips.hidden = true; return; }
  chips.hidden = false;

  const make = (value, label) => {
    const active = String(state.genre) === String(value);
    const chip = UI.el('button', {
      class: 'chip' + (active ? ' active' : ''),
      text: label,
      attrs: { type: 'button', 'aria-pressed': active ? 'true' : 'false' },
      on: { click: () => {
        if (String(state.genre) === String(value)) return;
        state.genre = value ? String(value) : '';
        applyFilters();
      } }
    });
    chips.appendChild(chip);
  };

  make('', 'All');
  state.genres.forEach((genre) => make(genre.id, genre.name));
  const active = chips.querySelector('.chip.active');
  if (active && chips.scrollWidth > chips.clientWidth) {
    active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  }
}

async function loadGenres() {
  const token = ++state.genreToken;
  const type = state.type;
  try {
    if (typeof window.fetchGenres !== 'function') throw new Error('Genre API is unavailable.');
    const genres = await window.fetchGenres(type);
    if (token !== state.genreToken || type !== state.type) return;
    state.genres = Array.isArray(genres) ? genres.filter((genre) => genre && genre.id && genre.name) : [];
    if (state.genre && !state.genres.some((genre) => String(genre.id) === String(state.genre)) && state.genres.length) {
      state.genre = '';
      writeHash();
      resetAndLoad();
    }
    renderGenreChips();
    renderSummary();
  } catch (error) {
    if (token !== state.genreToken) return;
    state.genres = [];
    renderGenreChips();
    renderSummary();
    console.warn('Discover genres could not load:', error);
  }
}

function applyFilters() {
  writeHash();
  renderGenreChips();
  renderSummary();
  resetAndLoad();
}

function showGridState(node) {
  els.grid.replaceChildren(node);
  els.grid.classList.add('has-state');
}

function setFooter(mode, retry) {
  if (!els.footer) return;
  els.footer.replaceChildren();
  els.footer.hidden = mode === 'none';
  if (mode === 'loading') {
    els.footer.appendChild(UI.el('div', { class: 'loader', attrs: { role: 'status', 'aria-label': 'Loading more' } }));
  } else if (mode === 'end') {
    els.footer.appendChild(UI.el('p', { class: 'footer-note', text: 'You’ve reached the end' }));
  } else if (mode === 'error') {
    els.footer.appendChild(UI.createState({
      kind: 'error', compact: true, icon: 'alert', title: 'Couldn’t load more',
      text: errorText(state.lastError), actionLabel: 'Try again', actionIcon: 'refresh', onAction: retry
    }));
  }
}

function showFirstPageError(error) {
  if (els.grid) els.grid.removeAttribute('aria-busy');
  state.lastError = error;
  showGridState(UI.createState({
    kind: 'error',
    icon: navigator.onLine === false ? 'wifiOff' : 'alert',
    title: 'Couldn’t load titles',
    text: errorText(error),
    actionLabel: 'Try again',
    actionIcon: 'refresh',
    onAction: resetAndLoad
  }));
  setFooter('none');
}

function resetAndLoad() {
  if (state.abort) state.abort.abort();
  state.token += 1;
  state.page = 1;
  state.totalPages = 1;
  state.done = false;
  state.loading = false;
  state.lastError = null;
  state.seen.clear();
  els.grid.classList.remove('has-state');
  els.grid.replaceChildren(UI.skeletonCards(12));
  els.grid.setAttribute('aria-busy', 'true');
  setFooter('none');
  void loadMore();
}

async function loadMore() {
  if (state.loading || state.done) return;
  state.loading = true;
  const token = state.token;
  const page = state.page;
  const isFirstPage = page === 1;
  const controller = new AbortController();
  state.abort = controller;
  if (!isFirstPage) setFooter('loading');

  try {
    const filters = { genre: state.genre, sort: state.sort };
    const fetcher = state.type === 'movie' ? window.fetchDiscoverMovies : window.fetchDiscoverTV;
    if (typeof fetcher !== 'function') throw new Error('Discover API is unavailable. Check that js/api.js loaded correctly.');
    const response = await fetcher(page, filters, { signal: controller.signal });

    if (token !== state.token || controller.signal.aborted) return;
    if (!response || response.ok !== true || !Array.isArray(response.results)) {
      const error = response && response.error ? response.error : { kind: 'empty-response' };
      state.lastError = error;
      if (isFirstPage) showFirstPageError(error);
      else setFooter('error', () => { setFooter('none'); void loadMore(); });
      return;
    }

    state.totalPages = Math.max(1, Number(response.total_pages) || 1);
    const fresh = response.results.filter((item) => item && item.id && !state.seen.has(String(item.id)));

    if (isFirstPage) {
      els.grid.removeAttribute('aria-busy');
      els.grid.classList.remove('has-state');
      els.grid.replaceChildren();
    }

    if (isFirstPage && !fresh.length) {
      state.done = true;
      showGridState(UI.createState({
        icon: 'film', title: 'No titles match', text: 'Try a different genre or sort order.',
        actionLabel: 'Clear filters', onAction: clearFilters
      }));
      setFooter('none');
      return;
    }

    const cards = fresh.map((item) => {
      state.seen.add(String(item.id));
      return window.createSmallCard(item, state.type);
    });
    if (cards.length) {
      els.grid.append(...cards);
      UI.stagger(cards);
    }

    state.page = page + 1;
    state.done = state.page > state.totalPages;
    setFooter(state.done ? 'end' : 'none');
    requestAnimationFrame(checkSentinel);
  } catch (error) {
    if (token !== state.token || controller.signal.aborted || (error && error.name === 'AbortError')) return;
    console.error('Discover request/render failed:', error);
    state.lastError = error;
    if (isFirstPage) showFirstPageError(error);
    else setFooter('error', () => { setFooter('none'); void loadMore(); });
  } finally {
    if (token === state.token) {
      state.loading = false;
      if (isFirstPage && els.grid) els.grid.removeAttribute('aria-busy');
    }
  }
}

function checkSentinel() {
  if (state.loading || state.done || !els.sentinel) return;
  const rect = els.sentinel.getBoundingClientRect();
  if (rect.top < window.innerHeight + 700) void loadMore();
}

function clearFilters() {
  state.genre = '';
  state.sort = 'popular';
  if (els.sort) els.sort.value = 'popular';
  applyFilters();
}

function init() {
  if (!UI) {
    console.error('Orvion UI toolkit is missing. Check that js/ui.js is loaded before js/discover.js.');
    return;
  }

  els = {
    tabs: $('discoverTabs'), genres: $('genreChips'), sort: $('sortSelect'),
    grid: $('discoverGrid'), sentinel: $('discoverSentinel'), footer: $('discoverFooter'),
    summaryText: $('discoverSummaryText'), clear: $('clearFilters')
  };
  if (!els.tabs || !els.sort || !els.grid || !els.sentinel) {
    console.error('Discover page markup is incomplete. Required elements were not found.');
    return;
  }

  readHash();
  els.sort.value = state.sort;
  const segmented = UI.segmented(els.tabs, {
    onChange: (value) => {
      state.type = value === 'tv' ? 'tv' : 'movie';
      state.genre = '';
      state.genres = [];
      renderGenreChips();
      writeHash();
      renderSummary();
      resetAndLoad();
      void loadGenres();
    }
  });
  // Restore the URL-selected type and keep the sliding indicator in sync.
  segmented.setValue(state.type, true);

  els.sort.addEventListener('change', () => {
    state.sort = SORT_LABELS[els.sort.value] ? els.sort.value : 'popular';
    applyFilters();
  });
  if (els.clear) els.clear.addEventListener('click', clearFilters);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '700px 0px' });
    observer.observe(els.sentinel);
  } else {
    window.addEventListener('scroll', checkSentinel, { passive: true });
  }

  renderSummary();
  resetAndLoad();
  void loadGenres();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
