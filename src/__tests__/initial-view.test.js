import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveInitialView,
  ROUTE_FOR_VIEW,
  productFiltersFromParams,
  customerFiltersFromParams
} from '../utils/initial-view.js';
import { ROUTES } from '../utils/router.js';

describe('resolveInitialView', () => {
  it('lands on the Product Board with no route', () => {
    expect(resolveInitialView('')).toBe('product');
  });

  it('resolves each of the six views from its route', () => {
    expect(resolveInitialView(ROUTES.PRODUCT)).toBe('product');
    expect(resolveInitialView(ROUTES.CUSTOMERS)).toBe('customers');
    expect(resolveInitialView(ROUTES.STANDUP)).toBe('standup');
    expect(resolveInitialView(ROUTES.RADAR)).toBe('radar');
    expect(resolveInitialView(ROUTES.BUGS)).toBe('bugs');
    expect(resolveInitialView(ROUTES.TRACE)).toBe('trace');
  });

  it('sends bookmarks to removed views to the Product Board, not a blank screen', () => {
    for (const legacy of ['board', 'all-issues', 'roadmap', 'dashboard', 'velocity', 'workload', 'aging', 'releases', 'cfd', 'deps']) {
      expect(resolveInitialView(legacy)).toBe('product');
    }
  });

  it('ignores params entirely — a customer filter no longer diverts the landing view', () => {
    // Under the old All Issues heuristic, `customer` on a bare route opened
    // All Issues. That view is gone; params never change the destination now.
    expect(resolveInitialView('', { customer: 'NTUC' })).toBe('product');
    expect(resolveInitialView(ROUTES.CUSTOMERS, { customer: 'NTUC' })).toBe('customers');
  });

  it('maps every view it can return to a real route, and back', () => {
    for (const view of ['product', 'customers', 'standup', 'radar', 'bugs', 'trace']) {
      const route = ROUTE_FOR_VIEW[view];
      expect(route).toBeTruthy();
      expect(resolveInitialView(route)).toBe(view);
    }
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

describe('customerFiltersFromParams', () => {
  it('reads its own filter vocabulary from the URL', () => {
    expect(customerFiltersFromParams({ customer: 'NTUC', search: 'bulk' }))
      .toEqual({ customer: 'NTUC', search: 'bulk' });
    expect(customerFiltersFromParams({})).toEqual({ customer: '', search: '' });
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
