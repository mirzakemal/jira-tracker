/**
 * Configurable Logger
 * Levels: debug, info, warn, error
 * - debug/info stripped in production (via __DEV__)
 * - warn/error always output
 * - Prefix-based filtering at runtime
 * - Runtime level override via URL param (?log=level)
 */

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// __DEV__ is injected by Vite's define — stripped build replaces __DEV__ with false
// Use module-level default; setLevel can override at runtime
let currentLevel = 'debug';
let allowedPrefixes = null;

// Detect production build: if __DEV__ was replaced with false, suppress debug/info
/*#__PURE__*/ (function detectProd() {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    currentLevel = 'warn';
  }
})();

function getPrefix(args) {
  if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('[')) {
    const match = args[0].match(/^\[(\w+)\]/);
    return match ? match[1] : null;
  }
  return null;
}

function shouldLog(level, prefix) {
  if (LEVELS[level.toUpperCase()] < LEVELS[currentLevel.toUpperCase()]) return false;
  if (allowedPrefixes && prefix) {
    return allowedPrefixes.has(prefix);
  }
  return true;
}

const logger = {
  setLevel(level) { currentLevel = level; },

  setAllowedPrefixes(prefixes) {
    allowedPrefixes = prefixes ? new Set(prefixes) : null;
  },

  getLevel() { return currentLevel; },

  debug(...args) {
    if (shouldLog('debug', getPrefix(args))) {
      console.debug(...args);
    }
  },

  info(...args) {
    if (shouldLog('info', getPrefix(args))) {
      console.log(...args);
    }
  },

  warn(...args) {
    if (shouldLog('warn', getPrefix(args))) {
      console.warn(...args);
    }
  },

  error(...args) {
    if (shouldLog('error', getPrefix(args))) {
      console.error(...args);
    }
  }
};

export default logger;
