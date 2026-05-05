/**
 * Debounce utility
 * Returns a function that delays execution until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce(func, wait = 300) {
  let timeout;
  let cancelled = false;
  function executedFunction(...args) {
    cancelled = false;
    const later = () => {
      clearTimeout(timeout);
      if (!cancelled) {
        func(...args);
      }
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }
  executedFunction.cancel = () => {
    cancelled = true;
    clearTimeout(timeout);
  };
  return executedFunction;
}

/**
 * Throttle utility
 * Returns a function that executes at most once every wait milliseconds
 */
export function throttle(func, wait = 300) {
  let lastCall = 0;
  let timeoutId = null;

  return function throttledFunction(...args) {
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}
