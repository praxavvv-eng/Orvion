// js/app.js – Full with add/update modal logic and status update modal
import { addOrUpdateWatchlist, removeFromWatchlist, updateWatchlistStatus, getItemsByStatusAndCategory } from './watchlist.js';

let currentStatus = 'plan';
let currentExpandedCategory = null;
let currentItem = null;
let currentAddItem = null;
let isOpeningModal = false;
let autoSlideInterval = null;
let activeToast = null;
let scrollThrottleTimer = null;
let deferredPrompt = null;

const CACHE_TTL = 60 * 60 * 1000;

function showHomeSkeleton() {
  const hero = document.getElementById('heroCarousel');
  const trending = document.getElementById('trendingScroll');
  const popular = document.getElementById('popularScroll');
  const topRated = document.getElementById('topRatedScroll');
  if (hero) hero.innerHTML = '<div class="skeleton-card" style="width:70vw; max-width:260px; margin:12px auto;"></div>';
  const addSkeletonRow = (container) => {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton-card';
      container.appendChild(sk);
    }
  };
  addSkeletonRow(trending);
  addSkeletonRow(popular);
  addSkeletonRow(topRated);
}

function showDiscoverSkeleton() {
  const grid = document.getElementById('discoverGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    grid.appendChild(sk);
  }
}

function showWatchlistSkeleton() {
  const container = document.getElementById('watchlistContent');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading...</div>';
}

function getCachedData(key) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  const { data, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_TTL) {
    localStorage.removeItem(key);
    return null;
  }
  return data;
}

function setCachedData(key, data) {
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
}

function showToast(msg, type = 'success') {
  if (activeToast) {
    activeToast.classList.remove('show');
    setTimeout(() => {
      if (activeToast && activeToast.parentNode) activeToast.remove();
      activeToast = null;
      createToast(msg, type);
    }, 200);
  } else {
    createToast(msg, type);
  }
}

function createToast(msg, type) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  activeToast = toast;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      if (activeToast === toast) activeToast = null;
    }, 300);
  }, 2000);
}

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

// ---------- WATCHLIST MODAL LOGIC (Add/Update) ----------
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
      const result = await addOrUpdateWatchlist(item);
      if (result.success) {
        if (result.isUpdate) {
          showToast(`Status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`, 'success');
        } else {
          showToast('Added to watchlist', 'success');
        }
        if (document.body.classList.contains('watchlist-page')) {
          await renderWatchlist();
        }
      } else {
        showToast('Error saving item', 'error');
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
    poster: currentItem.poster_path ? window.IMG_BASE + currentItem.poster_path : 'https://dummyimage.com/300x450/1e1e1e/aaa?text=No+Poster'
  };
  // Check if item already exists to pre-select category? Not needed; modal will handle add/update.
  showAddModal(currentAddItem);
}

// Show add modal – always shows category and status dropdowns (add mode)
function showAddModal(item) {
  currentAddItem = item;
  // Reset dropdowns to default
  const categoryDropdown = document.querySelector('#categoryDropdown');
  const statusDropdown = document.querySelector('#statusDropdown');
  if (categoryDropdown) {
    const defaultOption = categoryDropdown.querySelector('.dropdown-option[data-value="movie"]');
    if (defaultOption) {
      categoryDropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
      defaultOption.classList.add('selected');
      categoryDropdown.querySelector('.dropdown-selected').textContent = defaultOption.textContent;
    }
  }
  if (statusDropdown) {
    const defaultOption = statusDropdown.querySelector('.dropdown-option[data-value="plan"]');
    if (defaultOption) {
      statusDropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
      defaultOption.classList.add('selected');
      statusDropdown.querySelector('.dropdown-selected').textContent = defaultOption.textContent;
    }
  }
  document.body.classList.add('modal-open');
  document.getElementById('addModal').classList.add('show');
}

function hideAddModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('addModal').classList.remove('show');
  currentAddItem = null;
}

// Status update modal for three-dot menu
let currentUpdatingDocId = null;
let currentUpdatingTitle = null;

function showStatusUpdateModal(docId, title, currentStatusVal) {
  currentUpdatingDocId = docId;
  currentUpdatingTitle = title;
  let modal = document.getElementById('statusUpdateModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'statusUpdateModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content add-modal-content glass">
        <div class="modal-header">
          <h3>Change Status</h3>
          <p class="modal-subtitle" id="statusUpdateTitle"></p>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>New Status</label>
            <div class="custom-dropdown" id="statusUpdateDropdown">
              <div class="dropdown-selected">Plan to Watch</div>
              <div class="dropdown-options">
                <div class="dropdown-option" data-value="plan">Plan to Watch</div>
                <div class="dropdown-option" data-value="watching">Watching</div>
                <div class="dropdown-option" data-value="completed">Completed</div>
                <div class="dropdown-option" data-value="dropped">Dropped</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn glass-btn" id="statusUpdateCancel">Cancel</button>
          <button class="btn accent-btn" id="statusUpdateSave">Update</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // Initialize custom dropdown
    const dropdown = modal.querySelector('.custom-dropdown');
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelectorAll('.dropdown-option');
    selected.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    });
    options.forEach(opt => {
      opt.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selected.textContent = opt.textContent;
        dropdown.classList.remove('open');
      });
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
      }
    });
    modal.querySelector('#statusUpdateCancel').addEventListener('click', () => {
      modal.classList.remove('show');
      document.body.classList.remove('modal-open');
    });
    modal.querySelector('#statusUpdateSave').addEventListener('click', async () => {
      const newStatusOption = modal.querySelector('#statusUpdateDropdown .dropdown-option.selected');
      const newStatus = newStatusOption ? newStatusOption.dataset.value : 'plan';
      if (currentUpdatingDocId) {
        const res = await updateWatchlistStatus(currentUpdatingDocId, newStatus);
        if (res.success) {
          let statusText = '';
          switch(newStatus) {
            case 'plan': statusText = 'Plan to Watch'; break;
            case 'watching': statusText = 'Watching'; break;
            case 'completed': statusText = 'Completed'; break;
            case 'dropped': statusText = 'Dropped'; break;
          }
          showToast(`Status updated to ${statusText}`, 'success');
          if (document.body.classList.contains('watchlist-page')) {
            await renderWatchlist();
          }
        } else {
          showToast('Failed to update status', 'error');
        }
      }
      modal.classList.remove('show');
      document.body.classList.remove('modal-open');
      currentUpdatingDocId = null;
    });
  }
  const titleSpan = modal.querySelector('#statusUpdateTitle');
  titleSpan.textContent = `"${title}"`;
  // Set current status as selected
  const currentStatusMap = {
    'plan': 'Plan to Watch',
    'watching': 'Watching',
    'completed': 'Completed',
    'dropped': 'Dropped'
  };
  const currentText = currentStatusMap[currentStatusVal] || 'Plan to Watch';
  const dropdown = modal.querySelector('#statusUpdateDropdown');
  const selectedDiv = dropdown.querySelector('.dropdown-selected');
  selectedDiv.textContent = currentText;
  const options = dropdown.querySelectorAll('.dropdown-option');
  options.forEach(opt => {
    if (opt.dataset.value === currentStatusVal) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
  document.body.classList.add('modal-open');
  modal.classList.add('show');
}

function hideStatusUpdateModal() {
  const modal = document.getElementById('statusUpdateModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    currentUpdatingDocId = null;
  }
}

// ---------- HOME LOGIC (unchanged) ----------
async function loadHome() {
  // ... (keep existing loadHome function)
}

// ---------- DISCOVER LOGIC (unchanged) ----------
let discoverIndicator = null;
let currentDiscoverType = 'movie';
let discoverPage = 1;
let discoverLoading = false;
let discoverHasMore = true;

function initDiscoverTabs() {
  // ... (keep existing)
}

async function loadDiscoverData(type, reset = true) {
  // ... (keep existing)
}

function renderDiscoverItems(items, reset) {
  // ... (keep existing)
}

function showDiscoverEmpty() {
  // ... (keep existing)
}

// ---------- WATCHLIST RENDERING (updated to pass onStatusChange) ----------
function initWatchlistTabs() {
  const tabsContainer = document.querySelector('.watchlist-tabs');
  if (!tabsContainer) return;
  const tabs = tabsContainer.querySelectorAll('.tab-btn');
  const indicator = tabsContainer.querySelector('.tab-indicator');
  function moveIndicator(active) {
    if (!indicator) return;
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
  async function tabClickHandler(e) {
    const tab = e.currentTarget;
    if (tab.classList.contains('active')) return;
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    moveIndicator(tab);
    currentStatus = tab.dataset.status;
    await renderWatchlist();
  }
  window.addEventListener('resize', () => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) moveIndicator(active);
  });
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
      const card = window.createWatchlistCard(
        item,
        async (docId) => { // onRemove
          const res = await removeFromWatchlist(docId);
          if (res.success) {
            await renderWatchlist();
            showToast('Removed from watchlist', 'success');
          } else {
            showToast('Error removing item', 'error');
          }
        },
        (docId, title, currentStatusVal) => { // onStatusChange
          showStatusUpdateModal(docId, title, currentStatusVal);
        }
      );
      scrollDiv.appendChild(card);
    });
    row.appendChild(scrollDiv);
    rows.push(row);
  }
  container.innerHTML = '';
  rows.forEach(row => container.appendChild(row));
  if (!hasAny) {
    container.innerHTML = '<div class="empty-state">📺<p>Start building your watchlist</p><span>Add movies and series</span></div>';
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
    expandedGrid.innerHTML = '<div class="empty-state">📭<p>No items in this category</p><span>Add some to your watchlist</span></div>';
  } else {
    items.forEach(item => {
      const card = window.createWatchlistCard(
        item,
        async (docId) => {
          const res = await removeFromWatchlist(docId);
          if (res.success) {
            await renderWatchlist();
            if (currentExpandedCategory === category) openExpandedView(category);
            showToast('Removed from watchlist', 'success');
          } else {
            showToast('Error removing item', 'error');
          }
        },
        (docId, title, currentStatusVal) => {
          showStatusUpdateModal(docId, title, currentStatusVal);
        }
      );
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

// ---------- DETAILS MODAL ----------
async function showItemDetails(id, type) {
  if (isOpeningModal) return;
  isOpeningModal = true;
  setTimeout(() => { isOpeningModal = false; }, 300);
  if (!id || !type) {
    console.error("Invalid item data", { id, type });
    return;
  }
  document.getElementById('detailsTitle').textContent = 'Loading...';
  document.getElementById('detailsPoster').src = 'https://dummyimage.com/300x450/1e1e1e/aaa?text=No+Poster';
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
  const poster = item.poster_path ? window.IMG_BASE + item.poster_path : 'https://dummyimage.com/300x450/1e1e1e/aaa?text=No+Poster';
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
  if (trailerBtn) {
    const videos = item.videos && item.videos.results ? item.videos.results : [];
    const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    if (trailer && trailer.key) {
      trailerBtn.href = `https://www.youtube.com/watch?v=${trailer.key}`;
      trailerBtn.style.display = 'inline-flex';
    } else {
      trailerBtn.style.display = 'none';
    }
  }
  document.body.classList.add('modal-open');
  document.getElementById('detailsModal').classList.add('show');
}

function hideDetailsModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('detailsModal').classList.remove('show');
  currentItem = null;
}

// ---------- INFINITE SCROLL (unchanged) ----------
let scrollHandlerActive = true;
function handleScroll() {
  if (!scrollHandlerActive) return;
  if (scrollThrottleTimer) return;
  scrollThrottleTimer = requestAnimationFrame(() => {
    const bodyClass = document.body.classList;
    if (bodyClass.contains('discover-page')) {
      if (!discoverLoading && discoverHasMore) {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 200) {
          loadDiscoverData(currentDiscoverType, false);
        }
      }
    }
    scrollThrottleTimer = null;
  });
}
window.addEventListener('scroll', handleScroll);

function initInstallPrompt() {
  const installBtn = document.getElementById('installAppBtn');
  if (!installBtn) return;
  installBtn.style.display = 'none';
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.style.display = 'none';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the installation`);
    deferredPrompt = null;
  });
}

// ---------- SINGLE INIT FUNCTION ----------
async function initApp() {
  initTheme();
  if (typeof initCustomDropdowns === 'function') initCustomDropdowns();
  initModals();
  initInstallPrompt();
  const bodyClass = document.body.classList;
  if (bodyClass.contains('home-page')) {
    showHomeSkeleton();
    await loadHome();
  } else if (bodyClass.contains('discover-page')) {
    showDiscoverSkeleton();
    initDiscoverTabs();
    await loadDiscoverData('movie', true);
  } else if (bodyClass.contains('watchlist-page')) {
    showWatchlistSkeleton();
    initWatchlistTabs();
    await renderWatchlist();
    setupWatchlistExpandedView();
  } else if (bodyClass.contains('search-page')) {
    if (typeof initSearch === 'function') initSearch();
    if (typeof initSearchHistory === 'function') initSearchHistory();
  }
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.removeEventListener('click', showThemeSettings);
  if (themeBtn) themeBtn.addEventListener('click', showThemeSettings);
}

document.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('beforeunload', () => {
  if (autoSlideInterval) clearInterval(autoSlideInterval);
  scrollHandlerActive = false;
  window.removeEventListener('scroll', handleScroll);
});

window.showAddModal = showAddModal;
window.showItemDetails = showItemDetails;
window.showToast = showToast;
window.renderWatchlist = renderWatchlist;
window.currentStatus = currentStatus;
window.currentAddItem = currentAddItem;
window.currentItem = currentItem;