const TMDB_API_KEY = '133f4a95473785a1ed45c980504ae889';  // REPLACE WITH YOUR TMDB API KEY
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

async function tmdbFetch(endpoint) {
  try {
    const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data.results || data;
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
window.searchMovies = (query, page = 1) => {
  if (!query.trim()) return Promise.resolve([]);
  return tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=${page}`);
};
window.fetchMovieDetails = (id) => tmdbFetch(`/movie/${id}?append_to_response=credits,videos`);
window.fetchTVDetails = (id) => tmdbFetch(`/tv/${id}?append_to_response=credits,videos`);
window.fetchDiscoverMovies = (page = 1) => tmdbFetch(`/discover/movie?page=${page}`);
window.fetchDiscoverTV = (page = 1) => tmdbFetch(`/discover/tv?page=${page}`);

// New multi-search for infinite scroll
window.fetchSearchMulti = (query, page = 1) => {
  if (!query.trim()) return Promise.resolve([]);
  return tmdbFetch(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
};
window.IMG_BASE = IMG_BASE;
window.IMG_BASE_ORIGINAL = IMG_BASE_ORIGINAL;