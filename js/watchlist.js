// js/watchlist.js
const STORAGE_KEY = 'cinestack_watchlist';

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function addToWatchlist(item) {
  const list = getWatchlist();
  const exists = list.some(existing => existing.id === item.id && existing.category === item.category);
  if (exists) return false;

  const newItem = {
    ...item,
    added: Date.now()
  };
  list.push(newItem);
  saveWatchlist(list);
  return true;
}

function removeFromWatchlist(id, category) {
  const list = getWatchlist();
  const filtered = list.filter(item => !(item.id === id && item.category === category));
  saveWatchlist(filtered);
  return true;
}

function getItemsByStatusAndCategory(status, category) {
  const list = getWatchlist();
  return list
    .filter(item => item.status === status && item.category === category)
    .sort((a, b) => b.added - a.added);
}

window.watchlist = {
  getAll: getWatchlist,
  add: addToWatchlist,
  remove: removeFromWatchlist,
  getByStatusAndCategory: getItemsByStatusAndCategory
};