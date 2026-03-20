const observers = [];

window.createHeroCard = function(movie) {
  const card = document.createElement('div');
  card.className = 'hero-card';
  card.dataset.id = movie.id;
  card.dataset.type = 'movie';
  const poster = movie.poster_path ? IMG_BASE + movie.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster';
  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${movie.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
    </div>
    <div class="card-gradient"></div>
    <div class="card-title">${movie.title}</div>
    <div class="card-year">${year}</div>
    <div class="card-rating">⭐ ${rating}</div>
  `;
  attachCardHandlers(card);
  return card;
};

window.createSmallCard = function(item) {
  const card = document.createElement('div');
  card.className = 'card-sm';
  card.dataset.id = item.id;
  const type = item.title ? 'movie' : 'tv';
  card.dataset.type = type;
  const poster = item.poster_path ? IMG_BASE + item.poster_path : 'https://via.placeholder.com/140x210?text=No+Poster';
  const title = item.title || item.name || 'Untitled';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
      <div class="rating-badge">⭐ ${rating}</div>
    </div>
    <div class="title">${title}</div>
  `;
  attachCardHandlers(card);
  return card;
};

window.createWatchlistCard = function(item, onRemove) {
  const card = document.createElement('div');
  card.className = 'watchlist-card';
  card.dataset.id = item.id;
  card.dataset.category = item.category;
  card.dataset.type = item.category === 'movie' ? 'movie' : 'tv';
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
  attachCardHandlers(card);
  return card;
};

// ---------- TOUCH-FRIENDLY HANDLER ----------
function attachCardHandlers(card) {
  let pressTimer = null;
  let longPressTriggered = false;
  let startX = 0, startY = 0;
  let isScrolling = false;

  // Clear timer and reset state
  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    longPressTriggered = false;
  };

  // Touch start
  const handleTouchStart = (e) => {
    // Do NOT prevent default – allow scrolling
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isScrolling = false;
    longPressTriggered = false;

    // Start long press timer
    pressTimer = setTimeout(() => {
      longPressTriggered = true;
      if (navigator.vibrate) navigator.vibrate(30);
      const id = card.dataset.id;
      const type = card.dataset.type;
      const title = card.querySelector('.card-title')?.textContent || card.querySelector('.title')?.textContent || '';
      const poster = card.querySelector('img')?.src || '';
      const item = { id: Number(id), title, poster };
      showAddModal(item);
    }, 500);
  };

  // Touch move – detect scrolling
  const handleTouchMove = (e) => {
    if (!pressTimer) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = Math.abs(touch.clientY - startY);
    if (deltaX > 8 || deltaY > 8) {
      // User is scrolling – cancel long press
      isScrolling = true;
      cancelPress();
    }
  };

  // Touch end – decide tap or nothing
  const handleTouchEnd = (e) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    if (longPressTriggered) {
      // Already handled
      longPressTriggered = false;
      return;
    }

    if (!isScrolling) {
      // It was a tap – open details
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (id && type) {
        // Small delay to avoid conflict with click events
        setTimeout(() => {
          showItemDetails(id, type);
        }, 50);
      }
    }
    isScrolling = false;
  };

  // Touch cancel (e.g., gesture interrupted)
  const handleTouchCancel = () => {
    cancelPress();
    isScrolling = false;
  };

  // Mouse events (desktop) – simplified
  const handleMouseDown = (e) => {
    if (e.target.closest('.remove-btn')) return;
    startX = e.clientX;
    startY = e.clientY;
    isScrolling = false;
    longPressTriggered = false;

    pressTimer = setTimeout(() => {
      longPressTriggered = true;
      if (navigator.vibrate) navigator.vibrate(30);
      const id = card.dataset.id;
      const type = card.dataset.type;
      const title = card.querySelector('.card-title')?.textContent || card.querySelector('.title')?.textContent || '';
      const poster = card.querySelector('img')?.src || '';
      const item = { id: Number(id), title, poster };
      showAddModal(item);
    }, 500);
  };

  const handleMouseMove = (e) => {
    if (!pressTimer) return;
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    if (deltaX > 8 || deltaY > 8) {
      isScrolling = true;
      cancelPress();
    }
  };

  const handleMouseUp = (e) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    if (!isScrolling) {
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (id && type) {
        setTimeout(() => {
          showItemDetails(id, type);
        }, 50);
      }
    }
    isScrolling = false;
  };

  const handleMouseLeave = () => {
    cancelPress();
    isScrolling = false;
  };

  // Attach touch events with passive: true (allows native scroll)
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: true });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
  card.addEventListener('touchcancel', handleTouchCancel, { passive: true });

  // Mouse events (no passive needed)
  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseLeave);
}

// ---------- Drag scroll helpers (unchanged) ----------
window.enableDragScroll = function(container) {
  let isDown = false, startX, scrollLeft;
  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.style.scrollSnapType = 'none';
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
    e.preventDefault(); // only here for desktop drag, not touch
  });
  container.addEventListener('mouseleave', () => { isDown = false; container.style.scrollSnapType = 'x mandatory'; });
  container.addEventListener('mouseup', () => { isDown = false; container.style.scrollSnapType = 'x mandatory'; });
  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    container.scrollLeft = scrollLeft - (e.pageX - container.offsetLeft - startX) * 2;
  });
  let timeout;
  container.addEventListener('scroll', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { if (!isDown) container.style.scrollSnapType = 'x mandatory'; }, 100);
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
  container.querySelectorAll('.hero-card').forEach(c => observer.observe(c));
  observers.push(observer);
};
window.addEventListener('beforeunload', () => observers.forEach(o => o.disconnect()));

window.centerFirstHeroCard = function(container) {
  if (!container.children.length) return;
  const card = container.children[0];
  const cardWidth = card.offsetWidth;
  const containerWidth = container.offsetWidth;
  const gap = parseInt(getComputedStyle(container).gap) || 12;
  container.scrollLeft = (containerWidth / 2) - (cardWidth / 2) - (gap / 2);
};