/**
 * Landing-view resolution.
 *
 * Extracted from main.js so it can be unit tested: main.js touches the DOM at
 * import time, so importing it from a test boots the whole app.
 */

import { ROUTES } from './router.js';

/** Issue-filter params that imply the All Issues view. */
const FILTER_PARAMS = ['customer', 'fixVersion', 'status', 'product', 'tag', 'projectKey'];

/**
 * Which view the app should open on.
 *
 * The Product Board is the default landing view; an explicit route always wins,
 * so bookmarked #board / #roadmap / #all-issues links keep working.
 *
 * @param {string} route - from parseRoute()
 * @param {object} params - from parseRoute()
 * @returns {'product'|'board'|'all-issues'|'roadmap'}
 */
export function resolveInitialView(route, params = {}) {
  // An explicit route always wins, and is checked BEFORE the filter-param
  // heuristic below. Several views share param names with the issue filters —
  // the Product Board and Customer Dashboard both use `customer` — so testing
  // params first would send `#customers?customer=NTUC` to All Issues.
  const BY_ROUTE = {
    [ROUTES.ROADMAP]: 'roadmap',
    [ROUTES.ALL_ISSUES]: 'all-issues',
    [ROUTES.BOARD]: 'board',
    [ROUTES.CUSTOMERS]: 'customers',
    [ROUTES.PRODUCT]: 'product'
  };
  if (BY_ROUTE[route]) return BY_ROUTE[route];

  // No recognised route: fall back to the legacy param-based links.
  if (params.roadmap === 'true') return 'roadmap';
  if (params.allIssues === 'true') return 'all-issues';
  if (FILTER_PARAMS.some(key => params[key])) return 'all-issues';

  return 'product';
}

/** View name → route constant, for writing the landing view into the URL. */
export const ROUTE_FOR_VIEW = {
  product: ROUTES.PRODUCT,
  customers: ROUTES.CUSTOMERS,
  board: ROUTES.BOARD,
  'all-issues': ROUTES.ALL_ISSUES,
  roadmap: ROUTES.ROADMAP
};

/**
 * Customer Dashboard filters carried in the URL.
 *
 * @param {object} params
 * @returns {{customer: string, search: string}}
 */
export function customerFiltersFromParams(params = {}) {
  const first = (value) => (Array.isArray(value) ? value[0] : value) || '';
  return {
    customer: first(params.customer),
    search: first(params.search)
  };
}

/**
 * Product Board filters carried in the URL.
 *
 * paramsToFilters() only knows the issue-filter vocabulary, so the Product
 * Board reads its own params. Values arrive as strings (or arrays when a param
 * repeats) — take the first entry so the single-select controls stay coherent.
 *
 * @param {object} params
 * @returns {{customer: string, priority: string, reporter: string, search: string}}
 */
export function productFiltersFromParams(params = {}) {
  const first = (value) => (Array.isArray(value) ? value[0] : value) || '';
  return {
    customer: first(params.customer),
    priority: first(params.priority),
    reporter: first(params.reporter),
    search: first(params.search)
  };
}
