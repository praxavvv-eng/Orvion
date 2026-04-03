// js/app.js - Complete with fixed watchlist rendering (loader removed)
// IMPORTANT: Run with Live Server or localhost (http://). Do NOT open file:// directly.

import { addToWatchlist, removeFromWatchlist, updateWatchlistItem, getItemsByStatusAndCategory, subscribeWatchlist } from './watchlist.js';

document.addEventListener('DOMContentLoaded', async () => {
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
});

// ---------- Modal Initialization ----------
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
      if (!window.currentAddItem) return;
      const category = document.querySelector('#categoryDropdown .dropdown-option.selected')?.dataset.value || 'movie';
      const status = document.querySelector('#statusDropdown .dropdown-option.selected')?.dataset.value || 'plan';
      const item = {
        id: window.currentAddItem.id,
        title: window.currentAddItem.title,
        poster: window.currentAddItem.poster,
        category,
        status
      };
      const result = await addToWatchlist(item);
      if (result.success) {
        showToast('Added to watchlist', 'success');
        if (document.body.classList.contains('watchlist-page')) {
          await renderWatchlist();
        }
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
  if (!window.currentItem) return;
  window.currentAddItem = {
    id: window.currentItem.id,
    title: window.currentItem.title || window.currentItem.name,
    poster: window.currentItem.poster_path ? IMG_BASE + window.currentItem.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster'
  };
  hideDetailsModal();
  showAddModal(window.currentAddItem);
}

// ---------- Home Page ----------
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
      window.fetchTrending(), window.fetchPopular(), window.fetchTopRated()
    ]);
    heroMovies = [...trending, ...popular, ...topRated]
      .sort(() => 0.5 - Math.random())
      .slice(0, 10);
    localStorage.setItem('heroMovies', JSON.stringify(heroMovies));
    localStorage.setItem('heroLastUpdate', today);
  }

  heroMovies.forEach(movie => heroContainer.appendChild(window.createHeroCard(movie)));
  setTimeout(() => window.centerFirstHeroCard(heroContainer), 50);
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

  const trending = await window.fetchTrending();
  const popular = await window.fetchPopular();
  const topRated = await window.fetchTopRated();
  trending.slice(0, 12).forEach(m => trendingScroll.appendChild(window.createSmallCard(m)));
  popular.slice(0, 12).forEach(m => popularScroll.appendChild(window.createSmallCard(m)));
  topRated.slice(0, 12).forEach(m => topRatedScroll.appendChild(window.createSmallCard(m)));
}

// ---------- Search Page ----------
let searchState = { query: '', page: 1, totalPages: 1, loading: false, hasMore: true };

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
    searchState.query = query;
    searchState.page = 1;
    searchState.hasMore = true;
    grid.innerHTML = '';
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.id = 'searchLoader';
    grid.appendChild(loader);
    timeout = setTimeout(async () => {
      await loadSearchResults(query, 1, true);
    }, 400);
  });
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
  const loader = document.getElementById('searchLoader');
  if (loader) loader.remove();
  const data = await window.searchMovies(query, page);
  if (!data || data.length === 0) {
    searchState.hasMore = false;
    searchState.loading = false;
    if (page === 1) grid.innerHTML = '<p class="empty-message">No results found</p>';
    return;
  }
  let results = data.filter(item => item.media_type !== 'person' && item.poster_path);
  results.sort((a, b) => {
    const titleA = (a.title || a.name || '').toLowerCase();
    const titleB = (b.title || b.name || '').toLowerCase();
    const q = query.toLowerCase();
    if (titleA === q && titleB !== q) return -1;
    if (titleB === q && titleA !== q) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });
  if (replace) grid.innerHTML = '';
  results.forEach(item => grid.appendChild(window.createSmallCard(item)));
  searchState.page = page;
  searchState.loading = false;
  searchState.hasMore = page < (data.total_pages || 1);
  if (searchState.hasMore) {
    const newLoader = document.createElement('div');
    newLoader.className = 'loading-spinner';
    newLoader.id = 'searchLoader';
    newLoader.style.display = 'none';
    grid.appendChild(newLoader);
  }
}

// ---------- Search History ----------
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
}

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

// ---------- Watchlist Rendering (FIXED) ----------
let currentStatus = 'plan';
let currentExpandedCategory = null;

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
  console.log("Fetching watchlist data...");

  const categories = ['movie', 'series', 'anime', 'kdrama'];
  const labels = { movie: 'Movies', series: 'Series', anime: 'Anime', kdrama: 'Kdrama' };
  let hasAny = false;
  const rows = [];

  for (const cat of categories) {
    const result = await getItemsByStatusAndCategory(currentStatus, cat);
    if (!result.success) {
      console.error(`Failed to fetch ${cat}:`, result.error);
      continue;
    }
    const items = result.items;
    if (items.length === 0) continue;
    hasAny = true;

    const row = document.createElement('div');
    row.className = 'category-row';
    row.setAttribute('data-category', cat);
    row.innerHTML = `<div class="category-title"><h3>${labels[cat]}</h3><span class="category-badge">${items.length}</span></div>`;
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'row-scroll';
    items.forEach(item => {
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

  console.log("Render complete");
}

function categoryClickHandler(e) {
  if (e.target.closest('.remove-btn')) return;
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

// ---------- Details ----------
let currentItem = null;
async function showItemDetails(id, type) {
  let item;
  if (type === 'movie') {
    item = await window.fetchMovieDetails(id);
  } else {
    item = await window.fetchTVDetails(id);
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

// ---------- Add Modal ----------
let currentAddItem = null;
function showAddModal(item) {
  window.currentAddItem = item;
  document.body.classList.add('modal-open');
  document.getElementById('addModal').classList.add('show');
}
function hideAddModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('addModal').classList.remove('show');
  window.currentAddItem = null;
}

// ---------- Toast ----------
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