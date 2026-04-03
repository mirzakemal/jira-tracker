/**
 * Simple Router Utilities
 * Hash-based routing with query parameters
 */

export const ROUTES = {
  BOARD: 'board',
  ALL_ISSUES: 'all-issues',
  ROADMAP: 'roadmap',
  SETTINGS: 'settings'
};

/**
 * Parse current URL hash and query parameters
 */
export function parseRoute() {
  const hash = window.location.hash.slice(1); // Remove #
  const [path, queryString] = hash.split('?');

  const route = path || ROUTES.BOARD;

  // Parse query parameters
  const params = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
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
export function onRouteChange(callback) {
  window.addEventListener('hashchange', () => {
    const { route, params } = parseRoute();
    callback({ route, params });
  });

  // Return cleanup function
  return () => {
    window.removeEventListener('hashchange', callback);
  };
}

/**
 * Update query parameters without changing route
 */
export function updateQueryParams(params, merge = true) {
  const { route, params: currentParams } = parseRoute();

  const newParams = merge
    ? { ...currentParams, ...params }
    : params;

  navigate(route, newParams);
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
  const simpleFilters = ['projectKey', 'fixVersion', 'customer', 'product', 'assigneeId', 'reporterId', 'qaTesterId', 'tag', 'searchQuery', 'updatedAfter', 'toBeTestedByDate', 'startDate', 'endDate', 'groupBy', 'zoomLevel'];
  simpleFilters.forEach(key => {
    if (filters[key]) {
      params[key] = filters[key];
    }
  });

  // Array filters (status)
  if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
    params.status = filters.status;
  }

  return params;
}

/**
 * Convert URL params to filters
 */
export function paramsToFilters(params) {
  const filters = {};

  // Simple value filters
  const simpleFilters = ['projectKey', 'fixVersion', 'customer', 'product', 'assigneeId', 'reporterId', 'qaTesterId', 'tag', 'searchQuery', 'updatedAfter', 'toBeTestedByDate', 'startDate', 'endDate', 'groupBy', 'zoomLevel'];
  simpleFilters.forEach(key => {
    if (params[key]) {
      filters[key] = params[key];
    }
  });

  // Array filters (status) - can be multiple values
  if (params.status) {
    filters.status = Array.isArray(params.status) ? params.status : [params.status];
  }

  return filters;
}
