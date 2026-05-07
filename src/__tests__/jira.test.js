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
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Rate limited');
  });

  it('request handles 5xx server error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({})
    });

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('server error');
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
    expect(projects).toEqual({ values: [{ id: 1, name: 'Project 1' }] });
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
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Network error');
  });

  it('handles generic Error with JiraError for non-fetch errors', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('something terrible happened'));

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Request failed');
  });

  it('handles network TypeError (connection refused) with JiraError', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    const typeError = new TypeError('Failed to fetch');
    global.fetch = vi.fn().mockRejectedValue(typeError);

    const client = new JiraClient({ domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true });
    await expect(client.request('/rest/api/3/myself')).rejects.toThrowError(JiraError);
    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('Network error');
  });
});
