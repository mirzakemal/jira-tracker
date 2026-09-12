/**
 * Jira Planner Service Worker
 * Stale-while-revalidate for the app shell. API requests are NOT intercepted:
 * the app's offline story is its IndexedDB cache, not this worker.
 */

// Bumped to v2: purges the old caches, which held authenticated Jira API
// responses that v2 no longer stores at all.
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `jira-planner-static-${CACHE_VERSION}`;

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
          // Anything that isn't the current static cache goes — including the
          // old jira-planner-api-* caches of authenticated Jira responses.
          .filter(name => name.startsWith('jira-planner-') && name !== STATIC_CACHE)
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

  // API requests (Jira/Confluence, direct or via the dev proxy): pass straight
  // through to the network.
  //
  // This worker used to race them against an 8s timeout and, on loss, return a
  // synthetic 503. Two problems with that:
  //   1. api/jira.js maps any 5xx to "Jira server error. Please try again
  //      later", so a slow-but-healthy Jira was reported as a server fault.
  //   2. It cached authenticated Jira responses in the Cache API, which is both
  //      redundant (the app's offline story is IndexedDB) and a place for
  //      someone else's data to sit on disk.
  //
  // JiraClient already enforces its own 30s AbortController timeout, and a real
  // network failure now surfaces as a genuine fetch error the app reports as
  // "Network error" rather than blaming the server.
  if (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/agile/') ||
    url.pathname.startsWith('/wiki/') ||
    url.pathname.includes('atlassian.net')
  ) {
    return;
  }

  // App shell requests: cache first, then network
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Stale-while-revalidate for static assets.
 * Returns cached version immediately, updates cache from network in background.
 */
async function staleWhileRevalidate(request) {
  const isNavigation = request.mode === 'navigate';

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

  // An asset (script, style, image) with no cache and no network: let it fail
  // as a network error. Returning an HTML offline page in its place would be
  // parsed as that asset and produce a far more confusing failure.
  if (!isNavigation) {
    return Response.error();
  }

  // A navigation with nothing cached — show the offline page.
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
