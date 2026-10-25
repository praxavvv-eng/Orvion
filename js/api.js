// js/api.js – TMDB access layer for Orvion
//
// Every list helper resolves to the same shape (it never rejects):
//   { results: [], total_pages: 1, total_results: 0, ok: true | false, error?: { kind, status?, message } }
// `ok: false` means the request FAILED. `ok: true` with an empty `results` array means
// TMDB genuinely returned nothing. Callers can therefore tell an outage from an empty result.
//
// Existing global names (fetchTrending, searchMovies, fetchMovieDetails, ...) are preserved.
(function () {
  'use strict';

  // NOTE: this is a browser-visible TMDB v3 key, so it is public by nature.
  // See the deployment notes for the optional proxy approach.
  const TMDB_API_KEY = '133f4a95473785a1ed45c980504ae889';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_IMG = 'https://image.tmdb.org/t/p';
  const REQUEST_TIMEOUT_MS = 12000;
  const RETRY_DELAY_MS = 600;
  const GENRE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

  // Image bases. IMG_BASE (w500) is also what gets stored in Firestore as `poster`,
  // so it must not change.
  const IMG_BASE = TMDB_IMG + '/w500';
  const IMG_BASE_ORIGINAL = TMDB_IMG + '/original';

  /** Build an image URL for a TMDB path at a given size (e.g. 'w342', 'w780', 'w1280'). */
  function tmdbImage(path, size) {
    if (!path || typeof path !== 'string') return '';
    return TMDB_IMG + '/' + (size || 'w500') + path;
  }

  // ---------------------------------------------------------------------------
  // Core request helpers
  // ---------------------------------------------------------------------------
  const inflight = new Map(); // endpoint -> Promise (only for requests without a caller signal)

  function makeError(kind, message, status) {
    const error = { kind, message };
    if (status) error.status = status;
    return error;
  }

  function buildUrl(endpoint) {
    const sep = endpoint.indexOf('?') === -1 ? '?' : '&';
    return TMDB_BASE + endpoint + sep + 'api_key=' + TMDB_API_KEY + '&language=en-US';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchOnce(url, callerSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    let abortFromCaller = null;
    if (callerSignal) {
      abortFromCaller = () => controller.abort();
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    }

    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        const kind = response.status === 401 ? 'auth' : response.status === 429 ? 'rate' : 'http';
        throw makeError(kind, 'HTTP ' + response.status, response.status);
      }
      return await response.json();
    } catch (err) {
      if (err && err.kind) throw err; // already classified
      if (callerSignal && callerSignal.aborted) throw makeError('aborted', 'Request cancelled');
      if (timedOut) throw makeError('timeout', 'Request timed out');
      throw makeError('network', (err && err.message) || 'Network error');
    } finally {
      clearTimeout(timer);
      if (callerSignal && abortFromCaller) callerSignal.removeEventListener('abort', abortFromCaller);
    }
  }

  function isRetryable(err) {
    return err.kind === 'network' || err.kind === 'timeout' ||
      (err.kind === 'http' && err.status >= 500) || err.kind === 'rate';
  }

  /** Fetch JSON with one retry on transient failures. Throws a classified error object. */
  async function requestJson(endpoint, signal) {
    const url = buildUrl(endpoint);
    try {
      return await fetchOnce(url, signal);
    } catch (err) {
      if (!isRetryable(err) || (signal && signal.aborted)) throw err;
      await sleep(RETRY_DELAY_MS);
      return fetchOnce(url, signal);
    }
  }

  function emptyList(ok, error) {
    const out = { results: [], total_pages: 1, total_results: 0, ok: ok };
    if (error) out.error = error;
    return out;
  }

  function normaliseList(data) {
    if (!data || !Array.isArray(data.results)) {
      throw makeError('invalid-response', 'The movie database returned an unexpected response.');
    }
    const results = data.results.filter(Boolean);
    return {
      results: results,
      total_pages: Math.max(1, Math.min(Number(data && data.total_pages) || 1, 500)),
      total_results: Number(data && data.total_results) || results.length,
      ok: true
    };
  }

  /**
   * Fetch a TMDB collection endpoint. Identical concurrent calls (same endpoint, no abort
   * signal) share one network request.
   */
  function describeTmdbError(error) {
    const err = error || {};
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You appear to be offline. Check your internet connection and try again.';
    if (err.status === 401 || err.kind === 'auth') return 'TMDB rejected the API key (401). Check that the TMDB key is active and valid.';
    if (err.status === 403) return 'TMDB denied this request (403). Check the API key permissions and usage restrictions.';
    if (err.status === 404) return 'The requested TMDB resource was not found (404).';
    if (err.status === 429 || err.kind === 'rate') return 'TMDB rate limit reached. Wait a little and try again.';
    if (err.kind === 'timeout') return 'TMDB took too long to respond. Please try again.';
    if (err.kind === 'network') return 'Could not reach TMDB. Check your connection, browser extensions, or network restrictions.';
    if (err.kind === 'invalid-response') return 'TMDB returned an unexpected response. Please retry.';
    if (err.status >= 500) return 'TMDB is temporarily having a server problem. Please try again later.';
    return 'The movie database could not load this content. Please try again.';
  }

  window.describeTMDBError = describeTmdbError;

  function tmdbFetch(endpoint, options) {
    const signal = options && options.signal;
    const run = async () => {
      try {
        return normaliseList(await requestJson(endpoint, signal));
      } catch (err) {
        if (err.kind !== 'aborted') console.warn('TMDB request failed:', endpoint.split('?')[0], err.kind || 'unknown', err.status || '', err.message || '');
        return emptyList(false, err);
      }
    };

    if (signal) return run();
    if (inflight.has(endpoint)) return inflight.get(endpoint);
    const promise = run().finally(() => inflight.delete(endpoint));
    inflight.set(endpoint, promise);
    return promise;
  }

  // ---------------------------------------------------------------------------
  // Home collections (names unchanged)
  // ---------------------------------------------------------------------------
  window.fetchTrending = (opts) => tmdbFetch('/trending/movie/week', opts);
  window.fetchPopular = (opts) => tmdbFetch('/movie/popular', opts);
  window.fetchTopRated = (opts) => tmdbFetch('/movie/top_rated', opts);
  window.fetchNowPlaying = (opts) => tmdbFetch('/movie/now_playing', opts);
  window.fetchTVPopular = (opts) => tmdbFetch('/tv/popular', opts);

  // ---------------------------------------------------------------------------
  // Search (names unchanged; optional third argument { signal })
  // ---------------------------------------------------------------------------
  function searchEndpoint(kind, query, page) {
    return '/search/' + kind + '?query=' + encodeURIComponent(query) + '&include_adult=false&page=' + (page || 1);
  }

  window.searchMovies = (query, page = 1, opts) => {
    if (!String(query || '').trim()) return Promise.resolve(emptyList(true));
    return tmdbFetch(searchEndpoint('movie', String(query).trim(), page), opts);
  };

  window.searchTV = (query, page = 1, opts) => {
    if (!String(query || '').trim()) return Promise.resolve(emptyList(true));
    return tmdbFetch(searchEndpoint('tv', String(query).trim(), page), opts);
  };

  // Legacy multi-search (kept for compatibility)
  window.fetchSearchMulti = (query, page = 1, opts) => {
    if (!String(query || '').trim()) return Promise.resolve(emptyList(true));
    return tmdbFetch(searchEndpoint('multi', String(query).trim(), page), opts);
  };

  // ---------------------------------------------------------------------------
  // Details (return the TMDB object, or null on failure – unchanged contract)
  // ---------------------------------------------------------------------------
  async function fetchDetails(type, id, opts) {
    const safeId = encodeURIComponent(String(id));
    try {
      return await requestJson('/' + type + '/' + safeId + '?append_to_response=credits,videos', opts && opts.signal);
    } catch (err) {
      if (err.kind !== 'aborted') console.warn(type + ' details request failed:', err.kind, err.status || '');
      return null;
    }
  }

  window.fetchMovieDetails = (id, opts) => fetchDetails('movie', id, opts);
  window.fetchTVDetails = (id, opts) => fetchDetails('tv', id, opts);

  // ---------------------------------------------------------------------------
  // Discover (names unchanged; new optional `filters` and `opts` arguments)
  //   filters.sort  : 'popular' (default) | 'top' | 'new'
  //   filters.genre : TMDB genre id (number | string) or falsy for all genres
  // ---------------------------------------------------------------------------
  function discoverEndpoint(type, page, filters) {
    const f = filters || {};
    const params = new URLSearchParams();
    params.set('page', String(page || 1));
    params.set('include_adult', 'false');

    const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    const today = new Date().toISOString().slice(0, 10);
    if (f.sort === 'top') {
      params.set('sort_by', 'vote_average.desc');
      params.set('vote_count.gte', '300'); // avoids obscure titles with a handful of perfect votes
    } else if (f.sort === 'new') {
      params.set('sort_by', dateField + '.desc');
      params.set(dateField + '.lte', today); // hides unreleased titles
      params.set('vote_count.gte', '20');
    } else {
      params.set('sort_by', 'popularity.desc');
    }
    if (f.genre) params.set('with_genres', String(f.genre));
    return '/discover/' + type + '?' + params.toString();
  }

  window.fetchDiscoverMovies = (page = 1, filters, opts) => tmdbFetch(discoverEndpoint('movie', page, filters), opts);
  window.fetchDiscoverTV = (page = 1, filters, opts) => tmdbFetch(discoverEndpoint('tv', page, filters), opts);

  // ---------------------------------------------------------------------------
  // Genres (cached for a week; resolves to [] on failure)
  // ---------------------------------------------------------------------------
  const genreMemory = {};

  window.fetchGenres = async function (type, opts) {
    const t = type === 'tv' ? 'tv' : 'movie';
    if (genreMemory[t]) return genreMemory[t];
    const key = 'orvion:genres:' + t;
    let staleGenres = null;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached && Array.isArray(cached.data)) {
        staleGenres = cached.data;
        if (Date.now() - Number(cached.time || 0) < GENRE_CACHE_TTL) {
          genreMemory[t] = cached.data;
          return cached.data;
        }
      }
    } catch (e) { /* storage unavailable or corrupt – fall through to network */ }

    try {
      const data = await requestJson('/genre/' + t + '/list', opts && opts.signal);
      const genres = (Array.isArray(data && data.genres) ? data.genres : [])
        .filter((g) => g && g.id && g.name)
        .map((g) => ({ id: g.id, name: g.name }));
      if (genres.length) {
        genreMemory[t] = genres;
        try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), data: genres })); } catch (e) { /* ignore */ }
      }
      return genres;
    } catch (err) {
      if (err && err.kind !== 'aborted') console.warn('TMDB genres could not load:', t, err.kind || 'unknown', err.status || '');
      return Array.isArray(staleGenres) ? staleGenres : [];
    }
  };

  // ---------------------------------------------------------------------------
  // Shared exports
  // ---------------------------------------------------------------------------
  window.tmdbImage = tmdbImage;
  window.IMG_BASE = IMG_BASE;
  window.IMG_BASE_ORIGINAL = IMG_BASE_ORIGINAL;
})();
