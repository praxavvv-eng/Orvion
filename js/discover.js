// js/discover.js – Fixed to use data.results from new API structure
let currentType = 'movie';
let currentPage = 1;
let loading = false;
let hasMore = true;

function initDiscoverTabs() {
  const tabsContainer = document.querySelector('.discover-tabs');
  const tabs = tabsContainer.querySelectorAll('.tab-btn');
  const indicator = document.createElement('div');
  indicator.className = 'tab-indicator';
  tabsContainer.appendChild(indicator);

  function updateIndicator(activeTab) {
    const offset = activeTab.offsetLeft;
    const width = activeTab.offsetWidth;
    indicator.style.transform = `translateX(${offset}px)`;
    indicator.style.width = `${width}px`;
  }

  setTimeout(() => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) updateIndicator(active);
  }, 10);

  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateIndicator(tab);
      currentType = tab.dataset.type;
      currentPage = 1;
      hasMore = true;
      document.getElementById('discoverGrid').innerHTML = '';
      loadDiscover(currentType, currentPage);
    });
  });

  window.addEventListener('resize', () => {
    const active = tabsContainer.querySelector('.tab-btn.active');
    if (active) updateIndicator(active);
  });
}

async function loadDiscover(type, page) {
  if (loading || !hasMore) return;
  loading = true;
  document.getElementById('discoverLoader').style.display = 'block';
  let data;
  if (type === 'movie') {
    const response = await window.fetchDiscoverMovies(page);
    data = response.results || [];
  } else {
    const response = await window.fetchDiscoverTV(page);
    data = response.results || [];
  }
  document.getElementById('discoverLoader').style.display = 'none';
  if (!data.length) {
    hasMore = false;
    return;
  }
  const grid = document.getElementById('discoverGrid');
  data.forEach(item => {
    if (!item.title && item.name) item.title = item.name;
    const card = window.createSmallCard(item, type);
    grid.appendChild(card);
  });
  currentPage++;
  loading = false;
}

window.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    loadDiscover(currentType, currentPage);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initDiscoverTabs();
  loadDiscover('movie', 1);
});