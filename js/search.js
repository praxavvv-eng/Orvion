// js/search.js – Search page logic (classic script, loaded after js/ui.js)
//
// Moved out of search.html unchanged in behaviour so it can be cached by the service worker
// and edited without touching markup.
(function () {
  'use strict';

  const UI = window.OrvionUI;
  const { el, icon } = UI;
  const $ = (id) => document.getElementById(id);

  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 350;
  const HISTORY_KEY = 'searchHistory';   // same key as before, so existing history is kept
  const MAX_HISTORY = 10;
  const MAX_EMPTY_RETRIES = 3;

  const input = $('searchInput');
  const form = $('searchForm');
  const clearBtn = $('searchClear');
  const grid = $('searchResults');
  const footer = $('searchFooter');
  const sentinel = $('searchSentinel');
  const status = $('searchStatus');
  const filtersRow = $('searchFilters');
  const typeChips = $('typeChips');
  const recent = $('recentSearches');
  if (!input || !form || !grid) return;

  const state = {
    query: '',
    page: 1,
    totalPages: 1,
    loading: false,
    done: true,
    idle: true,
    token: 0,
    abort: null,
    items: [],
    seen: new Set(),
    filter: 'all',
    partial: false,
    debounce: null
  };
  const pageCache = new Map(); // "query|page" -> { movies, tv } so repeats cost no requests

  // ------------------------------------------------------------------ history
  function getHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY));
      return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.trim()) : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function addToHistory(query) {
    const q = query.trim();
    if (q.length < MIN_CHARS) return;
    const next = getHistory().filter((item) => item.toLowerCase() !== q.toLowerCase());
    next.unshift(q);
    saveHistory(next.slice(0, MAX_HISTORY));
    renderRecent();
  }
  function removeFromHistory(query) {
    saveHistory(getHistory().filter((item) => item !== query));
    renderRecent();
  }
  function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
    renderRecent();
    renderIdlePrompt();
  }

  function renderRecent() {
    const history = getHistory();
    recent.replaceChildren();
    if (!state.idle || !history.length) { recent.hidden = true; return; }
    recent.hidden = false;

    recent.appendChild(el('div', { class: 'recent-head' },
      el('span', { text: 'Recent searches' }),
      el('button', { class: 'link-btn', text: 'Clear all', attrs: { type: 'button' }, on: { click: clearHistory } })
    ));
    const list = el('ul');
    history.forEach((query) => {
      list.appendChild(el('li', { class: 'recent-item' },
        el('button', {
          class: 'recent-query',
          attrs: { type: 'button' },
          on: { click: () => { input.value = query; clearBtn.hidden = false; addToHistory(query); startSearch(query); } }
        }, icon('search', 18), el('span', { text: query })),
        el('button', {
          class: 'recent-delete',
          attrs: { type: 'button', 'aria-label': 'Remove “' + query + '” from recent searches' },
          on: { click: () => removeFromHistory(query) }
        }, icon('close', 18))
      ));
    });
    recent.appendChild(list);
  }

  // -------------------------------------------------------------------- state views
  function renderIdlePrompt() {
    if (!state.idle || getHistory().length) { if (state.idle) grid.replaceChildren(); grid.classList.remove('has-state'); return; }
    grid.classList.add('has-state');
    grid.replaceChildren(UI.createState({
      icon: 'search',
      title: 'Find something to watch',
      text: 'Search movies and TV shows by title.'
    }));
  }

  function setFooter(mode, retry) {
    footer.replaceChildren();
    footer.hidden = mode === 'none';
    if (mode === 'loading') {
      footer.appendChild(el('div', { class: 'loader', attrs: { role: 'status', 'aria-label': 'Loading more results' } }));
    } else if (mode === 'end') {
      footer.appendChild(el('p', { class: 'footer-note', text: 'That’s everything for this search' }));
    } else if (mode === 'error') {
      footer.appendChild(UI.createState({
        kind: 'error', compact: true, icon: 'alert', title: 'Couldn’t load more',
        actionLabel: 'Try again', actionIcon: 'refresh', onAction: retry
      }));
    }
  }

  function syncUrl(query) {
    try {
      history.replaceState(null, '', query ? location.pathname + '?q=' + encodeURIComponent(query) : location.pathname);
    } catch (e) { /* ignore */ }
  }

  function toIdle(message) {
    clearTimeout(state.debounce);
    if (state.abort) state.abort.abort();
    state.token += 1;
    Object.assign(state, { query: '', page: 1, totalPages: 1, loading: false, done: true, idle: true, items: [], filter: 'all', partial: false });
    state.seen.clear();
    grid.removeAttribute('aria-busy');
    filtersRow.hidden = true;
    status.textContent = message || '';
    setFooter('none');
    syncUrl('');
    renderRecent();
    renderIdlePrompt();
  }

  function passesFilter(item) {
    return state.filter === 'all' || item.media_type === state.filter;
  }

  function renderChips() {
    const counts = { all: state.items.length, movie: 0, tv: 0 };
    state.items.forEach((item) => { counts[item.media_type] += 1; });
    typeChips.replaceChildren();
    [['all', 'All'], ['movie', 'Movies'], ['tv', 'TV']].forEach(([value, label]) => {
      const active = state.filter === value;
      typeChips.appendChild(el('button', {
        class: 'chip' + (active ? ' active' : ''),
        attrs: { type: 'button', 'aria-pressed': active ? 'true' : 'false' },
        on: { click: () => { if (state.filter !== value) { state.filter = value; renderChips(); renderGrid(); } } }
      }, el('span', { text: label }), el('span', { class: 'chip-count', text: String(counts[value]) })));
    });
    filtersRow.hidden = !state.items.length;
  }

  function updateStatus() {
    const total = state.items.length;
    if (!total) { status.textContent = ''; return; }
    let text = total + (state.done ? '' : '+') + (total === 1 && state.done ? ' result' : ' results') + ' for “' + state.query + '”';
    if (state.partial) text += ' (some results unavailable)';
    status.textContent = text;
  }

  function showNoResults() {
    grid.removeAttribute('aria-busy');
    grid.classList.add('has-state');
    grid.replaceChildren(UI.createState({
      icon: 'search',
      title: 'No results for “' + state.query + '”',
      text: 'Check the spelling or try a different title.'
    }));
    filtersRow.hidden = true;
    status.textContent = '';
  }

  function showFilterEmpty() {
    grid.classList.add('has-state');
    grid.replaceChildren(UI.createState({
      compact: true,
      icon: 'film',
      title: state.filter === 'tv' ? 'No TV shows in these results' : 'No movies in these results',
      actionLabel: 'Show all results',
      onAction: () => { state.filter = 'all'; renderChips(); renderGrid(); }
    }));
  }

  function appendCards(items) {
    const cards = items.filter(passesFilter).map((item) => window.createSmallCard(item, item.media_type));
    if (cards.length) {
      if (grid.classList.contains('has-state')) { grid.classList.remove('has-state'); grid.replaceChildren(); }
      grid.append(...cards);
      UI.stagger(cards);
    }
  }

  function renderGrid() {
    grid.classList.remove('has-state');
    grid.replaceChildren();
    appendCards(state.items);
    if (!grid.children.length && state.done) showFilterEmpty();
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(checkSentinel);
  }

  // -------------------------------------------------------------------- searching
  function relevance(item, q) {
    const title = String(item.title || item.name || '').toLowerCase();
    if (title === q) return 3;
    if (title.startsWith(q)) return 2;
    if (title.includes(q)) return 1;
    return 0;
  }

  function rank(items, query) {
    const q = query.toLowerCase();
    return items.slice().sort((a, b) => (relevance(b, q) - relevance(a, q)) || ((b.popularity || 0) - (a.popularity || 0)));
  }

  async function fetchPage(query, page) {
    const key = query.toLowerCase() + '|' + page;
    if (pageCache.has(key)) return pageCache.get(key);

    state.abort = new AbortController();
    const options = { signal: state.abort.signal };
    const [movies, tv] = await Promise.all([window.searchMovies(query, page, options), window.searchTV(query, page, options)]);
    const result = {
      movies,
      tv,
      ok: movies.ok || tv.ok,
      partial: movies.ok !== tv.ok,
      error: !movies.ok ? movies.error : (!tv.ok ? tv.error : null)
    };
    if (movies.ok && tv.ok) {
      if (pageCache.size >= 24) pageCache.delete(pageCache.keys().next().value);
      pageCache.set(key, result);
    }
    return result;
  }

  function startSearch(query) {
    clearTimeout(state.debounce);
    if (state.abort) state.abort.abort();
    state.token += 1;
    Object.assign(state, { query, page: 1, totalPages: 1, loading: false, done: false, idle: false, items: [], filter: 'all', partial: false });
    state.seen.clear();

    recent.hidden = true;
    filtersRow.hidden = true;
    status.textContent = 'Searching…';
    grid.classList.remove('has-state');
    grid.replaceChildren(UI.skeletonCards(12));
    grid.setAttribute('aria-busy', 'true');
    setFooter('none');
    syncUrl(query);
    loadMore(0);
  }

  function searchErrorText(error) {
    if (typeof window.describeTMDBError === 'function') return window.describeTMDBError(error);
    if (navigator.onLine === false) return 'You’re offline. Reconnect and try again.';
    return 'The movie database did not respond. Please try again.';
  }

  async function loadMore(attempt) {
    if (state.loading || state.done || !state.query) return;
    state.loading = true;
    const token = state.token;
    const query = state.query;
    const page = state.page;
    const first = page === 1;
    if (!first) setFooter('loading');

    try {
      const result = await fetchPage(query, page);
      if (token !== state.token) return; // a newer search replaced this one

      if (!result || !result.ok) {
        const message = searchErrorText(result && result.error);
        if (first) {
          grid.removeAttribute('aria-busy');
          grid.classList.add('has-state');
          grid.replaceChildren(UI.createState({
            kind: 'error',
            icon: navigator.onLine === false ? 'wifiOff' : 'alert',
            title: 'Search isn’t working right now',
            text: message,
            actionLabel: 'Try again',
            actionIcon: 'refresh',
            onAction: () => startSearch(query)
          }));
          status.textContent = '';
          filtersRow.hidden = true;
          setFooter('none');
        } else {
          setFooter('error', () => loadMore(0));
        }
        return;
      }

      state.partial = state.partial || result.partial;
      state.totalPages = Math.max(result.movies.total_pages || 1, result.tv.total_pages || 1);

      let combined = [
        ...result.movies.results.map((item) => Object.assign({}, item, { media_type: 'movie' })),
        ...result.tv.results.map((item) => Object.assign({}, item, { media_type: 'tv' }))
      ];
      if (first) combined = rank(combined, query);

      const fresh = combined.filter((item) => {
        const key = item.media_type + '_' + item.id;
        if (!item.id || state.seen.has(key)) return false;
        state.seen.add(key);
        return true;
      });
      state.items.push(...fresh);
      state.page += 1;
      state.done = state.page > state.totalPages;

      if (first) {
        grid.removeAttribute('aria-busy');
        grid.classList.remove('has-state');
        grid.replaceChildren();
        if (!state.items.length) {
          showNoResults();
          return;
        }
      }

      renderChips();
      appendCards(fresh);
      updateStatus();
      setFooter(state.done ? 'end' : 'none');
      if (state.done && !grid.querySelector('.card')) showFilterEmpty();

      if (!fresh.length && !state.done && attempt < MAX_EMPTY_RETRIES) {
        // Release the loading guard before requesting the next page.
        state.loading = false;
        await loadMore(attempt + 1);
        return;
      }
      requestAnimationFrame(checkSentinel);
    } catch (error) {
      if (token !== state.token || (error && error.name === 'AbortError') || (state.abort && state.abort.signal.aborted)) return;
      console.error('Search request/render failed:', error);
      const message = searchErrorText(error);
      if (first) {
        grid.removeAttribute('aria-busy');
        grid.classList.add('has-state');
        grid.replaceChildren(UI.createState({
          kind: 'error',
          icon: navigator.onLine === false ? 'wifiOff' : 'alert',
          title: 'Search isn’t working right now',
          text: message,
          actionLabel: 'Try again',
          actionIcon: 'refresh',
          onAction: () => startSearch(query)
        }));
        filtersRow.hidden = true;
        status.textContent = '';
        setFooter('none');
      } else {
        setFooter('error', () => loadMore(0));
      }
    } finally {
      if (token === state.token) {
        state.loading = false;
        if (first) grid.removeAttribute('aria-busy');
      }
    }
  }

  function checkSentinel() {
    if (state.loading || state.done || !state.query) return;
    if (sentinel.getBoundingClientRect().top < window.innerHeight + 700) loadMore(0);
  }

  // -------------------------------------------------------------------- events
  input.addEventListener('input', () => {
    const value = input.value;
    clearBtn.hidden = !value;
    const q = value.trim();
    clearTimeout(state.debounce);
    if (q.length < MIN_CHARS) {
      toIdle(q.length === 1 ? 'Keep typing…' : '');
      return;
    }
    state.debounce = setTimeout(() => { if (q !== state.query) startSearch(q); }, DEBOUNCE_MS);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (q.length < MIN_CHARS) { input.focus(); return; }
    addToHistory(q);
    startSearch(q);
    if (window.matchMedia('(pointer: coarse)').matches) input.blur(); // dismiss the on-screen keyboard
  });

  input.addEventListener('change', () => {
    const q = input.value.trim();
    if (q.length >= MIN_CHARS && q === state.query) addToHistory(q);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      clearInput();
    }
  });

  function clearInput() {
    input.value = '';
    clearBtn.hidden = true;
    toIdle('');
    input.focus();
  }
  clearBtn.addEventListener('click', clearInput);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) checkSentinel();
    }, { rootMargin: '700px 0px' }).observe(sentinel);
  } else {
    window.addEventListener('scroll', checkSentinel, { passive: true });
  }

  // -------------------------------------------------------------------- start
  const initial = (new URLSearchParams(location.search).get('q') || '').trim();
  if (initial.length >= MIN_CHARS) {
    input.value = initial;
    clearBtn.hidden = false;
    startSearch(initial);
  } else {
    toIdle('');
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.focus();
  }
})();
