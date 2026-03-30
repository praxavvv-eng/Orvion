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
  card.className = 'card-sm';
  card.dataset.id = item.id;
  card.dataset.type = item.category === 'movie' ? 'movie' : 'tv';
  const poster = item.poster || 'https://via.placeholder.com/140x210?text=No+Image';
  const rating = item.rating ? `⭐ ${item.rating}` : '';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${item.title}" loading="lazy">
      <div class="rating-badge">${rating}</div>
    </div>
    <div class="title">${item.title}</div>
  `;
  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(item.id, item.category);
    });
    card.querySelector('.poster-container').appendChild(removeBtn);
  }
  attachCardHandlers(card);
  return card;
};

function attachCardHandlers(card) {
  let pressTimer = null;
  let longPressTriggered = false;
  let startX = 0, startY = 0;
  let isScrolling = false;

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    longPressTriggered = false;
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
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

  const handleTouchMove = (e) => {
    if (!pressTimer) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = Math.abs(touch.clientY - startY);
    if (deltaX > 8 || deltaY > 8) {
      isScrolling = true;
      cancelPress();
    }
  };

  const handleTouchEnd = (e) => {
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

  const handleTouchCancel = () => {
    cancelPress();
    isScrolling = false;
  };

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

  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: true });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
  card.addEventListener('touchcancel', handleTouchCancel, { passive: true });

  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseLeave);
}

window.enableDragScroll = function(container) {
  let isDown = false, startX, scrollLeft;
  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.style.scrollSnapType = 'none';
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
    e.preventDefault();
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

function initCustomDropdowns() {
  document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelectorAll('.dropdown-option');

    // Set initial selected if none
    if (!dropdown.querySelector('.dropdown-option.selected')) {
      const first = options[0];
      if (first) {
        first.classList.add('selected');
        selected.textContent = first.textContent;
      }
    }

    // Toggle dropdown on pointerdown
    selected.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      // Close all other dropdowns
      document.querySelectorAll('.custom-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    });

    // Option selection
    options.forEach(opt => {
      opt.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Remove selected class from all options in this dropdown
        dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selected.textContent = opt.textContent;
        // Close this dropdown
        dropdown.classList.remove('open');
      });
    });
  });

  // Close any open dropdown when clicking outside
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });
}