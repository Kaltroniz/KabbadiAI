/**
 * KabadiAI Progressive Web App Service Worker (v1)
 * - Cache-first with stale-while-revalidate for static assets & map tiles
 * - Network-first for dynamic navigation and API routes
 * - Offline queue sync trigger on connectivity resumption
 */

const CACHE_NAME = "kabadiai-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/icon-32.png?v=2",
  "/icon-192.png?v=2",
  "/apple-touch-icon.png?v=2",
];

// Install Event: pre-cache critical shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Pre-caching warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: purge outdated cache buckets
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: apply appropriate caching strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 1. Map Tiles & Static CDN Assets: Stale-While-Revalidate
  if (
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.includes("/_next/static/")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 2. Navigation / HTML requests: Network-First with Offline Fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const shell = await caches.match("/");
        return shell || Response.error();
      })
    );
    return;
  }

  // 3. All other requests: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Background connectivity message listener
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
