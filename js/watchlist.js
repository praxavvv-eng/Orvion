const STORAGE_KEY = 'cinestack_watchlist';

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function addToWatchlist(item) {
  const list = getWatchlist();
  if (list.some(existing => existing.id === item.id && existing.category === item.category)) return false;
  list.push({ ...item, added: Date.now() });
  saveWatchlist(list);
  return true;
}
function removeFromWatchlist(id, category) {
  saveWatchlist(getWatchlist().filter(item => !(item.id === id && item.category === category)));
  return true;
}
function getItemsByStatusAndCategory(status, category) {
  return getWatchlist()
    .filter(item => item.status === status && item.category === category)
    .sort((a, b) => b.added - a.added);
}
window.watchlist = { getAll: getWatchlist, add: addToWatchlist, remove: removeFromWatchlist, getByStatusAndCategory: getItemsByStatusAndCategory };