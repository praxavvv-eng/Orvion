// js/api.js – Full fixed version: always returns { results: [], total_pages: 1 } on error or success
const TMDB_API_KEY = '133f4a95473785a1ed45c980504ae889';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

// Core fetch function – returns full response object with results and total_pages
async function tmdbFetch(endpoint) {
  try {
    const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=en-US`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // Ensure consistent structure: always return object with results and total_pages
    return {
      results: data.results || [],
      total_pages: data.total_pages || 1
    };
  } catch (error) {
    console.warn('TMDB fetch failed:', endpoint, error);
    return {
      results: [],
      total_pages: 1
    };
  }
}

// All API functions now return the same consistent object
window.fetchTrending = () => tmdbFetch('/trending/movie/week');
window.fetchPopular = () => tmdbFetch('/movie/popular');
window.fetchTopRated = () => tmdbFetch('/movie/top_rated');
window.fetchNowPlaying = () => tmdbFetch('/movie/now_playing');
window.fetchTVPopular = () => tmdbFetch('/tv/popular');

// Search functions – also return consistent object
window.searchMovies = (query, page = 1) => {
  if (!query.trim()) {
    return Promise.resolve({ results: [], total_pages: 1 });
  }
  return tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=${page}`);
};

window.searchTV = (query, page = 1) => {
  if (!query.trim()) {
    return Promise.resolve({ results: [], total_pages: 1 });
  }
  return tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}&page=${page}`);
};

// Details endpoints (these return single objects, not collections)
window.fetchMovieDetails = async (id) => {
  try {
    const url = `${TMDB_BASE}/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('Movie details fetch failed:', error);
    return null;
  }
};

window.fetchTVDetails = async (id) => {
  try {
    const url = `${TMDB_BASE}/tv/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('TV details fetch failed:', error);
    return null;
  }
};

// Discover endpoints (for infinite scroll)
window.fetchDiscoverMovies = (page = 1) => tmdbFetch(`/discover/movie?page=${page}`);
window.fetchDiscoverTV = (page = 1) => tmdbFetch(`/discover/tv?page=${page}`);

// Legacy multi‑search (kept for compatibility)
window.fetchSearchMulti = (query, page = 1) => {
  if (!query.trim()) return Promise.resolve({ results: [], total_pages: 1 });
  return tmdbFetch(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
};

// Expose image bases globally
window.IMG_BASE = IMG_BASE;
window.IMG_BASE_ORIGINAL = IMG_BASE_ORIGINAL;