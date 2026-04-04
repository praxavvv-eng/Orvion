// service-worker.js
const CACHE_NAME = 'orvion-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/watchlist.html',
  '/discover.html',
  '/search.html',
  '/css/style.css',
  '/js/api.js',
  '/js/watchlist.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/discover.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install event – cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event – clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event – only handle http/https requests, ignore chrome-extension and other schemes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const requestScheme = event.request.url.split(':')[0];

  // Ignore unsupported schemes (chrome-extension, moz-extension, etc.)
  if (requestScheme !== 'http' && requestScheme !== 'https') {
    return;
  }

  // TMDB API – network first
  if (url.hostname === 'api.themoviedb.org') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Images – cache first
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // All other requests (HTML, CSS, JS) – cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});