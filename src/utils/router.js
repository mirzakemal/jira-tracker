/**
 * Simple Router Utilities
 * Hash-based routing with query parameters
 */

export const ROUTES = {
  BOARD: 'board',
  ALL_ISSUES: 'all-issues',
  ROADMAP: 'roadmap',
  VELOCITY: 'velocity',
  WORKLOAD: 'workload',
  AGING: 'aging',
  RELEASES: 'releases',
  DASHBOARD: 'dashboard',
  SETTINGS: 'settings',
  CFD: 'cfd',
  STANDUP: 'standup'
};

/**
 * Parse current URL hash and query parameters
 */
export function parseRoute() {
  const hash = window.location.hash.slice(1); // Remove #
  const [path, queryString] = hash.split('?');

  const route = path || ROUTES.BOARD;

  // Parse query parameters — handle multi-value (array) params
  const params = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    for (const [key, value] of searchParams.entries()) {
      if (params.hasOwnProperty(key)) {
        if (!Array.isArray(params[key])) {
          params[key] = [params[key]];
        }
        params[key].push(value);
      } else {
        params[key] = value;
      }
    }
  }

  return { route, params };
}

/**
 * Navigate to a route with optional parameters
 */
export function navigate(route, params = {}) {
  const searchParams = new URLSearchParams();

  // Add filter parameters
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
      } else {
        searchParams.set(key, value);
      }
    }
  });

  const queryString = searchParams.toString();
  const hash = queryString ? `${route}?${queryString}` : route;

  window.location.hash = hash;
}

/**
 * Get current route
 */
export function getCurrentRoute() {
  return parseRoute().route;
}

/**
 * Get current query parameters
 */
export function getQueryParams() {
  return parseRoute().params;
}

/**
 * Listen for route changes
 */
const routeListeners = new Map();

export function onRouteChange(callback) {
  const id = Symbol('route-listener');
  const handler = () => {
    if (internalUpdateCount > 0) return;
    const { route, params } = parseRoute();
    callback({ route, params });
  };

  window.addEventListener('hashchange', handler);
  routeListeners.set(id, handler);

  // Return cleanup function
  return () => {
    window.removeEventListener('hashchange', handler);
    routeListeners.delete(id);
  };
}

/**
 * Update query parameters without changing route
 */
let internalUpdateCount = 0;

export function updateQueryParams(params, merge = true) {
  internalUpdateCount++;
  const { route, params: currentParams } = parseRoute();

  const newParams = merge
    ? { ...currentParams, ...params }
    : params;

  navigate(route, newParams);
  // Decrement after next tick to allow hashchange to fire and skip the handler
  setTimeout(() => { internalUpdateCount--; }, 0);
}

/**
 * Remove a query parameter
 */
export function removeQueryParam(key) {
  const { route, params } = parseRoute();
  delete params[key];
  navigate(route, params);
}

/**
 * Convert filters to URL params
 */
export function filtersToParams(filters) {
  const params = {};

  // Simple value filters
  const simpleFilters = ['projectKey', 'boardId', 'sprintId', 'searchQuery', 'updatedAfter', 'toBeTestedByDate', 'createdAfter', 'createdBefore', 'resolvedAfter', 'resolvedBefore', 'tagPresence', 'startDate', 'endDate', 'groupBy', 'zoomLevel'];
  simpleFilters.forEach(key => {
    if (filters[key]) {
      params[key] = filters[key];
    }
  });

  // Array filters - can be multiple values
  const arrayFilters = ['status', 'fixVersion', 'issueType', 'customer', 'product', 'assigneeId', 'reporterId', 'qaTesterId', 'codeReviewer1Id', 'codeReviewer2Id', 'tag', 'priority', 'sprintState'];
  arrayFilters.forEach(key => {
    if (filters[key] && Array.isArray(filters[key]) && filters[key].length > 0) {
      params[key] = filters[key];
    } else if (filters[key] && !Array.isArray(filters[key])) {
      // Handle legacy single-value format
      params[key] = filters[key];
    }
  });

  return params;
}

/**
 * Convert URL params to filters
 */
export function paramsToFilters(params) {
  const filters = {};

  // Simple value filters
  const simpleFilters = ['projectKey', 'boardId', 'sprintId', 'searchQuery', 'updatedAfter', 'toBeTestedByDate', 'createdAfter', 'createdBefore', 'resolvedAfter', 'resolvedBefore', 'tagPresence', 'startDate', 'endDate', 'groupBy', 'zoomLevel'];
  simpleFilters.forEach(key => {
    if (params[key]) {
      filters[key] = params[key];
    }
  });

  // Array filters - can be multiple values
  const arrayFilters = ['status', 'fixVersion', 'issueType', 'customer', 'product', 'assigneeId', 'reporterId', 'qaTesterId', 'codeReviewer1Id', 'codeReviewer2Id', 'tag', 'priority', 'sprintState'];
  arrayFilters.forEach(key => {
    if (params[key]) {
      filters[key] = Array.isArray(params[key]) ? params[key] : [params[key]];
    }
  });

  return filters;
}
