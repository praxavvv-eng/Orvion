const TMDB_API_KEY = '133f4a95473785a1ed45c980504ae889';  // <-- REPLACE WITH YOUR TMDB API KEY
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const IMG_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

async function tmdbFetch(endpoint) {
  try {
    const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=en-US`;
    console.log('🌐 TMDB Request URL:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data.results || data;
  } catch (e) {
    console.error('🔥 TMDB fetch failed:', e);
    return [];
  }
}

window.fetchTrending = function() {
  return tmdbFetch('/trending/movie/week');
};

window.fetchPopular = function() {
  return tmdbFetch('/movie/popular');
};

window.fetchNowPlaying = function() {
  return tmdbFetch('/movie/now_playing');
};

window.fetchTVPopular = function() {
  return tmdbFetch('/tv/popular');
};

window.searchMovies = function(query) {
  if (!query.trim()) return Promise.resolve([]);
  return tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}`);
};

window.fetchMovieDetails = function(movieId) {
  return tmdbFetch(`/movie/${movieId}?append_to_response=credits,videos`);
};