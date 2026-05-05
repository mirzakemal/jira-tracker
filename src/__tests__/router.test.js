import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ROUTES, parseRoute, navigate, filtersToParams, paramsToFilters, getCurrentRoute, getQueryParams, removeQueryParam, updateQueryParams } from '../utils/router.js';

describe('ROUTES', () => {
  it('defines expected routes', () => {
    expect(ROUTES).toEqual({
      BOARD: 'board',
      ALL_ISSUES: 'all-issues',
      ROADMAP: 'roadmap',
      SETTINGS: 'settings'
    });
  });
});

describe('parseRoute', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('returns default board route when hash is empty', () => {
    const result = parseRoute();
    expect(result.route).toBe('board');
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
    expect(result.params.status).toBe('In Progress');
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

describe('filtersToParams', () => {
  it('converts simple filters to params', () => {
    const filters = {
      projectKey: 'TEST',
      searchQuery: 'bug',
      status: ['Done']
    };

    const params = filtersToParams(filters);
    expect(params.projectKey).toBe('TEST');
    expect(params.searchQuery).toBe('bug');
    expect(params.status).toEqual(['Done']);
  });

  it('handles array filters', () => {
    const filters = {
      status: ['Done', 'In Progress'],
      assigneeId: ['user1', 'user2']
    };

    const params = filtersToParams(filters);
    expect(params.status).toEqual(['Done', 'In Progress']);
    expect(params.assigneeId).toEqual(['user1', 'user2']);
  });

  it('handles single-value legacy array filters', () => {
    const filters = {
      status: 'Done'
    };

    const params = filtersToParams(filters);
    expect(params.status).toBe('Done');
  });

  it('ignores empty arrays', () => {
    const filters = {
      status: [],
      projectKey: 'TEST'
    };

    const params = filtersToParams(filters);
    expect(params.status).toBeUndefined();
    expect(params.projectKey).toBe('TEST');
  });
});

describe('paramsToFilters', () => {
  it('converts simple params to filters', () => {
    const params = {
      projectKey: 'TEST',
      searchQuery: 'bug'
    };

    const filters = paramsToFilters(params);
    expect(filters.projectKey).toBe('TEST');
    expect(filters.searchQuery).toBe('bug');
  });

  it('converts single value to array for array filters', () => {
    const params = {
      status: 'Done'
    };

    const filters = paramsToFilters(params);
    expect(filters.status).toEqual(['Done']);
  });

  it('keeps arrays as arrays for array filters', () => {
    const params = {
      status: ['Done', 'In Progress']
    };

    const filters = paramsToFilters(params);
    expect(filters.status).toEqual(['Done', 'In Progress']);
  });
});
