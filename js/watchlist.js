const STORAGE_KEY = 'orvion_watchlist';

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveWatchlist(list) {
  // Remove duplicate IDs (keep latest)
  const unique = list.filter((item, index, self) =>
    index === self.findIndex(i => i.id === item.id)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
}

// Adds or updates an item (moves between categories)
function addToWatchlist(item) {
  let list = getWatchlist();
  const existingIndex = list.findIndex(existing => existing.id === item.id);

  if (existingIndex !== -1) {
    // Update existing item
    list[existingIndex] = { ...list[existingIndex], ...item, added: Date.now() };
  } else {
    // Add new item
    list.push({ ...item, added: Date.now() });
  }
  saveWatchlist(list);
  return true;
}

function updateWatchlistItem(id, updates) {
  let list = getWatchlist();
  const index = list.findIndex(item => item.id === id);
  if (index !== -1) {
    list[index] = { ...list[index], ...updates };
    saveWatchlist(list);
    return true;
  }
  return false;
}

function removeFromWatchlist(id, category) {
  let list = getWatchlist();
  if (category) {
    list = list.filter(item => !(item.id === id && item.category === category));
  } else {
    list = list.filter(item => item.id !== id);
  }
  saveWatchlist(list);
  return true;
}

function getItemsByStatusAndCategory(status, category) {
  return getWatchlist()
    .filter(item => item.status === status && item.category === category)
    .sort((a, b) => b.added - a.added);
}

window.watchlist = {
  getAll: getWatchlist,
  add: addToWatchlist,
  update: updateWatchlistItem,
  remove: removeFromWatchlist,
  getByStatusAndCategory: getItemsByStatusAndCategory
};