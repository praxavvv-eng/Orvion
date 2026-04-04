// js/api.js – fixed: added searchTV, return full response for search functions
const TMDB_API_KEY = '133f4a95473785a1ed45c980504ae889';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

async function tmdbFetch(endpoint) {
  try {
    const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=en-US`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json(); // return full response (including total_pages)
  } catch (e) {
    console.warn('TMDB fetch failed:', e);
    return [];
  }
}

window.fetchTrending = () => tmdbFetch('/trending/movie/week');
window.fetchPopular = () => tmdbFetch('/movie/popular');
window.fetchTopRated = () => tmdbFetch('/movie/top_rated');
window.fetchNowPlaying = () => tmdbFetch('/movie/now_playing');
window.fetchTVPopular = () => tmdbFetch('/tv/popular');

// Search – return full response (results + total_pages)
window.searchMovies = (query, page = 1) => {
  if (!query.trim()) return Promise.resolve({ results: [], total_pages: 1 });
  return tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=${page}`);
};

// ADDED: searchTV function (was missing)
window.searchTV = (query, page = 1) => {
  if (!query.trim()) return Promise.resolve({ results: [], total_pages: 1 });
  return tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}&page=${page}`);
};

window.fetchMovieDetails = (id) => tmdbFetch(`/movie/${id}?append_to_response=credits,videos`);
window.fetchTVDetails = (id) => tmdbFetch(`/tv/${id}?append_to_response=credits,videos`);
window.fetchDiscoverMovies = (page = 1) => tmdbFetch(`/discover/movie?page=${page}`);
window.fetchDiscoverTV = (page = 1) => tmdbFetch(`/discover/tv?page=${page}`);

window.IMG_BASE = IMG_BASE;
window.IMG_BASE_ORIGINAL = IMG_BASE_ORIGINAL;