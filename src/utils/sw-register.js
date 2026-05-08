/**
 * Service Worker Registration and offline state management
 */

let hasUpdate = false;
let updateCallback = null;

/**
 * Register the service worker for offline support
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) {
        hasUpdate = true;
        if (updateCallback) updateCallback(hasUpdate);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              hasUpdate = true;
              if (updateCallback) updateCallback(hasUpdate);
            }
          });
        }
      });
    }).catch(() => {
      // SW registration failed — app works without it
    });

    // Listen for new SW taking over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}

/**
 * Subscribe to update notifications
 */
export function onUpdateAvailable(callback) {
  updateCallback = callback;
  if (hasUpdate) callback(hasUpdate);
}

/**
 * Check if an update is available
 */
export function isUpdateAvailable() {
  return hasUpdate;
}

/**
 * Force the waiting service worker to activate
 */
export function applyUpdate() {
  if (!navigator.serviceWorker?.controller) return;
  const waitingWorker = navigator.serviceWorker.controller;
  // postMessage to any waiting workers
  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage('skipWaiting');
    }
  });
}
