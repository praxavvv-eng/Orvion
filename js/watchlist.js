const STORAGE_KEY = 'orvion_watchlist';

// Get watchlist from localStorage
function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    console.warn('Failed to parse watchlist', e);
    return [];
  }
}

// Save watchlist, removing duplicates by ID (keep latest)
function saveWatchlist(list) {
  const unique = list.reduce((acc, current) => {
    const existing = acc.find(item => item.id === current.id);
    if (!existing) {
      acc.push(current);
    } else {
      // replace with newer (or merge)
      Object.assign(existing, current);
    }
    return acc;
  }, []);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
}

// Add or update an item – moves between categories (no duplicates)
function addToWatchlist(item) {
  let list = getWatchlist();
  const existingIndex = list.findIndex(existing => existing.id === item.id);

  if (existingIndex !== -1) {
    // Update existing item (category, status, poster, title)
    list[existingIndex] = {
      ...list[existingIndex],
      ...item,
      added: Date.now() // refresh timestamp
    };
  } else {
    // Add new item
    list.push({ ...item, added: Date.now() });
  }
  saveWatchlist(list);
  return true;
}

// Update an item by ID (partial update)
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

// Remove item by ID and optionally category (if category provided, remove exact match)
function removeFromWatchlist(id, category = null) {
  let list = getWatchlist();
  if (category) {
    list = list.filter(item => !(item.id === id && item.category === category));
  } else {
    list = list.filter(item => item.id !== id);
  }
  saveWatchlist(list);
  return true;
}

// Get items filtered by status and category, sorted by newest first
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