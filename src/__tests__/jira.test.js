import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('JiraClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws on missing domain', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ domain: '', email: 'a@b.com', apiToken: 'tok' })).toThrow('Domain');
  });

  it('throws on missing email', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ domain: 'd.atlassian.net', email: '', apiToken: 'tok' })).toThrow('email');
  });

  it('throws on missing apiToken', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: '' })).toThrow('API token');
  });

  it('throws on invalid email format', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ domain: 'd.atlassian.net', email: 'notanemail', apiToken: 'tok' })).toThrow('Invalid email');
  });

  it('constructs with valid params', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({ domain: 'test.atlassian.net', email: 'a@b.com', apiToken: 'tok' });
    expect(client.domain).toBe('test.atlassian.net');
    expect(client.email).toBe('a@b.com');
    expect(client.apiToken).toBe('tok');
  });

  it('strips protocol and trailing slash from domain', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({ domain: 'https://test.atlassian.net/', email: 'a@b.com', apiToken: 'tok' });
    expect(client.domain).toBe('test.atlassian.net');
  });

  it('uses empty baseUrl when useProxy is true', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({ domain: 'test.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    expect(client.baseUrl).toBe('');
  });

  it('uses full domain URL when useProxy is false', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({ domain: 'test.atlassian.net', email: 'a@b.com', apiToken: 'tok' });
    expect(client.baseUrl).toBe('https://test.atlassian.net');
  });

  it('getAuthHeader returns correct headers', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'secret' });
    const headers = client.getAuthHeader();
    expect(headers['Authorization']).toBeDefined();
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('request makes a fetch call and returns JSON', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const mockData = { key: 'TEST-1' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    const result = await client.request('/rest/api/3/issue/TEST-1');

    expect(fetch).toHaveBeenCalledWith('/rest/api/3/issue/TEST-1', expect.any(Object));
    expect(result).toEqual(mockData);
  });

  it('request handles 401 error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Authentication failed');
  });

  it('request handles 403 error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Forbidden');
  });

  it('request handles 404 error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/issue/MISSING')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/issue/MISSING')).rejects.toThrow('Resource not found');
  });

  it('request handles 429 rate limit', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '10' },
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrow('Rate limited');
  });

  it('request handles 5xx server error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrow('server error');
  });

  it('testConnection calls /rest/api/3/myself', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const mockUser = { accountId: 'abc', displayName: 'Test User' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUser)
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    const result = await client.testConnection();
    expect(result).toEqual(mockUser);
    expect(fetch).toHaveBeenCalledWith('/rest/api/3/myself', expect.any(Object));
  });

  it('getProjects calls project search endpoint', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [{ id: 1, name: 'Project 1' }] })
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    const projects = await client.getProjects();
    // Paginated now, so this returns the collected values rather than the
    // raw first-page envelope.
    expect(projects).toEqual([{ id: 1, name: 'Project 1' }]);
  });

  it('getBoards returns board values', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [{ id: 1, name: 'Board 1' }] })
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    const boards = await client.getBoards('PROJ');
    expect(boards).toEqual([{ id: 1, name: 'Board 1' }]);
  });

  it('export has JiraError class', async () => {
    const mod = await import('../api/jira.js');
    expect(mod.JiraError).toBeDefined();
    const err = new mod.JiraError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('JiraError');
  });

  it('request uses full URL when useProxy is false', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: 'TEST-1' })
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok' });
    await client.request('/rest/api/3/issue/TEST-1');

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toBe('https://d.atlassian.net/rest/api/3/issue/TEST-1');
  });

  it('handles network error with JiraError', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrow('Network error');
  });

  it('handles generic Error with JiraError for non-fetch errors', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('something terrible happened'));

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrow('Request failed');
  });

  it('handles network TypeError (connection refused) with JiraError', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    const typeError = new TypeError('Failed to fetch');
    global.fetch = vi.fn().mockRejectedValue(typeError);

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself', { attempts: 1 })).rejects.toThrow('Network error');
  });
});

describe('JiraClient.getLastChangeAuthor', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const VALID = { domain: 'test.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true };

  it('fetches the LAST changelog page, not the first', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      const body = url.includes('startAt=41')
        ? { values: [{ author: { displayName: 'Tan Khay Ong' }, created: '2026-09-11T10:00:00Z' }] }
        : { total: 42, values: [{ author: { displayName: 'Someone Old' }, created: '2020-01-01' }] };
      return { ok: true, json: async () => body };
    }));

    const change = await new JiraClient(VALID).getLastChangeAuthor('TSM2-1');

    // Jira pages the changelog oldest-first with no sort, so the newest entry
    // is on the final page.
    expect(calls[1]).toContain('startAt=41');
    expect(change).toEqual({ author: 'Tan Khay Ong', created: '2026-09-11T10:00:00Z' });
  });

  it('makes only one call when there is a single entry', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ total: 1, values: [{ author: { displayName: 'Solo' }, created: '2026-01-01' }] })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const change = await new JiraClient(VALID).getLastChangeAuthor('TSM2-2');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(change.author).toBe('Solo');
  });

  it('returns null for an issue with no changelog', async () => {
    const { JiraClient } = await import('../api/jira.js');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ total: 0, values: [] }) })));
    expect(await new JiraClient(VALID).getLastChangeAuthor('TSM2-3')).toBeNull();
  });

  it('returns null instead of throwing when the request fails', async () => {
    const { JiraClient } = await import('../api/jira.js');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, statusText: 'Not Found', json: async () => ({})
    })));
    expect(await new JiraClient(VALID).getLastChangeAuthor('NOPE-1')).toBeNull();
  });

  it('url-encodes the issue key', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ total: 0, values: [] }) }));
    vi.stubGlobal('fetch', fetchMock);
    await new JiraClient(VALID).getLastChangeAuthor('A B/C');
    expect(fetchMock.mock.calls[0][0]).toContain('A%20B%2FC');
  });
});
