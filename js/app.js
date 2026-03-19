document.addEventListener('DOMContentLoaded', async () => {
  // Modal elements
  const addModal = document.getElementById('addModal');
  const detailsModal = document.getElementById('detailsModal');

  // Add modal custom dropdowns
  initCustomDropdowns();

  // Add modal listeners
  document.getElementById('modalCancel')?.addEventListener('click', hideAddModal);
  document.getElementById('modalSave')?.addEventListener('click', () => {
    if (!currentAddItem) return;
    const category = document.querySelector('#categoryDropdown .dropdown-option.selected')?.dataset.value || 'movie';
    const status = document.querySelector('#statusDropdown .dropdown-option.selected')?.dataset.value || 'plan';
    const item = {
      id: currentAddItem.id,
      title: currentAddItem.title,
      poster: currentAddItem.poster,
      category: category,
      status: status
    };
    const added = window.watchlist.add(item);
    if (!added) {
      showToast('Already in watchlist', 'error');
    } else {
      showToast('Added to watchlist', 'success');
    }
    hideAddModal();
    if (document.body.classList.contains('watchlist-page')) {
      renderWatchlistForStatus(currentStatus);
    }
  });

  // Details modal close
  document.getElementById('closeDetails')?.addEventListener('click', hideDetailsModal);
  detailsModal?.addEventListener('click', (e) => {
    if (e.target === detailsModal) hideDetailsModal();
  });

  // Details add button
  document.getElementById('detailsAddBtn')?.addEventListener('click', () => {
    if (!currentMovie) return;
    currentAddItem = {
      id: currentMovie.id,
      title: currentMovie.title,
      poster: currentMovie.poster_path ? IMG_BASE + currentMovie.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster'
    };
    hideDetailsModal();
    showAddModal(currentAddItem);
  });

  // Page initialization
  if (document.body.classList.contains('home-page')) {
    initHome();
  } else if (document.body.classList.contains('search-page')) {
    initSearch();
  } else if (document.body.classList.contains('watchlist-page')) {
    initWatchlistTabs();
    renderWatchlistForStatus('plan');
  }

  // Global click: card click for details, remove button handled in watchlist card creation
  document.addEventListener('click', async (e) => {
    const card = e.target.closest('.card-sm, .hero-card, .watchlist-card');
    if (card && !e.target.classList.contains('remove-btn')) {
      const movieId = card.dataset.id;
      if (movieId) {
        showMovieDetails(movieId);
      }
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });
});

// ---------- Custom Dropdown Initialization ----------
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

// ---------- HOME PAGE (simplified, static rows) ----------
async function initHome() {
  // 1. Hero carousel (trending)
  const heroContainer = document.getElementById('heroCarousel');
  const trendingData = await window.fetchTrending().catch(() => []);
  if (trendingData.length) {
    trendingData.slice(0, 8).forEach(movie => {
      heroContainer.appendChild(window.createHeroCard(movie));
    });
    setTimeout(() => {
      window.centerFirstHeroCard(heroContainer);
    }, 50);
    const firstCard = heroContainer.querySelector('.hero-card');
    if (firstCard) firstCard.classList.add('active');
    window.enableDragScroll(heroContainer);
    window.observeHeroCards(heroContainer);
  } else {
    heroContainer.innerHTML = '<div class="empty-message">No trending movies</div>';
  }

  // 2. Trending row
  const trendingScroll = document.getElementById('trendingScroll');
  if (trendingData.length) {
    trendingData.slice(0, 12).forEach(movie => {
      trendingScroll.appendChild(window.createSmallCard(movie));
    });
  } else {
    trendingScroll.innerHTML = '<div class="empty-message">No data</div>';
  }

  // 3. Popular row
  const popularScroll = document.getElementById('popularScroll');
  const popularData = await window.fetchPopular().catch(() => []);
  if (popularData.length) {
    popularData.slice(0, 12).forEach(movie => {
      popularScroll.appendChild(window.createSmallCard(movie));
    });
  } else {
    popularScroll.innerHTML = '<div class="empty-message">No data</div>';
  }

  // 4. Movies row (use popular again or discover? we'll use popular for simplicity)
  const moviesScroll = document.getElementById('moviesScroll');
  if (popularData.length) {
    popularData.slice(0, 12).forEach(movie => {
      moviesScroll.appendChild(window.createSmallCard(movie));
    });
  } else {
    moviesScroll.innerHTML = '<div class="empty-message">No data</div>';
  }

  // 5. TV Series row
  const tvScroll = document.getElementById('tvScroll');
  const tvData = await window.fetchTVPopular().catch(() => []);
  if (tvData.length) {
    tvData.slice(0, 12).forEach(show => {
      // Ensure title property
      if (!show.title && show.name) show.title = show.name;
      tvScroll.appendChild(window.createSmallCard(show));
    });
  } else {
    tvScroll.innerHTML = '<div class="empty-message">No data</div>';
  }
}

// ---------- SEARCH PAGE ----------
let searchRequestId = 0;

function initSearch() {
  const input = document.getElementById('searchInput');
  const resultsGrid = document.getElementById('searchResults');
  let timeout;

  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const query = e.target.value;
    const currentRequestId = ++searchRequestId;

    if (query.length < 2) {
      resultsGrid.innerHTML = '';
      return;
    }

    resultsGrid.innerHTML = '<div class="loading-spinner">Searching...</div>';

    timeout = setTimeout(async () => {
      const results = await window.searchMovies(query).catch(() => []);
      if (currentRequestId !== searchRequestId) return;

      resultsGrid.innerHTML = '';
      if (results.length === 0) {
        const noResults = document.createElement('p');
        noResults.className = 'empty-message';
        noResults.textContent = 'No results found';
        resultsGrid.appendChild(noResults);
      } else {
        results.forEach(movie => {
          resultsGrid.appendChild(window.createSmallCard(movie));
        });
      }
    }, 400);
  });
}

// ---------- WATCHLIST TABS (with sliding indicator) ----------
let currentStatus = 'plan';

function initWatchlistTabs() {
  const tabsContainer = document.querySelector('.watchlist-tabs');
  const tabs = tabsContainer.querySelectorAll('.tab-btn');
  const indicator = tabsContainer.querySelector('.tab-indicator');

  function moveIndicator(activeTab) {
    const tabWidth = activeTab.offsetWidth;
    const tabLeft = activeTab.offsetLeft;
    indicator.style.width = tabWidth + 'px';
    indicator.style.transform = `translateX(${tabLeft}px)`;
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

      const status = tab.dataset.status;
      currentStatus = status;
      renderWatchlistForStatus(status);
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
    const categoryLabels = { movie: 'Movies', series: 'Series', anime: 'Anime', kdrama: 'Kdrama' };

    let hasAny = false;

    categories.forEach(cat => {
      const items = window.watchlist.getByStatusAndCategory(status, cat);
      if (items.length === 0) return;

      hasAny = true;
      const rowDiv = document.createElement('div');
      rowDiv.className = 'category-row';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'category-title';
      titleDiv.innerHTML = `<h3>${categoryLabels[cat]}</h3><span class="category-badge">${items.length}</span>`;
      rowDiv.appendChild(titleDiv);

      const scrollDiv = document.createElement('div');
      scrollDiv.className = 'row-scroll';

      items.forEach(item => {
        const card = window.createWatchlistCard(item, (id, category) => {
          window.watchlist.remove(id, category);
          renderWatchlistForStatus(status);
          showToast('Removed from watchlist', 'success');
        });
        scrollDiv.appendChild(card);
      });

      rowDiv.appendChild(scrollDiv);
      container.appendChild(rowDiv);
    });

    if (!hasAny) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-watchlist';
      emptyDiv.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <p>Start building your watchlist 🎬</p>
      `;
      container.appendChild(emptyDiv);
    }

    container.classList.remove('fade-out');
  }, 150);
}

// ---------- Movie Details ----------
let currentMovie = null;

async function showMovieDetails(movieId) {
  const movie = await window.fetchMovieDetails(movieId);
  if (!movie) return;
  currentMovie = movie;

  const poster = movie.poster_path ? IMG_BASE + movie.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster';
  const backdrop = movie.backdrop_path ? `url(${IMG_BASE_ORIGINAL + movie.backdrop_path})` : 'none';
  
  document.getElementById('detailsBackdrop').style.backgroundImage = backdrop;
  document.getElementById('detailsPoster').src = poster;
  document.getElementById('detailsTitle').textContent = movie.title;
  document.getElementById('detailsYear').textContent = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  document.getElementById('detailsRating').innerHTML = `⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'NR'}`;
  document.getElementById('detailsRuntime').textContent = movie.runtime ? movie.runtime + ' min' : '';
  
  const genresContainer = document.getElementById('detailsGenres');
  genresContainer.innerHTML = '';
  if (movie.genres) {
    movie.genres.forEach(genre => {
      const span = document.createElement('span');
      span.className = 'genre-tag';
      span.textContent = genre.name;
      genresContainer.appendChild(span);
    });
  }

  document.getElementById('detailsOverview').textContent = movie.overview || 'No overview available.';

  // Cast
  const castContainer = document.getElementById('detailsCast');
  castContainer.innerHTML = '';
  if (movie.credits && movie.credits.cast) {
    movie.credits.cast.slice(0, 6).forEach(actor => {
      if (!actor.profile_path) return;
      const castItem = document.createElement('div');
      castItem.className = 'cast-item';
      castItem.innerHTML = `
        <img src="${IMG_BASE + actor.profile_path}" alt="${actor.name}">
        <div class="name">${actor.name}</div>
      `;
      castContainer.appendChild(castItem);
    });
  }

  // Trailer
  const trailerBtn = document.getElementById('trailerBtn');
  if (movie.videos && movie.videos.results) {
    const trailer = movie.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    if (trailer) {
      trailerBtn.href = `https://www.youtube.com/watch?v=${trailer.key}`;
      trailerBtn.style.display = 'inline-block';
    } else {
      trailerBtn.style.display = 'none';
    }
  } else {
    trailerBtn.style.display = 'none';
  }

  document.body.classList.add('modal-open');
  document.getElementById('detailsModal').classList.add('show');
}

function hideDetailsModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('detailsModal').classList.remove('show');
  currentMovie = null;
}

// ---------- Add Modal ----------
let currentAddItem = null;

function showAddModal(item) {
  currentAddItem = item;
  document.body.classList.add('modal-open');
  document.getElementById('addModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideAddModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('addModal').classList.remove('show');
  document.body.style.overflow = '';
  currentAddItem = null;
}

// ---------- Toast ----------
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}