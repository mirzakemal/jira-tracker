import { describe, it, expect } from 'vitest';
import {
  resolveInitialView,
  ROUTE_FOR_VIEW,
  productFiltersFromParams
} from '../utils/initial-view.js';
import { ROUTES } from '../utils/router.js';

describe('resolveInitialView', () => {
  it('lands on the Product Board with no route', () => {
    expect(resolveInitialView('', {})).toBe('product');
  });

  it('lands on the Product Board for the product route', () => {
    expect(resolveInitialView(ROUTES.PRODUCT, {})).toBe('product');
  });

  it('respects an explicit board route', () => {
    expect(resolveInitialView(ROUTES.BOARD, {})).toBe('board');
  });

  it('respects explicit roadmap and all-issues routes', () => {
    expect(resolveInitialView(ROUTES.ROADMAP, {})).toBe('roadmap');
    expect(resolveInitialView(ROUTES.ALL_ISSUES, {})).toBe('all-issues');
  });

  it('opens All Issues when issue-filter params are present', () => {
    expect(resolveInitialView('', { customer: 'NTUC' })).toBe('all-issues');
    expect(resolveInitialView('', { tag: 'x' })).toBe('all-issues');
  });

  it('does NOT treat Product Board params as issue filters', () => {
    // `priority` and `reporter` belong to the Product Board; they must not
    // divert the landing view to All Issues.
    expect(resolveInitialView(ROUTES.PRODUCT, { priority: 'High' })).toBe('product');
    expect(resolveInitialView(ROUTES.PRODUCT, { reporter: 'Darell' })).toBe('product');
  });

  it('honours the legacy roadmap/allIssues boolean params', () => {
    expect(resolveInitialView('', { roadmap: 'true' })).toBe('roadmap');
    expect(resolveInitialView('', { allIssues: 'true' })).toBe('all-issues');
  });

  it('maps every view it can return to a real route', () => {
    for (const view of ['product', 'board', 'all-issues', 'roadmap']) {
      expect(ROUTE_FOR_VIEW[view]).toBeTruthy();
    }
    expect(ROUTE_FOR_VIEW.product).toBe('product');
  });
});

describe('productFiltersFromParams', () => {
  it('returns empty strings when nothing is set', () => {
    expect(productFiltersFromParams({}))
      .toEqual({ customer: '', priority: '', reporter: '', search: '' });
  });

  it('reads the Product Board filter vocabulary', () => {
    expect(productFiltersFromParams({
      customer: 'NTUC', priority: 'High', reporter: 'Jamie Tan', search: 'bulk'
    })).toEqual({ customer: 'NTUC', priority: 'High', reporter: 'Jamie Tan', search: 'bulk' });
  });

  it('takes the first value when a param repeats', () => {
    expect(productFiltersFromParams({ customer: ['NTUC', 'SMRT'] }).customer).toBe('NTUC');
  });

  it('tolerates being called with no argument', () => {
    expect(() => productFiltersFromParams()).not.toThrow();
  });
});

describe('Customer Dashboard routing', () => {
  it('resolves the customers route', async () => {
    expect(resolveInitialView(ROUTES.CUSTOMERS, {})).toBe('customers');
  });

  it('maps the customers view to a real route', () => {
    expect(ROUTE_FOR_VIEW.customers).toBe('customers');
  });

  it('reads its own filter vocabulary from the URL', async () => {
    const { customerFiltersFromParams } = await import('../utils/initial-view.js');
    expect(customerFiltersFromParams({ customer: 'NTUC', search: 'bulk' }))
      .toEqual({ customer: 'NTUC', search: 'bulk' });
    expect(customerFiltersFromParams({})).toEqual({ customer: '', search: '' });
  });

  it('a customer param still sends a bare route to All Issues', () => {
    // `customer` is also an issue filter, so it must keep its existing meaning
    // when no explicit route is given.
    expect(resolveInitialView('', { customer: 'NTUC' })).toBe('all-issues');
    // ...but not when the customers route is explicit.
    expect(resolveInitialView(ROUTES.CUSTOMERS, { customer: 'NTUC' })).toBe('customers');
  });
});

describe('Explicit routes beat the filter-param heuristic', () => {
  it('keeps the Product Board when it carries a customer filter', () => {
    // `customer` is both an issue filter and a Product Board filter. Sharing a
    // Product Board link with a filter applied must not open All Issues.
    expect(resolveInitialView(ROUTES.PRODUCT, { customer: 'NTUC' })).toBe('product');
    expect(resolveInitialView(ROUTES.PRODUCT, { status: 'Plan' })).toBe('product');
  });

  it('keeps the board and roadmap routes when filters are present', () => {
    expect(resolveInitialView(ROUTES.BOARD, { customer: 'NTUC' })).toBe('board');
    expect(resolveInitialView(ROUTES.ROADMAP, { tag: 'x' })).toBe('roadmap');
  });

  it('still honours the legacy param links when no route is given', () => {
    expect(resolveInitialView('', { customer: 'NTUC' })).toBe('all-issues');
    expect(resolveInitialView('', { roadmap: 'true' })).toBe('roadmap');
    expect(resolveInitialView('', { allIssues: 'true' })).toBe('all-issues');
  });
});

describe('shouldUseProxy', () => {
  beforeEach(() => { vi.unstubAllEnvs?.(); });

  it('honours an explicit VITE_USE_PROXY=true', async () => {
    vi.stubEnv('VITE_USE_PROXY', 'true');
    vi.resetModules();
    const { shouldUseProxy } = await import('../utils/proxy.js');
    expect(shouldUseProxy()).toBe(true);
  });

  it('honours an explicit VITE_USE_PROXY=false', async () => {
    vi.stubEnv('VITE_USE_PROXY', 'false');
    vi.resetModules();
    const { shouldUseProxy } = await import('../utils/proxy.js');
    expect(shouldUseProxy()).toBe(false);
  });

  it('defaults to proxying on localhost, where the dev server proxies', async () => {
    vi.stubEnv('VITE_USE_PROXY', '');
    vi.resetModules();
    const { shouldUseProxy } = await import('../utils/proxy.js');
    // jsdom serves the tests from localhost.
    expect(shouldUseProxy()).toBe(window.location.hostname === 'localhost');
  });
});
