// js/ui.js (unchanged from previous polished version)
const observers = [];

window.createHeroCard = function(movie) {
  const card = document.createElement('div');
  card.className = 'hero-card';
  card.dataset.id = movie.id;
  const poster = movie.poster_path ? IMG_BASE + movie.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster';
  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <img src="${poster}" alt="${movie.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
    <div class="card-gradient"></div>
    <div class="card-title">${movie.title}</div>
    <div class="card-year">${year}</div>
    <div class="card-rating">⭐ ${rating}</div>
  `;
  return card;
};

window.createSmallCard = function(movie) {
  const card = document.createElement('div');
  card.className = 'card-sm';
  card.dataset.id = movie.id;
  const poster = movie.poster_path ? IMG_BASE + movie.poster_path : 'https://via.placeholder.com/140x210?text=No+Poster';
  const title = movie.title || movie.name || 'Untitled';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
      <div class="rating-badge">⭐ ${rating}</div>
    </div>
    <div class="title">${title}</div>
  `;
  return card;
};

window.createWatchlistCard = function(item, onRemove) {
  const card = document.createElement('div');
  card.className = 'watchlist-card';
  card.dataset.id = item.id;
  card.dataset.category = item.category;
  const poster = item.poster || 'https://via.placeholder.com/140x210?text=No+Image';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${item.title}" loading="lazy">
      <button class="remove-btn" data-id="${item.id}" data-category="${item.category}">✕</button>
      <span class="category-tag">${item.category}</span>
    </div>
    <div class="title">${item.title}</div>
  `;
  card.querySelector('.remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onRemove(item.id, item.category);
  });
  return card;
};

window.enableDragScroll = function(container) {
  let isDown = false;
  let startX, scrollLeft;

  const disableSnap = () => {
    container.style.scrollSnapType = 'none';
  };
  const enableSnap = () => {
    container.style.scrollSnapType = 'x mandatory';
  };

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    disableSnap();
    container.style.cursor = 'grabbing';
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
    e.preventDefault();
  });

  container.addEventListener('mouseleave', () => {
    if (isDown) {
      isDown = false;
      container.style.cursor = 'grab';
      enableSnap();
    }
  });

  container.addEventListener('mouseup', () => {
    if (isDown) {
      isDown = false;
      container.style.cursor = 'grab';
      enableSnap();
    }
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2;
    container.scrollLeft = scrollLeft - walk;
  });

  let scrollTimeout;
  container.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!isDown) enableSnap();
    }, 100);
  });
};

window.observeHeroCards = function(container) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
        container.querySelectorAll('.hero-card').forEach(c => c.classList.remove('active'));
        entry.target.classList.add('active');
      }
    });
  }, { threshold: 0.45, root: container });

  const cards = container.querySelectorAll('.hero-card');
  cards.forEach(c => observer.observe(c));
  observers.push(observer);
  container._heroObserver = observer;
};

window.addEventListener('beforeunload', () => {
  observers.forEach(observer => observer.disconnect());
  observers.length = 0;
});

window.centerFirstHeroCard = function(container) {
  if (!container || container.children.length === 0) return;
  const card = container.children[0];
  const cardWidth = card.offsetWidth;
  const containerWidth = container.offsetWidth;
  const gap = parseInt(window.getComputedStyle(container).gap) || 12;
  const scrollLeft = (containerWidth / 2) - (cardWidth / 2) - (gap / 2);
  container.scrollLeft = scrollLeft;
};