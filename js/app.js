document.addEventListener('DOMContentLoaded', async () => {
  initCustomDropdowns();
  initModals();

  if (document.body.classList.contains('home-page')) {
    initHome();
  } else if (document.body.classList.contains('search-page')) {
    initSearch();
    initSearchHistory();
  } else if (document.body.classList.contains('watchlist-page')) {
    initWatchlistTabs();
    renderWatchlistForStatus('plan');
  }
});

// ---------- Custom Dropdowns ----------
function initCustomDropdowns() {
  document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelectorAll('.dropdown-option');
    if (!dropdown.querySelector('.dropdown-option.selected')) {
      const first = options[0];
      if (first) {
        first.classList.add('selected');
        selected.textContent = first.textContent;
      }
    }
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selected.textContent = opt.textContent;
        dropdown.classList.remove('open');
      });
    });
  });
}

// ---------- Modals ----------
function initModals() {
  document.getElementById('modalCancel')?.addEventListener('click', hideAddModal);
  document.getElementById('modalSave')?.addEventListener('click', () => {
    if (!currentAddItem) return;
    const category = document.querySelector('#categoryDropdown .dropdown-option.selected')?.dataset.value || 'movie';
    const status = document.querySelector('#statusDropdown .dropdown-option.selected')?.dataset.value || 'plan';
    const item = {
      id: currentAddItem.id,
      title: currentAddItem.title,
      poster: currentAddItem.poster,
      category, status
    };
    const added = window.watchlist.add(item);
    showToast(added ? 'Added to watchlist' : 'Already in watchlist', added ? 'success' : 'error');
    hideAddModal();
    if (document.body.classList.contains('watchlist-page')) renderWatchlistForStatus(currentStatus);
  });
  document.getElementById('closeDetails')?.addEventListener('click', hideDetailsModal);
  document.getElementById('detailsModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('detailsModal')) hideDetailsModal();
  });
  document.getElementById('detailsAddBtn')?.addEventListener('click', () => {
    if (!currentItem) return;
    currentAddItem = {
      id: currentItem.id,
      title: currentItem.title || currentItem.name,
      poster: currentItem.poster_path ? IMG_BASE + currentItem.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster'
    };
    hideDetailsModal();
    showAddModal(currentAddItem);
  });
}

// ---------- HOME (unchanged) ----------
async function initHome() {
  const heroContainer = document.getElementById('heroCarousel');
  const trendingScroll = document.getElementById('trendingScroll');
  const popularScroll = document.getElementById('popularScroll');
  const topRatedScroll = document.getElementById('topRatedScroll');

  let heroMovies = [];
  const lastHeroUpdate = localStorage.getItem('heroLastUpdate');
  const today = new Date().toDateString();
  if (lastHeroUpdate === today) {
    heroMovies = JSON.parse(localStorage.getItem('heroMovies') || '[]');
  } else {
    const [trending, popular, topRated] = await Promise.all([
      fetchTrending(), fetchPopular(), fetchTopRated()
    ]);
    heroMovies = [...trending, ...popular, ...topRated]
      .sort(() => 0.5 - Math.random())
      .slice(0, 10);
    localStorage.setItem('heroMovies', JSON.stringify(heroMovies));
    localStorage.setItem('heroLastUpdate', today);
  }

  heroMovies.forEach(movie => heroContainer.appendChild(createHeroCard(movie)));
  setTimeout(() => centerFirstHeroCard(heroContainer), 50);
  const firstCard = heroContainer.querySelector('.hero-card');
  if (firstCard) firstCard.classList.add('active');
  enableDragScroll(heroContainer);
  observeHeroCards(heroContainer);

  // Auto slide using container scroll (fixed)
  let autoSlideInterval = setInterval(() => {
    const container = heroContainer;
    const activeCard = container.querySelector('.hero-card.active');
    if (!activeCard) return;
    const next = activeCard.nextElementSibling || container.firstElementChild;
    if (next) {
      const containerRect = container.getBoundingClientRect();
      const cardRect = next.getBoundingClientRect();
      const targetLeft = container.scrollLeft + (cardRect.left - containerRect.left) - (containerRect.width / 2) + (cardRect.width / 2);
      container.scrollTo({
        left: targetLeft,
        behavior: 'smooth'
      });
    }
  }, 4000);
  heroContainer.addEventListener('touchstart', () => clearInterval(autoSlideInterval), { once: true });
  heroContainer.addEventListener('mousedown', () => clearInterval(autoSlideInterval), { once: true });

  const trending = await fetchTrending();
  const popular = await fetchPopular();
  const topRated = await fetchTopRated();
  trending.slice(0, 12).forEach(m => trendingScroll.appendChild(createSmallCard(m)));
  popular.slice(0, 12).forEach(m => popularScroll.appendChild(createSmallCard(m)));
  topRated.slice(0, 12).forEach(m => topRatedScroll.appendChild(createSmallCard(m)));
}

// ---------- SEARCH (infinite scroll) ----------
let searchState = {
  query: '',
  page: 1,
  totalPages: 1,
  loading: false,
  hasMore: true
};

function initSearch() {
  const input = document.getElementById('searchInput');
  const grid = document.getElementById('searchResults');
  let timeout;

  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      grid.innerHTML = '';
      searchState.query = '';
      return;
    }
    // Reset state
    searchState.query = query;
    searchState.page = 1;
    searchState.totalPages = 1;
    searchState.hasMore = true;
    searchState.loading = false;
    grid.innerHTML = ''; // clear old results

    // Show loading at top
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.id = 'searchLoader';
    grid.appendChild(loader);

    timeout = setTimeout(async () => {
      await loadSearchResults(query, 1, true);
    }, 400);
  });

  // Infinite scroll listener
  window.addEventListener('scroll', () => {
    if (!searchState.query || searchState.loading || !searchState.hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      loadSearchResults(searchState.query, searchState.page + 1, false);
    }
  });
}

async function loadSearchResults(query, page, replace = false) {
  if (searchState.loading) return;
  searchState.loading = true;

  const grid = document.getElementById('searchResults');
  // Remove any existing loader
  const loader = document.getElementById('searchLoader');
  if (loader) loader.remove();

  // Show a bottom loader if appending
  if (!replace) {
    const bottomLoader = document.createElement('div');
    bottomLoader.className = 'loading-spinner';
    bottomLoader.id = 'bottomLoader';
    grid.appendChild(bottomLoader);
  }

  const data = await fetchSearchMulti(query, page);
  
  // Remove bottom loader if present
  const bottomLoader = document.getElementById('bottomLoader');
  if (bottomLoader) bottomLoader.remove();

  if (!data || data.length === 0) {
    searchState.hasMore = false;
    searchState.loading = false;
    if (page === 1) {
      grid.innerHTML = '<p class="empty-message">No results found</p>';
    }
    return;
  }

  // Filter out people and items without poster
  let results = data.filter(item => item.media_type !== 'person' && item.poster_path);

  // Sort: exact match first, then by popularity
  results.sort((a, b) => {
    const titleA = (a.title || a.name || '').toLowerCase();
    const titleB = (b.title || b.name || '').toLowerCase();
    const q = query.toLowerCase();
    if (titleA === q && titleB !== q) return -1;
    if (titleB === q && titleA !== q) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });

  if (replace) {
    grid.innerHTML = '';
  }

  results.forEach(item => {
    grid.appendChild(createSmallCard(item));
  });

  searchState.page = page;
  searchState.loading = false;
  searchState.totalPages = data.total_pages || 1;
  searchState.hasMore = page < searchState.totalPages;

  // Add a hidden loader at bottom for next page
  if (searchState.hasMore) {
    const nextLoader = document.createElement('div');
    nextLoader.className = 'loading-spinner';
    nextLoader.id = 'searchLoader';
    nextLoader.style.display = 'none';
    grid.appendChild(nextLoader);
  }
}

// ---------- SEARCH HISTORY ----------
const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 10;

function initSearchHistory() {
  const input = document.getElementById('searchInput');
  const historyContainer = document.getElementById('searchHistory');
  if (!historyContainer) return;

  function renderHistory() {
    const history = getSearchHistory();
    if (history.length === 0) {
      historyContainer.classList.remove('show');
      return;
    }
    historyContainer.classList.add('show');
    let html = '<div class="history-header"><span>Recent searches</span><button class="clear-history">Clear all</button></div>';
    history.forEach(q => {
      html += `<div class="history-item" data-query="${q}">
        <span class="query">${q}</span>
        <button class="delete-item" data-query="${q}">✕</button>
      </div>`;
    });
    historyContainer.innerHTML = html;

    historyContainer.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-item')) return;
        const query = item.dataset.query;
        input.value = query;
        historyContainer.classList.remove('show');
        input.dispatchEvent(new Event('input'));
      });
    });
    historyContainer.querySelectorAll('.delete-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const query = btn.dataset.query;
        removeSearchHistoryItem(query);
        renderHistory();
      });
    });
    const clearBtn = historyContainer.querySelector('.clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSearchHistory();
        renderHistory();
      });
    }
  }

  input.addEventListener('focus', () => {
    if (getSearchHistory().length > 0) {
      renderHistory();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => historyContainer.classList.remove('show'), 200);
  });

  input.addEventListener('change', () => {
    const q = input.value.trim();
    if (q.length >= 2) {
      addSearchHistory(q);
    }
  });
}

function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch { return []; }
}

function addSearchHistory(query) {
  let history = getSearchHistory();
  history = history.filter(q => q !== query);
  history.unshift(query);
  if (history.length > MAX_HISTORY) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function removeSearchHistoryItem(query) {
  let history = getSearchHistory();
  history = history.filter(q => q !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ---------- WATCHLIST ----------
let currentStatus = 'plan';
function initWatchlistTabs() {
  const tabsContainer = document.querySelector('.watchlist-tabs');
  const tabs = tabsContainer.querySelectorAll('.tab-btn');
  const indicator = tabsContainer.querySelector('.tab-indicator');
  function moveIndicator(active) {
    indicator.style.width = active.offsetWidth + 'px';
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  setTimeout(() => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) moveIndicator(active);
  }, 10);
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      moveIndicator(tab);
      currentStatus = tab.dataset.status;
      renderWatchlistForStatus(currentStatus);
    });
  });
  window.addEventListener('resize', () => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) moveIndicator(active);
  });
}

function renderWatchlistForStatus(status) {
  const container = document.getElementById('watchlistContent');
  container.classList.add('fade-out');
  setTimeout(() => {
    container.innerHTML = '';
    const categories = ['movie', 'series', 'anime', 'kdrama'];
    const labels = { movie: 'Movies', series: 'Series', anime: 'Anime', kdrama: 'Kdrama' };
    let hasAny = false;
    categories.forEach(cat => {
      const items = watchlist.getByStatusAndCategory(status, cat);
      if (!items.length) return;
      hasAny = true;
      const row = document.createElement('div');
      row.className = 'category-row';
      row.innerHTML = `<div class="category-title"><h3>${labels[cat]}</h3><span class="category-badge">${items.length}</span></div>`;
      const scroll = document.createElement('div');
      scroll.className = 'row-scroll';
      items.forEach(item => {
        scroll.appendChild(createWatchlistCard(item, (id, cat) => {
          watchlist.remove(id, cat);
          renderWatchlistForStatus(status);
          showToast('Removed from watchlist', 'success');
        }));
      });
      row.appendChild(scroll);
      container.appendChild(row);
    });
    if (!hasAny) {
      container.innerHTML = '<div class="empty-watchlist"><svg viewBox="0 0 24 24" stroke="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>Start building your watchlist</p></div>';
    }
    container.classList.remove('fade-out');
  }, 150);
}

// ---------- DETAILS ----------
let currentItem = null;
async function showItemDetails(id, type) {
  let item;
  if (type === 'movie') {
    item = await fetchMovieDetails(id);
  } else {
    item = await fetchTVDetails(id);
  }
  if (!item) return;
  currentItem = item;

  const title = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
  const runtime = item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null);

  const poster = item.poster_path ? IMG_BASE + item.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster';
  const backdrop = item.backdrop_path ? `url(${IMG_BASE_ORIGINAL + item.backdrop_path})` : 'none';
  
  document.getElementById('detailsBackdrop').style.backgroundImage = backdrop;
  document.getElementById('detailsPoster').src = poster;
  document.getElementById('detailsTitle').textContent = title;
  document.getElementById('detailsYear').textContent = year;
  document.getElementById('detailsRating').innerHTML = `⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 'NR'}`;
  document.getElementById('detailsRuntime').textContent = runtime ? runtime + ' min' : '';
  
  const genresContainer = document.getElementById('detailsGenres');
  genresContainer.innerHTML = '';
  item.genres?.forEach(g => {
    const span = document.createElement('span');
    span.className = 'genre-tag';
    span.textContent = g.name;
    genresContainer.appendChild(span);
  });

  document.getElementById('detailsOverview').textContent = item.overview || 'No overview available.';

  const castContainer = document.getElementById('detailsCast');
  castContainer.innerHTML = '';
  if (item.credits?.cast) {
    item.credits.cast.slice(0, 6).forEach(actor => {
      if (!actor.profile_path) return;
      const div = document.createElement('div');
      div.className = 'cast-item';
      div.innerHTML = `<img src="${IMG_BASE + actor.profile_path}" alt="${actor.name}"><div class="name">${actor.name}</div>`;
      castContainer.appendChild(div);
    });
  }

  const trailerBtn = document.getElementById('trailerBtn');
  const trailer = item.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  if (trailer) {
    trailerBtn.href = `https://www.youtube.com/watch?v=${trailer.key}`;
    trailerBtn.style.display = 'inline-block';
  } else {
    trailerBtn.style.display = 'none';
  }

  document.body.classList.add('modal-open');
  document.getElementById('detailsModal').classList.add('show');
}

function hideDetailsModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('detailsModal').classList.remove('show');
  currentItem = null;
}

// ---------- ADD MODAL ----------
let currentAddItem = null;
function showAddModal(item) {
  currentAddItem = item;
  document.body.classList.add('modal-open');
  document.getElementById('addModal').classList.add('show');
}
function hideAddModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('addModal').classList.remove('show');
  currentAddItem = null;
}

// ---------- TOAST ----------
function showToast(msg, type) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}