// service-worker.js – Orvion
//
// Strategy
//   • Navigations + same-origin HTML/CSS/JS/icons: NETWORK-FIRST (short timeout), falling back to the cache,
//     and for page navigations to /offline.html. Online users therefore always get the latest deploy;
//     nothing can get "stuck" in an old cache.
//   • TMDB API: network-first, last good response served when offline (bounded).
//   • TMDB images: cache-first (bounded).
//   • Firebase SDK files (versioned, immutable URLs): cache-first so the app shell can start offline.
//   • Firestore / Google API traffic and every non-GET request are never touched – user data is
//     always read from and written to the network, never served from this cache.
//
// Bump VERSION on every deploy that changes the precached files. On activation only Cache Storage
// entries whose names start with "orvion-" and belong to an older version are removed. localStorage,
// IndexedDB and Firestore data are never touched by this file.
const VERSION = 'v13';
const STATIC_CACHE = 'orvion-static-' + VERSION;
const RUNTIME_CACHE = 'orvion-runtime-' + VERSION;
const IMAGE_CACHE = 'orvion-images-' + VERSION;
const API_CACHE = 'orvion-api-' + VERSION;
const CURRENT_CACHES = [STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE];

const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/discover.html',
  '/search.html',
  '/watchlist.html',
  OFFLINE_URL,
  '/css/style.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/watchlist.js',
  '/js/discover.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const NETWORK_TIMEOUT_MS = 4500;
const API_TIMEOUT_MS = 9000;
// <img> requests are "opaque"; browsers count each opaque response as several MB of storage quota, so keep this modest.
const MAX_IMAGE_ENTRIES = 100;
const MAX_API_ENTRIES = 90;

// ---------------------------------------------------------------------------
// Install: precache the shell (fresh copies, bypassing the HTTP cache)
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const results = await Promise.allSettled(
      PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );
    // The offline page is the one file we cannot do without.
    const offlineIndex = PRECACHE_URLS.indexOf(OFFLINE_URL);
    if (results[offlineIndex].status === 'rejected') throw results[offlineIndex].reason;
    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------------------
// Activate: remove caches from older versions only
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('orvion-') && !CURRENT_CACHES.includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
  }
}

async function networkFirst(event, cacheName, options) {
  const request = event.request;
  const isNavigation = request.mode === 'navigate';
  const timeout = (options && options.timeout) || NETWORK_TIMEOUT_MS;
  const maxEntries = options && options.maxEntries;

  try {
    const response = await withTimeout(fetch(request), timeout);
    if (response && response.ok) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(cacheName)
          .then((cache) => cache.put(request, copy))
          .then(() => (maxEntries ? trimCache(cacheName, maxEntries) : undefined))
          .catch(() => {})
      );
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: isNavigation });
    if (cached) return cached;
    if (isNavigation) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return Response.error();
  }
}

async function cacheFirst(event, cacheName, maxEntries) {
  const request = event.request;
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Images loaded by <img> are opaque (status 0) but still worth keeping.
    if (response && (response.ok || response.type === 'opaque')) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(cacheName)
          .then((cache) => cache.put(request, copy))
          .then(() => (maxEntries ? trimCache(cacheName, maxEntries) : undefined))
          .catch(() => {})
      );
    }
    return response;
  } catch (error) {
    return Response.error();
  }
}

// ---------------------------------------------------------------------------
// Fetch routing
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // never intercept writes

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // chrome-extension:, etc.

  const host = url.hostname;

  // TMDB API
  if (host === 'api.themoviedb.org') {
    event.respondWith(networkFirst(event, API_CACHE, { timeout: API_TIMEOUT_MS, maxEntries: MAX_API_ENTRIES }));
    return;
  }

  // TMDB images
  if (host === 'image.tmdb.org') {
    event.respondWith(cacheFirst(event, IMAGE_CACHE, MAX_IMAGE_ENTRIES));
    return;
  }

  // Firebase SDK modules (versioned URLs never change)
  if (host === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(event, RUNTIME_CACHE));
    return;
  }

  // Everything else on another origin (Firestore, Google APIs, analytics, fonts…) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Same-origin: pages and static files, network-first so deploys show up immediately
  event.respondWith(networkFirst(event, STATIC_CACHE));
});
