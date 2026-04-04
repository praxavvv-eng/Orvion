// js/app.js – Full with fixed search, theme, watchlist, modals
import { addToWatchlist, removeFromWatchlist, getItemsByStatusAndCategory } from './watchlist.js';

let currentStatus = 'plan';
let currentExpandedCategory = null;
let currentItem = null;
let currentAddItem = null;
let isOpeningModal = false;

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  if (typeof initCustomDropdowns === 'function') initCustomDropdowns();
  initModals();

  if (document.body.classList.contains('home-page')) {
    initHome();
  } else if (document.body.classList.contains('search-page')) {
    initSearch();
    initSearchHistory();
  } else if (document.body.classList.contains('watchlist-page')) {
    initWatchlistTabs();
    await renderWatchlist();
    setupWatchlistExpandedView();
  }

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', showThemeSettings);
});

// ---------- THEME SYSTEM ----------
function initTheme() {
  const savedTheme = localStorage.getItem('orvion-theme') || 'dark';
  const savedColor = localStorage.getItem('orvion-color') || 'purple';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('data-color', savedColor);
  if (savedTheme === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('orvion-theme') === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }
}

function showThemeSettings() {
  let modal = document.getElementById('themeSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'themeSettingsModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content glass" style="width: 280px;">
        <h3>Customize</h3>
        <div class="theme-option-group">
          <label>Mode</label>
          <div class="theme-buttons">
            <button data-mode="dark">Dark</button>
            <button data-mode="light">Light</button>
            <button data-mode="system">System</button>
          </div>
        </div>
        <div class="theme-option-group">
          <label>Accent Color</label>
          <div class="color-buttons">
            <button data-color="purple" style="background:#7c3aed"></button>
            <button data-color="blue" style="background:#3b82f6"></button>
            <button data-color="red" style="background:#ef4444"></button>
            <button data-color="green" style="background:#10b981"></button>
          </div>
        </div>
        <button class="btn glass-btn" id="closeThemeModal">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
    modal.querySelector('#closeThemeModal').addEventListener('click', () => {
      modal.classList.remove('show');
    });
    modal.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        localStorage.setItem('orvion-theme', mode);
        if (mode === 'system') {
          const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
        } else {
          document.documentElement.setAttribute('data-theme', mode);
        }
        modal.classList.remove('show');
      });
    });
    modal.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        localStorage.setItem('orvion-color', color);
        document.documentElement.setAttribute('data-color', color);
        modal.classList.remove('show');
      });
    });
  }
  modal.classList.add('show');
}

// ---------- MODAL INITIALIZATION (with lock) ----------
function initModals() {
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn = document.getElementById('modalSave');
  const closeDetailsBtn = document.getElementById('closeDetails');
  const detailsModal = document.getElementById('detailsModal');
  const detailsAddBtn = document.getElementById('detailsAddBtn');

  if (cancelBtn) {
    cancelBtn.removeEventListener('click', hideAddModal);
    cancelBtn.addEventListener('click', hideAddModal);
  }

  if (saveBtn) {
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const freshSaveBtn = document.getElementById('modalSave');
    freshSaveBtn.addEventListener('click', async () => {
      if (!currentAddItem) return;
      const category = document.querySelector('#categoryDropdown .dropdown-option.selected')?.dataset.value || 'movie';
      const status = document.querySelector('#statusDropdown .dropdown-option.selected')?.dataset.value || 'plan';
      const item = {
        id: currentAddItem.id,
        title: currentAddItem.title,
        poster: currentAddItem.poster,
        category,
        status
      };
      const result = await addToWatchlist(item);
      if (result.success) {
        showToast('Added to watchlist', 'success');
        if (document.body.classList.contains('watchlist-page')) {
          await renderWatchlist();
        }
      } else if (result.error === 'already_exists') {
        showToast('Already in watchlist', 'error');
      } else {
        showToast('Error adding item', 'error');
      }
      hideAddModal();
    });
  }

  if (closeDetailsBtn) {
    closeDetailsBtn.removeEventListener('click', hideDetailsModal);
    closeDetailsBtn.addEventListener('click', hideDetailsModal);
  }
  if (detailsModal) {
    detailsModal.removeEventListener('click', hideDetailsModal);
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) hideDetailsModal();
    });
  }
  if (detailsAddBtn) {
    detailsAddBtn.removeEventListener('click', detailsAddHandler);
    detailsAddBtn.addEventListener('click', detailsAddHandler);
  }
}

function detailsAddHandler() {
  if (!currentItem) return;
  currentAddItem = {
    id: currentItem.id,
    title: currentItem.title || currentItem.name,
    poster: currentItem.poster_path ? window.IMG_BASE + currentItem.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster'
  };
  hideDetailsModal();
  showAddModal(currentAddItem);
}

// ---------- HOME PAGE (with fallback) ----------
async function initHome() {
  const heroContainer = document.getElementById('heroCarousel');
  const trendingScroll = document.getElementById('trendingScroll');
  const popularScroll = document.getElementById('popularScroll');
  const topRatedScroll = document.getElementById('topRatedScroll');

  if (!heroContainer) return;

  try {
    const trendingData = await window.fetchTrending().catch(err => { console.error("Trending fetch failed:", err); return []; });
    const popularData = await window.fetchPopular().catch(err => { console.error("Popular fetch failed:", err); return []; });
    const topRatedData = await window.fetchTopRated().catch(err => { console.error("TopRated fetch failed:", err); return []; });

    const allMovies = [...trendingData, ...popularData, ...topRatedData];
    if (allMovies.length === 0) {
      heroContainer.innerHTML = '<div class="empty-message">No movies available</div>';
      return;
    }

    const shuffled = allMovies.sort(() => 0.5 - Math.random());
    const heroMovies = shuffled.slice(0, 10);

    heroContainer.innerHTML = '';
    heroMovies.forEach(movie => {
      if (movie && movie.id) {
        heroContainer.appendChild(window.createHeroCard(movie));
      }
    });

    setTimeout(() => window.centerFirstHeroCard(heroContainer), 100);
    const firstCard = heroContainer.querySelector('.hero-card');
    if (firstCard) firstCard.classList.add('active');
    window.enableDragScroll(heroContainer);
    window.observeHeroCards(heroContainer);

    let autoSlideInterval = setInterval(() => {
      const container = heroContainer;
      const activeCard = container.querySelector('.hero-card.active');
      if (!activeCard) return;
      const next = activeCard.nextElementSibling || container.firstElementChild;
      if (next) {
        const containerRect = container.getBoundingClientRect();
        const cardRect = next.getBoundingClientRect();
        const targetLeft = container.scrollLeft + (cardRect.left - containerRect.left) - (containerRect.width / 2) + (cardRect.width / 2);
        container.scrollTo({ left: targetLeft, behavior: 'smooth' });
      }
    }, 4000);
    heroContainer.addEventListener('touchstart', () => clearInterval(autoSlideInterval), { once: true });
    heroContainer.addEventListener('mousedown', () => clearInterval(autoSlideInterval), { once: true });

    trendingData.slice(0, 12).forEach(m => trendingScroll.appendChild(window.createSmallCard(m)));
    popularData.slice(0, 12).forEach(m => popularScroll.appendChild(window.createSmallCard(m)));
    topRatedData.slice(0, 12).forEach(m => topRatedScroll.appendChild(window.createSmallCard(m)));
  } catch (error) {
    console.error("Home init error:", error);
    heroContainer.innerHTML = '<div class="empty-message">Failed to load movies</div>';
  }
}

// ==================== SEARCH (FIXED) ====================
let searchTimeout;
let currentSearchQuery = '';
let searchPage = 1;
let isLoadingSearch = false;
let hasMoreSearch = true;
let totalSearchPages = 1;
let seenSearchIds = new Set();

function initSearch() {
  const input = document.getElementById('searchInput');
  const resultsGrid = document.getElementById('searchResults');
  if (!input) return;

  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    currentSearchQuery = query;
    if (query.length < 2) {
      resultsGrid.innerHTML = '';
      seenSearchIds.clear();
      return;
    }
    showSearchSkeleton();
    searchTimeout = setTimeout(() => performSearch(query, 1, true), 300);
  });

  // Infinite scroll
  window.addEventListener('scroll', () => {
    if (!currentSearchQuery || isLoadingSearch || !hasMoreSearch) return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      performSearch(currentSearchQuery, searchPage + 1, false);
    }
  });
}

async function performSearch(query, page, replace) {
  if (isLoadingSearch) return;
  isLoadingSearch = true;
  try {
    const [movieData, tvData] = await Promise.all([
      window.searchMovies(query, page),
      window.searchTV(query, page)
    ]);
    console.log(`Search ${query} page ${page}: movies=${movieData.results?.length || 0}, tv=${tvData.results?.length || 0}`);

    let combined = [
      ...(movieData.results || []).map(m => ({ ...m, media_type: 'movie' })),
      ...(tvData.results || []).map(t => ({ ...t, media_type: 'tv' }))
    ];

    // Remove duplicates by id + media_type
    const uniqueMap = new Map();
    for (const item of combined) {
      const key = `${item.id}_${item.media_type}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, item);
    }
    combined = Array.from(uniqueMap.values());

    const totalPagesMovie = movieData.total_pages || 1;
    const totalPagesTV = tvData.total_pages || 1;
    totalSearchPages = Math.max(totalPagesMovie, totalPagesTV);

    if (replace) {
      // First page: rank results, reset seen set
      const ranked = rankSearchResults(combined, query);
      seenSearchIds.clear();
      ranked.forEach(item => seenSearchIds.add(`${item.id}_${item.media_type}`));
      document.getElementById('searchResults').innerHTML = '';
      searchPage = page;
      renderSearchResults(ranked);
      hasMoreSearch = searchPage < totalSearchPages;
    } else {
      // Append only new items
      const newItems = combined.filter(item => !seenSearchIds.has(`${item.id}_${item.media_type}`));
      if (newItems.length === 0) {
        hasMoreSearch = false;
      } else {
        newItems.forEach(item => seenSearchIds.add(`${item.id}_${item.media_type}`));
        renderSearchResults(newItems, false);
        searchPage = page;
        hasMoreSearch = page < totalSearchPages;
      }
    }
  } catch (err) {
    console.error('Search error', err);
    if (replace) showNoSearchResults();
  } finally {
    isLoadingSearch = false;
  }
}

function rankSearchResults(items, query) {
  const q = query.toLowerCase();
  return items.sort((a, b) => {
    const aTitle = (a.title || a.name || '').toLowerCase();
    const bTitle = (b.title || b.name || '').toLowerCase();
    if (aTitle === q && bTitle !== q) return -1;
    if (bTitle === q && aTitle !== q) return 1;
    if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
    if (bTitle.startsWith(q) && !aTitle.startsWith(q)) return 1;
    if (aTitle.includes(q) && !bTitle.includes(q)) return -1;
    if (bTitle.includes(q) && !aTitle.includes(q)) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });
}

function renderSearchResults(items, append = false) {
  const grid = document.getElementById('searchResults');
  if (!append) grid.innerHTML = '';
  items.forEach(item => {
    // Ensure item has title/name
    const cardItem = {
      id: item.id,
      title: item.title || item.name,
      name: item.name,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      media_type: item.media_type
    };
    const card = window.createSmallCard(cardItem, item.media_type);
    grid.appendChild(card);
  });
}

function showSearchSkeleton() {
  const grid = document.getElementById('searchResults');
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'card-skeleton';
    grid.appendChild(skeleton);
  }
}

function showNoSearchResults() {
  const grid = document.getElementById('searchResults');
  grid.innerHTML = '<p class="empty-message">No results found</p>';
}

// ---------- SEARCH HISTORY (unchanged) ----------
function initSearchHistory() {
  const HISTORY_KEY = 'searchHistory';
  const MAX_HISTORY = 10;
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
      html += `<div class="history-item" data-query="${q}"><span class="query">${q}</span><button class="delete-item" data-query="${q}">✕</button></div>`;
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
    if (clearBtn) clearBtn.addEventListener('click', () => { clearSearchHistory(); renderHistory(); });
  }
  input.addEventListener('focus', () => { if (getSearchHistory().length > 0) renderHistory(); });
  input.addEventListener('blur', () => { setTimeout(() => historyContainer.classList.remove('show'), 200); });
  input.addEventListener('change', () => { const q = input.value.trim(); if (q.length >= 2) addSearchHistory(q); });
  function getSearchHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
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
  function clearSearchHistory() { localStorage.removeItem(HISTORY_KEY); }
}

// ---------- WATCHLIST RENDERING (with click fix) ----------
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
    tab.removeEventListener('click', tabClickHandler);
    tab.addEventListener('click', tabClickHandler);
  });
  window.addEventListener('resize', () => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) moveIndicator(active);
  });
}

async function tabClickHandler(e) {
  const tab = e.currentTarget;
  if (tab.classList.contains('active')) return;
  const tabs = document.querySelectorAll('.watchlist-tabs .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const indicator = document.querySelector('.watchlist-tabs .tab-indicator');
  indicator.style.width = tab.offsetWidth + 'px';
  indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
  currentStatus = tab.dataset.status;
  await renderWatchlist();
}

async function renderWatchlist() {
  const container = document.getElementById('watchlistContent');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const categories = ['movie', 'series', 'anime', 'kdrama'];
  const labels = { movie: 'Movies', series: 'Series', anime: 'Anime', kdrama: 'Kdrama' };
  let hasAny = false;
  const rows = [];
  for (const cat of categories) {
    const result = await getItemsByStatusAndCategory(currentStatus, cat);
    if (!result.success || result.items.length === 0) continue;
    hasAny = true;
    const row = document.createElement('div');
    row.className = 'category-row';
    row.setAttribute('data-category', cat);
    row.innerHTML = `<div class="category-title"><h3>${labels[cat]}</h3><span class="category-badge">${result.items.length}</span></div>`;
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'row-scroll';
    result.items.forEach(item => {
      const card = window.createWatchlistCard(item, async (docId) => {
        const res = await removeFromWatchlist(docId);
        if (res.success) {
          await renderWatchlist();
          showToast('Removed from watchlist', 'success');
        } else {
          showToast('Error removing item', 'error');
        }
      });
      scrollDiv.appendChild(card);
    });
    row.appendChild(scrollDiv);
    rows.push(row);
  }
  container.innerHTML = '';
  rows.forEach(row => container.appendChild(row));
  if (!hasAny) {
    container.innerHTML = '<div class="empty-watchlist"><svg viewBox="0 0 24 24" stroke="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>Start building your watchlist</p></div>';
  }
  document.querySelectorAll('.category-row').forEach(row => {
    row.removeEventListener('click', categoryClickHandler);
    row.addEventListener('click', categoryClickHandler);
  });
}

function categoryClickHandler(e) {
  if (e.target.closest('.card-sm')) return;
  const category = e.currentTarget.getAttribute('data-category');
  openExpandedView(category);
}

function setupWatchlistExpandedView() {
  const backBtn = document.getElementById('expandedBackBtn');
  if (backBtn) {
    backBtn.removeEventListener('click', closeExpandedView);
    backBtn.addEventListener('click', closeExpandedView);
  }
}

async function openExpandedView(category) {
  currentExpandedCategory = category;
  const normalView = document.getElementById('watchlistNormalView');
  const expandedView = document.getElementById('watchlistExpandedView');
  const expandedTitle = document.getElementById('expandedTitle');
  const expandedGrid = document.getElementById('expandedGrid');
  const labels = { movie: 'Movies', series: 'Series', anime: 'Anime', kdrama: 'Kdrama' };
  expandedTitle.textContent = labels[category] || 'Movies';
  const result = await getItemsByStatusAndCategory(currentStatus, category);
  const items = result.success ? result.items : [];
  expandedGrid.innerHTML = '';
  if (items.length === 0) {
    expandedGrid.innerHTML = '<p class="empty-message">No items in this category</p>';
  } else {
    items.forEach(item => {
      const card = window.createWatchlistCard(item, async (docId) => {
        const res = await removeFromWatchlist(docId);
        if (res.success) {
          await renderWatchlist();
          if (currentExpandedCategory === category) openExpandedView(category);
          showToast('Removed from watchlist', 'success');
        } else {
          showToast('Error removing item', 'error');
        }
      });
      expandedGrid.appendChild(card);
    });
  }
  normalView.style.display = 'none';
  expandedView.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeExpandedView() {
  const normalView = document.getElementById('watchlistNormalView');
  const expandedView = document.getElementById('watchlistExpandedView');
  normalView.style.display = 'block';
  expandedView.style.display = 'none';
  document.body.style.overflow = '';
  currentExpandedCategory = null;
}

// ---------- DETAILS MODAL (with lock) ----------
async function showItemDetails(id, type) {
  if (isOpeningModal) return;
  isOpeningModal = true;
  setTimeout(() => { isOpeningModal = false; }, 300);
  if (!id || !type) {
    console.error("Invalid item data", { id, type });
    return;
  }
  document.getElementById('detailsTitle').textContent = 'Loading...';
  document.getElementById('detailsPoster').src = 'https://via.placeholder.com/300x450?text=No+Image';
  document.getElementById('detailsOverview').textContent = 'Loading...';
  document.getElementById('detailsGenres').innerHTML = '';
  document.getElementById('detailsCast').innerHTML = '';
  document.getElementById('detailsRuntime').textContent = '';
  let item;
  if (type === 'movie') {
    item = await window.fetchMovieDetails(id);
  } else if (type === 'tv') {
    item = await window.fetchTVDetails(id);
  } else {
    console.error("Unknown type:", type);
    isOpeningModal = false;
    return;
  }
  if (!item) {
    console.error("Failed to fetch details", id, type);
    showToast('Failed to load details', 'error');
    isOpeningModal = false;
    return;
  }
  currentItem = item;
  const title = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
  const runtime = item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null);
  const poster = item.poster_path ? window.IMG_BASE + item.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster';
  const backdrop = item.backdrop_path ? `url(${window.IMG_BASE_ORIGINAL + item.backdrop_path})` : 'none';
  document.getElementById('detailsBackdrop').style.backgroundImage = backdrop;
  document.getElementById('detailsPoster').src = poster;
  document.getElementById('detailsTitle').textContent = title;
  document.getElementById('detailsYear').textContent = year;
  document.getElementById('detailsRating').innerHTML = `⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 'NR'}`;
  document.getElementById('detailsRuntime').textContent = runtime ? runtime + ' min' : '';
  const genresContainer = document.getElementById('detailsGenres');
  genresContainer.innerHTML = '';
  if (item.genres) {
    item.genres.forEach(g => {
      const span = document.createElement('span');
      span.className = 'genre-tag';
      span.textContent = g.name;
      genresContainer.appendChild(span);
    });
  }
  document.getElementById('detailsOverview').textContent = item.overview || 'No overview available.';
  const castContainer = document.getElementById('detailsCast');
  castContainer.innerHTML = '';
  if (item.credits && item.credits.cast) {
    item.credits.cast.slice(0, 6).forEach(actor => {
      if (!actor.profile_path) return;
      const div = document.createElement('div');
      div.className = 'cast-item';
      div.innerHTML = `<img src="${window.IMG_BASE + actor.profile_path}" alt="${actor.name}"><div class="name">${actor.name}</div>`;
      castContainer.appendChild(div);
    });
  }
  const trailerBtn = document.getElementById('trailerBtn');
  const trailer = item.videos && item.videos.results ? item.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') : null;
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

// Expose globals
window.showAddModal = showAddModal;
window.showItemDetails = showItemDetails;
window.showToast = showToast;
window.renderWatchlist = renderWatchlist;
window.currentStatus = currentStatus;
window.currentAddItem = currentAddItem;
window.currentItem = currentItem;