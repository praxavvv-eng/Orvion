// js/ui.js – Full with menu button on watchlist cards
const observers = [];

function attachRipple(button) {
  button.addEventListener('click', function(e) {
    const x = e.clientX - e.target.offsetLeft;
    const y = e.clientY - e.target.offsetTop;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    this.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.btn').forEach(attachRipple);
});

function attachLongPress(card, onLongPress) {
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

  const startPress = (e) => {
    if (e.target.closest('.remove-btn')) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    isScrolling = false;
    longPressTriggered = false;
    pressTimer = setTimeout(() => {
      longPressTriggered = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, 500);
  };

  const movePress = (e) => {
    if (!pressTimer) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = Math.abs(clientX - startX);
    const deltaY = Math.abs(clientY - startY);
    if (deltaX > 8 || deltaY > 8) {
      isScrolling = true;
      cancelPress();
    }
  };

  const endPress = (e) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (longPressTriggered) {
      longPressTriggered = false;
      e.stopPropagation();
    }
    isScrolling = false;
  };

  card.addEventListener('touchstart', startPress, { passive: true });
  card.addEventListener('touchmove', movePress, { passive: true });
  card.addEventListener('touchend', endPress);
  card.addEventListener('touchcancel', cancelPress);
  card.addEventListener('mousedown', startPress);
  card.addEventListener('mousemove', movePress);
  card.addEventListener('mouseup', endPress);
  card.addEventListener('mouseleave', cancelPress);
}

window.createHeroCard = function(movie) {
  const card = document.createElement('div');
  card.className = 'hero-card';
  card.dataset.id = movie.id;
  card.dataset.type = 'movie';
  const poster = movie.poster_path ? window.IMG_BASE + movie.poster_path : 'https://dummyimage.com/300x450/1e1e1e/aaa?text=No+Image';
  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <div class="poster-container"><img src="${poster}" alt="${movie.title}" loading="lazy" onerror="this.src='https://dummyimage.com/300x450/1e1e1e/aaa?text=No+Image'"></div>
    <div class="card-gradient"></div>
    <div class="card-title">${movie.title}</div>
    <div class="card-year">${year}</div>
    <div class="card-rating">⭐ ${rating}</div>
  `;
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = card.dataset.id;
    const type = card.dataset.type;
    if (id && type) window.showItemDetails(id, type);
  });
  attachLongPress(card, () => {
    const id = card.dataset.id;
    const type = card.dataset.type;
    const title = card.querySelector('.card-title')?.textContent || '';
    const poster = card.querySelector('img')?.src || '';
    window.showAddModal({ id: Number(id), title, poster });
  });
  return card;
};

window.createSmallCard = function(item, explicitType) {
  const card = document.createElement('div');
  card.className = 'card-sm';
  card.dataset.id = item.id;
  let type = explicitType;
  if (!type) {
    type = item.media_type === 'tv' ? 'tv' : (item.title ? 'movie' : 'tv');
  }
  card.dataset.type = type;
  const poster = item.poster_path ? window.IMG_BASE + item.poster_path : 'https://dummyimage.com/140x210/1e1e1e/aaa?text=No+Image';
  const title = item.title || item.name || 'Untitled';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'NR';
  card.innerHTML = `
    <div class="poster-container">
      <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://dummyimage.com/140x210/1e1e1e/aaa?text=No+Image'">
      <div class="rating-badge">⭐ ${rating}</div>
    </div>
    <div class="title">${title}</div>
  `;
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = card.dataset.id;
    const type = card.dataset.type;
    if (id && type) window.showItemDetails(id, type);
  });
  attachLongPress(card, () => {
    const id = card.dataset.id;
    const title = card.querySelector('.title')?.textContent || '';
    const poster = card.querySelector('img')?.src || '';
    window.showAddModal({ id: Number(id), title, poster });
  });
  return card;
};

window.createWatchlistCard = function(item, onRemove, onStatusChange) {
  const card = document.createElement('div');
  card.className = 'card-sm';
  card.dataset.id = item.id;
  card.dataset.type = item.category === 'movie' ? 'movie' : 'tv';
  card.dataset.docid = item.docId;
  const poster = item.poster || 'https://dummyimage.com/140x210/1e1e1e/aaa?text=No+Image';
  const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}` : '';
  const posterContainer = document.createElement('div');
  posterContainer.className = 'poster-container';
  const img = document.createElement('img');
  img.src = poster;
  img.alt = item.title;
  img.loading = 'lazy';
  posterContainer.appendChild(img);
  const ratingBadge = document.createElement('div');
  ratingBadge.className = 'rating-badge';
  ratingBadge.textContent = rating;
  posterContainer.appendChild(ratingBadge);
  
  // Remove button (X)
  if (onRemove && item.docId) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeBtn.style.transform = 'scale(0.92)';
      setTimeout(() => { removeBtn.style.transform = ''; }, 120);
      onRemove(item.docId);
    });
    posterContainer.appendChild(removeBtn);
  }
  
  // Menu button (three dots) for status change
  if (onStatusChange && item.docId) {
    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onStatusChange(item.docId, item.title, item.status);
    });
    posterContainer.appendChild(menuBtn);
  }
  
  card.appendChild(posterContainer);
  const titleDiv = document.createElement('div');
  titleDiv.className = 'title';
  titleDiv.textContent = item.title;
  card.appendChild(titleDiv);
  
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = card.dataset.id;
    const type = card.dataset.type;
    if (id && type) window.showItemDetails(id, type);
  });
  attachLongPress(card, () => {
    const id = card.dataset.id;
    const title = card.querySelector('.title')?.textContent || '';
    const poster = card.querySelector('img')?.src || '';
    window.showAddModal({ id: Number(id), title, poster });
  });
  return card;
};

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
    if (!dropdown.querySelector('.dropdown-option.selected')) {
      const first = options[0];
      if (first) { first.classList.add('selected'); selected.textContent = first.textContent; }
    }
    selected.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
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
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });
}