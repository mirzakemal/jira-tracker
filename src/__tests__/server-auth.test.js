/**
 * Server-auth mode — the browser must never hold or send a credential.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import 'fake-indexeddb/auto';

const VALID = { domain: 'tenderboard.atlassian.net', useProxy: true, serverAuth: true };

describe('JiraClient under server auth', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('constructs without an email or token', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient(VALID)).not.toThrow();
  });

  it('sends no Authorization header — the proxy attaches it', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await new JiraClient(VALID).testConnection();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Accept).toBe('application/json');
  });

  it('never retains a token on the instance', async () => {
    const { JiraClient } = await import('../api/jira.js');
    // Even if one is passed by mistake, it must not be kept where a debugger,
    // an error report or a serialiser could pick it up.
    const client = new JiraClient({ ...VALID, email: 'a@b.com', apiToken: 'secret' });
    expect(client.apiToken).toBeNull();
    expect(client.email).toBeNull();
    expect(JSON.stringify(client)).not.toContain('secret');
  });

  it('refuses to run without the proxy', async () => {
    const { JiraClient } = await import('../api/jira.js');
    // No proxy means nothing attaches the credential, so the call would 401.
    expect(() => new JiraClient({ ...VALID, useProxy: false }))
      .toThrow('Server auth requires the proxy');
  });

  it('still requires a domain', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ ...VALID, domain: '' })).toThrow('Domain is required');
  });

  it('uses relative URLs so the proxy sees the request', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(new JiraClient(VALID).baseUrl).toBe('');
  });
});

describe('JiraClient in browser-auth mode is unchanged', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('still demands email and token', async () => {
    const { JiraClient } = await import('../api/jira.js');
    expect(() => new JiraClient({ domain: 'x.atlassian.net' }))
      .toThrow('Domain, email, and API token are required');
  });

  it('still sends Basic auth', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const client = new JiraClient({
      domain: 'x.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true
    });
    expect(client.getAuthHeader().Authorization).toBe(`Basic ${btoa('a@b.com:tok')}`);
  });
});

describe('auth-mode configuration', () => {
  beforeEach(() => { vi.resetModules(); });

  it('defaults to browser auth', async () => {
    vi.stubEnv('VITE_AUTH_MODE', '');
    const { usesServerAuth } = await import('../utils/auth-mode.js');
    expect(usesServerAuth()).toBe(false);
  });

  it('reports a problem when proxy mode is set without the proxy', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'proxy');
    vi.stubEnv('VITE_USE_PROXY', 'false');
    vi.stubEnv('VITE_JIRA_DOMAIN', 'x.atlassian.net');
    const { serverAuthProblem } = await import('../utils/auth-mode.js');
    expect(serverAuthProblem()).toContain('VITE_USE_PROXY=true');
  });

  it('reports a problem when the domain is missing', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'proxy');
    vi.stubEnv('VITE_USE_PROXY', 'true');
    vi.stubEnv('VITE_JIRA_DOMAIN', '');
    const { serverAuthProblem } = await import('../utils/auth-mode.js');
    expect(serverAuthProblem()).toContain('VITE_JIRA_DOMAIN');
  });

  it('is happy when both are set', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'proxy');
    vi.stubEnv('VITE_USE_PROXY', 'true');
    vi.stubEnv('VITE_JIRA_DOMAIN', 'https://tenderboard.atlassian.net/');
    const { serverAuthProblem, configuredDomain } = await import('../utils/auth-mode.js');
    expect(serverAuthProblem()).toBeNull();
    expect(configuredDomain()).toBe('tenderboard.atlassian.net');
  });
});

describe('Credential storage refuses to write under server auth', () => {
  beforeEach(() => { vi.resetModules(); });

  it('stores nothing and says so', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'proxy');
    const { saveCredentials } = await import('../utils/storage.js');

    const ok = await saveCredentials({
      domain: 'x.atlassian.net', email: 'a@b.com', token: 'secret'
    });

    expect(ok).toBe(false);
    // The whole point of the mode: no token anywhere in the browser.
    expect(JSON.stringify(localStorage)).not.toContain('secret');
  });

  it('still stores in browser mode', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'browser');
    const { saveCredentials, loadCredentials } = await import('../utils/storage.js');

    await saveCredentials({ domain: 'x.atlassian.net', email: 'a@b.com', token: 'tok' });
    const back = await loadCredentials();
    expect(back?.token).toBe('tok');
  });
});

describe('nginx credential handling', () => {
  const cfg = readFileSync(resolve(process.cwd(), 'deploy/nginx.conf'), 'utf8');

  it('injects the Authorization header from a file outside the repo', () => {
    expect(cfg).toContain('include /etc/nginx/atlassian-auth.inc');
    // The credential itself must never be committed.
    expect(cfg).not.toMatch(/Authorization "Basic [A-Za-z0-9+/=]{8,}/);
  });

  it('gates the proxied routes behind an authorization check', () => {
    // Without this, anyone who can reach the proxy reads Jira.
    expect(cfg).toContain('auth_request /_authz');
  });

  it('fails closed: the stub authz endpoint denies', () => {
    expect(cfg).toMatch(/location = \/_authz \{[\s\S]*?return 403;/);
  });

  it('does not forward browser cookies upstream', () => {
    expect(cfg).toContain('proxy_set_header Cookie ""');
  });
});
