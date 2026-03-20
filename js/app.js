document.addEventListener('DOMContentLoaded', async () => {
  initCustomDropdowns();
  initModals();

  if (document.body.classList.contains('home-page')) {
    initHome();
  } else if (document.body.classList.contains('search-page')) {
    initSearch();
  } else if (document.body.classList.contains('watchlist-page')) {
    initWatchlistTabs();
    renderWatchlistForStatus('plan');
  } else if (document.body.classList.contains('discover-page')) {
    // discover.js handles itself
  }

  // Global click: card click for details
  document.addEventListener('click', async (e) => {
    const card = e.target.closest('.card-sm, .hero-card, .watchlist-card');
    if (card && !e.target.classList.contains('remove-btn')) {
      const id = card.dataset.id;
      const type = card.dataset.type; // 'movie' or 'tv'
      if (id && type) {
        showItemDetails(id, type);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });
});

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

// ---------- HOME (unchanged, but uses createSmallCard from ui.js) ----------
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

  let autoSlideInterval = setInterval(() => {
    const container = heroContainer;
    const activeCard = container.querySelector('.hero-card.active');
    if (!activeCard) return;
    const next = activeCard.nextElementSibling || container.firstElementChild;
    if (next) {
      next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 4000);
  heroContainer.addEventListener('touchstart', () => clearInterval(autoSlideInterval));
  heroContainer.addEventListener('mousedown', () => clearInterval(autoSlideInterval));

  const trending = await fetchTrending();
  const popular = await fetchPopular();
  const topRated = await fetchTopRated();
  trending.slice(0, 12).forEach(m => trendingScroll.appendChild(createSmallCard(m)));
  popular.slice(0, 12).forEach(m => popularScroll.appendChild(createSmallCard(m)));
  topRated.slice(0, 12).forEach(m => topRatedScroll.appendChild(createSmallCard(m)));
}

// ---------- SEARCH (unchanged) ----------
let searchRequestId = 0;
function initSearch() {
  const input = document.getElementById('searchInput');
  const grid = document.getElementById('searchResults');
  let timeout;
  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const query = e.target.value;
    const reqId = ++searchRequestId;
    if (query.length < 2) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = '<div class="loading-spinner">Searching...</div>';
    timeout = setTimeout(async () => {
      const results = await searchMovies(query);
      if (reqId !== searchRequestId) return;
      grid.innerHTML = '';
      if (results.length === 0) {
        grid.innerHTML = '<p class="empty-message">No results found</p>';
      } else {
        results.forEach(m => grid.appendChild(createSmallCard(m)));
      }
    }, 400);
  });
}

// ---------- WATCHLIST (unchanged) ----------
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

// ---------- DETAILS (handles both movie and TV) ----------
let currentItem = null; // renamed from currentMovie

async function showItemDetails(id, type) {
  let item;
  if (type === 'movie') {
    item = await fetchMovieDetails(id);
  } else {
    item = await fetchTVDetails(id);
  }
  if (!item) return;
  currentItem = item;

  // Normalize title and other fields
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