/**
 * Landing-view resolution.
 *
 * Extracted from main.js so it can be unit tested: main.js touches the DOM at
 * import time, so importing it from a test boots the whole app.
 */

import { ROUTES } from './router.js';

/** Route → view name, for every view the tab bar offers. */
const BY_ROUTE = {
  [ROUTES.PRODUCT]: 'product',
  [ROUTES.CUSTOMERS]: 'customers',
  [ROUTES.STANDUP]: 'standup',
  [ROUTES.RADAR]: 'radar',
  [ROUTES.BUGS]: 'bugs',
  [ROUTES.TRACE]: 'trace'
};

/**
 * Which view the app should open on.
 *
 * The Product Board is the default. Any route that is not one of the six
 * current views — including bookmarks to views that no longer exist, such as
 * #board, #roadmap or #dashboard — lands there too, rather than on a blank
 * screen.
 *
 * @param {string} route - from parseRoute()
 * @returns {'product'|'customers'|'standup'|'radar'|'bugs'|'trace'}
 */
export function resolveInitialView(route) {
  return BY_ROUTE[route] || 'product';
}

/** View name → route constant, for writing the landing view into the URL. */
export const ROUTE_FOR_VIEW = Object.fromEntries(
  Object.entries(BY_ROUTE).map(([route, view]) => [view, route])
);

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
 * Values arrive as strings (or arrays when a param repeats) — take the first
 * entry so the single-select controls stay coherent.
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
