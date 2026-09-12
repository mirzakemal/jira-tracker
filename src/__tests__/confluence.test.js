import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ConfluenceClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const VALID = { domain: 'test.atlassian.net', email: 'a@b.com', apiToken: 'tok' };

  it('throws on missing domain', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    expect(() => new ConfluenceClient({ ...VALID, domain: '' })).toThrow('Domain');
  });

  it('throws on missing apiToken', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    expect(() => new ConfluenceClient({ ...VALID, apiToken: '' })).toThrow('API token');
  });

  it('throws on invalid email format', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    expect(() => new ConfluenceClient({ ...VALID, email: 'notanemail' })).toThrow('Invalid email');
  });

  it('strips protocol and trailing slash from domain', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    const client = new ConfluenceClient({ ...VALID, domain: 'https://test.atlassian.net/' });
    expect(client.domain).toBe('test.atlassian.net');
  });

  it('uses empty baseUrl when useProxy is true', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    expect(new ConfluenceClient({ ...VALID, useProxy: true }).baseUrl).toBe('');
  });

  it('uses full domain URL when useProxy is false', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    expect(new ConfluenceClient(VALID).baseUrl).toBe('https://test.atlassian.net');
  });

  it('getAuthHeader encodes email:token as base64 Basic auth', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    const client = new ConfluenceClient({ ...VALID, apiToken: 'secret' });
    const headers = client.getAuthHeader();
    expect(headers['Authorization']).toBe(`Basic ${btoa('a@b.com:secret')}`);
    expect(headers['Accept']).toBe('application/json');
  });

  it('getPage requests the v2 pages endpoint with storage body format', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ConfluenceClient({ ...VALID, useProxy: true });
    await client.getPage('123');

    expect(fetchMock).toHaveBeenCalledWith(
      '/wiki/api/v2/pages/123?body-format=storage',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('maps a 401 response to an authentication ConfluenceError', async () => {
    const { ConfluenceClient, ConfluenceError } = await import('../api/confluence.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'nope' })
    }));

    const client = new ConfluenceClient({ ...VALID, useProxy: true });
    await expect(client.testConnection()).rejects.toBeInstanceOf(ConfluenceError);
    await expect(client.testConnection()).rejects.toThrow('Authentication failed');
  });

  it('maps a 404 response to a not-found ConfluenceError', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({})
    }));

    const client = new ConfluenceClient({ ...VALID, useProxy: true });
    await expect(client.getPage('missing')).rejects.toThrow('Resource not found');
  });

  it('surfaces the Retry-After hint on 429', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: { get: () => '30' },
      json: async () => ({})
    }));

    const client = new ConfluenceClient({ ...VALID, useProxy: true });
    await expect(client.getSpaces()).rejects.toThrow('30 seconds');
  });

  it('publishDraft is not implemented — drafts stay local', async () => {
    const { ConfluenceClient } = await import('../api/confluence.js');
    const client = new ConfluenceClient(VALID);
    await expect(client.publishDraft()).rejects.toThrow('not implemented');
  });
});
