document.addEventListener('DOMContentLoaded', () => {
  initDiscoverTabs();
  loadDiscover('movie', 1);
});

let currentType = 'movie';
let currentPage = 1;
let loading = false;
let hasMore = true;

function initDiscoverTabs() {
  const tabs = document.querySelectorAll('.discover-tabs .tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      currentPage = 1;
      hasMore = true;
      document.getElementById('discoverGrid').innerHTML = '';
      loadDiscover(currentType, currentPage);
    });
  });
}

async function loadDiscover(type, page) {
  if (loading || !hasMore) return;
  loading = true;
  document.getElementById('discoverLoader').style.display = 'block';
  const data = type === 'movie' ? await fetchDiscoverMovies(page) : await fetchDiscoverTV(page);
  document.getElementById('discoverLoader').style.display = 'none';
  if (!data.length) {
    hasMore = false;
    return;
  }
  const grid = document.getElementById('discoverGrid');
  data.forEach(item => {
    if (!item.title && item.name) item.title = item.name;
    grid.appendChild(createSmallCard(item));
  });
  currentPage++;
  loading = false;
}

// Infinite scroll
window.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    loadDiscover(currentType, currentPage);
  }
});