// Waypoint service worker — offline shell + static asset caching
const CACHE = 'waypoint-v1';

// Paths to precache on install (the app shell).
const PRECACHE = ['/', '/trails/new'];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll failures are non-fatal in offline environments
      cache.addAll(PRECACHE).catch(() => {}),
    ),
  );
  // Activate immediately without waiting for existing tabs to close.
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  // Take control of all open clients immediately.
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // /_next/static/** — immutable content-hashed bundles → CacheFirst
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else (pages, fonts, images) → NetworkFirst with cache fallback.
  // Serves the cached shell when the network is unavailable.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached ?? caches.match('/')),
      ),
  );
});
