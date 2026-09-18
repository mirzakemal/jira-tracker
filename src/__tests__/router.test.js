import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ROUTES, parseRoute, navigate, getCurrentRoute, getQueryParams, removeQueryParam, updateQueryParams } from '../utils/router.js';

describe('ROUTES', () => {
  it('defines expected routes', () => {
    expect(ROUTES).toEqual({
      PRODUCT: 'product',
      CUSTOMERS: 'customers',
      STANDUP: 'standup',
      RADAR: 'radar',
      BUGS: 'bugs',
      TRACE: 'trace',
      SETTINGS: 'settings'
    });
  });
});

describe('parseRoute', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('returns the Product Board route when hash is empty', () => {
    const result = parseRoute();
    expect(result.route).toBe('product');
    expect(result.params).toEqual({});
  });

  it('parses simple route', () => {
    window.location.hash = '#roadmap';
    const result = parseRoute();
    expect(result.route).toBe('roadmap');
    expect(result.params).toEqual({});
  });

  it('parses route with query parameters', () => {
    window.location.hash = '#board?status=Done&projectKey=TEST';
    const result = parseRoute();
    expect(result.route).toBe('board');
    expect(result.params).toEqual({ status: 'Done', projectKey: 'TEST' });
  });

  it('parses route with array parameters', () => {
    window.location.hash = '#board?status=Done&status=In+Progress';
    const result = parseRoute();
    expect(result.params.status).toEqual(['Done', 'In Progress']);
  });
});

describe('navigate', () => {
  it('sets hash to route', () => {
    navigate('roadmap');
    expect(window.location.hash).toBe('#roadmap');
  });

  it('sets hash with query parameters', () => {
    navigate('board', { status: 'Done', projectKey: 'TEST' });
    expect(window.location.hash).toBe('#board?status=Done&projectKey=TEST');
  });

  it('handles array parameters', () => {
    navigate('board', { status: ['Done', 'In Progress'] });
    expect(window.location.hash).toBe('#board?status=Done&status=In+Progress');
  });

  it('filters out null, undefined, and empty values', () => {
    navigate('board', { status: 'Done', projectKey: null, searchQuery: '', assigneeId: undefined });
    expect(window.location.hash).toBe('#board?status=Done');
  });
});

describe('getCurrentRoute', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('returns current route', () => {
    window.location.hash = '#settings';
    expect(getCurrentRoute()).toBe('settings');
  });
});

describe('getQueryParams', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('returns current query parameters', () => {
    window.location.hash = '#board?status=Done&projectKey=TEST';
    const params = getQueryParams();
    expect(params).toEqual({ status: 'Done', projectKey: 'TEST' });
  });
});

describe('removeQueryParam', () => {
  beforeEach(() => {
    window.location.hash = '#board?status=Done&projectKey=TEST';
  });

  it('removes specified parameter', () => {
    removeQueryParam('projectKey');
    expect(window.location.hash).toBe('#board?status=Done');
  });
});

describe('updateQueryParams', () => {
  beforeEach(() => {
    window.location.hash = '#board?status=Done&projectKey=TEST';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges params by default', () => {
    updateQueryParams({ searchQuery: 'bug' });
    expect(window.location.hash).toContain('searchQuery=bug');
    expect(window.location.hash).toContain('status=Done');
  });

  it('replaces params when merge is false', () => {
    updateQueryParams({ searchQuery: 'bug' }, false);
    expect(window.location.hash).toBe('#board?searchQuery=bug');
  });
});
