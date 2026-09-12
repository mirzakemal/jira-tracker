import logger from '../utils/logger.js';

/**
 * Confluence API Client
 *
 * Mirrors the structure of `api/jira.js` (same auth scheme, same timeout and
 * error-mapping behaviour) so both clients behave identically to callers.
 *
 * READ-ONLY, matching the app's posture toward Atlassian. Documentation drafts
 * live locally in the `doc_drafts` store; publishing a draft back to Confluence
 * is a write to an external system and is deliberately NOT implemented here —
 * see `publishDraft` at the bottom of this file.
 *
 * SECURITY: `apiToken` must be supplied by the caller at runtime (from the
 * encrypted credential store), never read from import.meta.env — Vite inlines
 * env vars into the public bundle.
 */
class ConfluenceClient {
  constructor({ domain, email, apiToken, useProxy = false }) {
    if (!domain || !email || !apiToken) {
      throw new Error('Domain, email, and API token are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format');
    }
    this.domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.email = email;
    this.apiToken = apiToken;
    this.useProxy = useProxy;
    this.baseUrl = useProxy ? '' : `https://${this.domain}`;
  }

  /**
   * Basic auth header. btoa is base64 encoding, not encryption.
   */
  getAuthHeader() {
    const credentials = btoa(`${this.email}:${this.apiToken}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Authenticated request against the Confluence REST API.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...this.getAuthHeader(), ...options.headers };
    const timeout = options.timeout ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));

        if (response.status === 401) {
          logger.error('[Confluence API] 401 Authentication failed - check your credentials');
          throw new ConfluenceError(401, 'Authentication failed - please check your Confluence credentials and reconnect');
        }
        if (response.status === 403) {
          logger.error('[Confluence API] 403 Forbidden - insufficient permissions');
          throw new ConfluenceError(403, 'Forbidden - your account does not have permission for this space');
        }
        if (response.status === 404) {
          logger.error('[Confluence API] 404 Not found:', endpoint);
          throw new ConfluenceError(404, 'Resource not found');
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '5';
          logger.error(`[Confluence API] 429 Rate limited - retry after ${retryAfter} seconds`);
          throw new ConfluenceError(429, `Rate limited. Please wait ${retryAfter} seconds before trying again`);
        }
        if (response.status >= 500) {
          logger.error(`[Confluence API] ${response.status} Server error`);
          throw new ConfluenceError(response.status, 'Confluence server error. Please try again later');
        }

        throw new ConfluenceError(response.status, error.message || response.statusText);
      }

      clearTimeout(timer);
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof ConfluenceError) throw error;
      if (error.name === 'AbortError') {
        throw new ConfluenceError(0, 'Request timed out — Confluence did not respond within ' + (timeout / 1000) + 's');
      }
      logger.error('[Confluence API] Request failed:', endpoint, error);
      if (error.message.includes('fetch') || error.name === 'TypeError') {
        throw new ConfluenceError(0, 'Network error - check your connection and Confluence domain');
      }
      throw new ConfluenceError(0, `Request failed: ${error.message}`);
    }
  }

  /**
   * Verify credentials and reachability.
   */
  async testConnection() {
    return await this.request('/wiki/rest/api/user/current');
  }

  /**
   * List spaces visible to the current user.
   */
  async getSpaces(limit = 50) {
    return await this.request(`/wiki/api/v2/spaces?limit=${limit}`);
  }

  /**
   * Fetch a page, optionally including its stored body.
   * @param {string} pageId
   * @param {boolean} [withBody=true]
   */
  async getPage(pageId, withBody = true) {
    const params = withBody ? '?body-format=storage' : '';
    return await this.request(`/wiki/api/v2/pages/${pageId}${params}`);
  }

  /**
   * Pages in a space.
   */
  async getPagesInSpace(spaceId, limit = 50) {
    return await this.request(`/wiki/api/v2/spaces/${spaceId}/pages?limit=${limit}`);
  }

  /**
   * CQL search — used to find an existing doc page for a product issue key.
   * @param {string} cql e.g. 'text ~ "PROD-12"'
   */
  async search(cql, limit = 25) {
    const params = new URLSearchParams({ cql, limit: String(limit) });
    return await this.request(`/wiki/rest/api/search?${params}`);
  }

  /**
   * NOT IMPLEMENTED — publishing a draft creates/updates a real Confluence page.
   *
   * Left unimplemented on purpose: it is an outward-facing write, it needs a
   * Markdown → storage-format conversion step, and it should be behind an
   * explicit user confirmation rather than an implicit sync. Wire it up only
   * when that flow is designed.
   */
  async publishDraft() {
    throw new ConfluenceError(
      501,
      'publishDraft is not implemented — documentation drafts are local-only. ' +
      'Publishing to Confluence requires an explicit write flow.'
    );
  }
}

/**
 * Custom error class for Confluence API errors
 */
class ConfluenceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ConfluenceError';
    this.status = status;
  }
}

export { ConfluenceClient, ConfluenceError };
