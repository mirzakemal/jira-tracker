/**
 * Jira Planner Service Worker
 * Offline-first caching strategy with stale-while-revalidate for static assets
 * and network-first for API data with offline fallback
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `jira-planner-static-${CACHE_VERSION}`;
const API_CACHE = `jira-planner-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg'
];

// --- Install: pre-cache app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// --- Activate: clean old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('jira-planner-') && name !== STATIC_CACHE && name !== API_CACHE)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- Fetch: strategy routing ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser extensions and chrome-extension URLs
  if (!url.protocol.startsWith('http')) return;

  // API requests (to Jira or local proxy): network first, cache fallback
  if (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/agile/') ||
    url.pathname.includes('atlassian.net')
  ) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // App shell requests: cache first, then network
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Network-first with offline fallback.
 * Tries network first (with timeout), falls back to cached API response.
 */
async function networkFirstWithOfflineFallback(request) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 8000)
  );

  try {
    const response = await Promise.race([
      fetch(request),
      timeoutPromise
    ]);

    // Cache the fresh response for offline use
    if (response && response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // No cache hit — return a structured offline response
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You are offline and no cached data is available for this request.'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Stale-while-revalidate for static assets.
 * Returns cached version immediately, updates cache from network in background.
 */
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);

  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) {
      const cache = caches.open(STATIC_CACHE);
      cache.then(c => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  // If cached, return it immediately and update in background
  if (cachedResponse) {
    networkPromise; // fire and forget update
    return cachedResponse;
  }

  // No cache — wait for network
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // Completely offline and no cache — show offline page
  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jira Planner - Offline</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
      .container { text-align: center; padding: 40px; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      p { color: #888; font-size: 14px; }
      .retry { margin-top: 20px; padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    </style></head>
    <body>
      <div class="container">
        <h1>📋 Jira Planner</h1>
        <p>You're offline. Connect to the internet to load the app.</p>
        <button class="retry" onclick="location.reload()">Retry</button>
      </div>
    </body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}

// --- Message handling ---
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
