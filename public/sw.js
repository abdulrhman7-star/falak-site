/* =========================================================
   Falak TV — Service Worker
   استراتيجية: Cache First للموارد الثابتة، Network First للـ API
========================================================= */

const CACHE_VERSION = 'falak-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// الملفات الأساسية التي تُخزَّن فورًا عند التثبيت
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

/* ================== INSTALL ================== */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
});

/* ================== ACTIVATE ================== */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

/* ================== FETCH ================== */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الطلبات غير GET
  if (request.method !== 'GET') return;

  // تجاهل iframe المشغلات الخارجية
  if (url.hostname !== location.hostname &&
      (url.hostname.includes('vidsrc') ||
       url.hostname.includes('vidlink') ||
       url.hostname.includes('multiembed') ||
       url.hostname.includes('youtube'))) {
    return;
  }

  // 1) طلبات TMDB API → Network First
  if (url.hostname === 'api.themoviedb.org') {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // 2) صور TMDB → Cache First (طويلة الأمد)
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 3) الخطوط → Cache First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4) الصفحة الرئيسية والملفات المحلية → Network First مع fallback
  if (url.origin === location.origin) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // 5) الباقي → Cache First
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

/* ================== STRATEGIES ================== */

// Cache First: يُستخدم للموارد الثابتة (صور، خطوط)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

// Network First: للبيانات المتغيرة (API)
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Network First للـ HTML مع offline fallback
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // في حال عدم وجود كاش، اعرض صفحة offline
    const offline = await caches.match('/offline.html');
    return offline || new Response('Offline', { status: 503 });
  }
}

/* ================== MESSAGES ================== */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
