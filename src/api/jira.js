import logger from '../utils/logger.js';

/**
 * Jira API Client
 * Handles authentication and communication with Jira Cloud REST API
 */

class JiraClient {
  /**
   * @param {object} options
   * @param {string} options.domain
   * @param {string} [options.email] - not needed under server auth
   * @param {string} [options.apiToken] - not needed under server auth
   * @param {boolean} [options.useProxy]
   * @param {boolean} [options.serverAuth] - the proxy attaches the credential,
   *   so this client sends none and never sees a token.
   */
  constructor({ domain, email, apiToken, useProxy = false, serverAuth = false }) {
    if (!domain) {
      throw new Error('Domain is required');
    }
    if (serverAuth && !useProxy) {
      // Without the proxy there is nothing to attach the credential, so the
      // request would go out unauthenticated and come back 401.
      throw new Error('Server auth requires the proxy (useProxy: true)');
    }
    if (!serverAuth) {
      if (!email || !apiToken) {
        throw new Error('Domain, email, and API token are required');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email format');
      }
    }

    this.domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.serverAuth = serverAuth;
    // Deliberately not stored under server auth: this object should never be
    // able to leak a credential, even to a debugger.
    this.email = serverAuth ? null : email;
    this.apiToken = serverAuth ? null : apiToken;
    // Through the proxy, relative URLs; otherwise the full Jira Cloud URL.
    this.useProxy = useProxy;
    this.baseUrl = useProxy ? '' : `https://${this.domain}`;
  }

  /**
   * Get authorization header for API requests
   */
  getAuthHeader() {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Under server auth the proxy sets Authorization. Sending one here would
    // be pointless at best, and the proxy overwrites it anyway.
    if (this.serverAuth) return headers;

    const credentials = btoa(`${this.email}:${this.apiToken}`);
    return { ...headers, 'Authorization': `Basic ${credentials}` };
  }

  /**
   * Make an authenticated request to the Jira API
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
        const error = await response.json().catch(() => ({ errorMessages: [response.statusText] }));
        
        // Handle specific status codes
        if (response.status === 401) {
          logger.error('[Jira API] 401 Authentication failed - check your credentials');
          throw new JiraError(401, 'Authentication failed - please check your Jira credentials and reconnect');
        }
        if (response.status === 403) {
          logger.error('[Jira API] 403 Forbidden - insufficient permissions');
          throw new JiraError(403, 'Forbidden - your account does not have permission for this action');
        }
        if (response.status === 404) {
          logger.error('[Jira API] 404 Not found:', endpoint);
          throw new JiraError(404, 'Resource not found');
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '5';
          logger.error(`[Jira API] 429 Rate limited - retry after ${retryAfter} seconds`);
          throw new JiraError(429, `Rate limited. Please wait ${retryAfter} seconds before trying again`);
        }
        if (response.status >= 500) {
          logger.error(`[Jira API] ${response.status} Server error`);
          throw new JiraError(response.status, 'Jira server error. Please try again later');
        }
        
        throw new JiraError(response.status, error.errorMessages?.[0] || error.message || response.statusText);
      }

      clearTimeout(timer);
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof JiraError) throw error;
      if (error.name === 'AbortError') {
        throw new JiraError(0, 'Request timed out — the Jira server did not respond within ' + (timeout / 1000) + 's');
      }
      logger.error('[Jira API] Request failed:', endpoint, error);
      if (error.message.includes('fetch') || error.name === 'TypeError') {
        throw new JiraError(0, 'Network error - check your connection and Jira domain');
      }
      throw new JiraError(0, `Request failed: ${error.message}`);
    }
  }

  /**
   * Test the connection to Jira
   */
  async testConnection() {
    const user = await this.request('/rest/api/3/myself');
    return user;
  }

  /**
   * Get all projects accessible to the current user
   */
  async getProjects() {
    return await this.request('/rest/api/3/project/search?expand=description,lead,issueTypes');
  }

  /**
   * Issues belonging to an epic, via the Agile API.
   *
   * The board sweep only returns issues that sit on a board, so an epic's
   * children are frequently absent from the local cache entirely. This asks
   * Jira for them directly.
   *
   * @param {string} epicKey
   * @param {number} [maxResults=100]
   * @returns {Promise<object[]>} raw issues, or [] if the epic has none
   */
  async getEpicIssues(epicKey, maxResults = 100) {
    const params = new URLSearchParams({
      maxResults: String(maxResults),
      fields: 'summary,status,assignee,issuetype,parent,priority,updated'
    });
    const result = await this.request(
      `/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue?${params}`
    );
    return result.issues || [];
  }

  /**
   * Every field defined on the instance, with its id and display name.
   *
   * Needed because issue payloads key custom fields by id only
   * ("customfield_10014"), so any name-based detection has to resolve ids
   * through this first.
   */
  async getFields() {
    return await this.request('/rest/api/3/field');
  }

  /**
   * Get all boards for a project or all accessible boards
   */
  async getBoards(projectKey = null) {
    const endpoint = projectKey
      ? `/rest/agile/1.0/board?projectKeyOrId=${projectKey}`
      : '/rest/agile/1.0/board';
    const result = await this.request(endpoint);
    return result.values || [];
  }

  /**
   * Get sprints for a board
   */
  async getSprints(boardId, state = null) {
    const endpoint = `/rest/agile/1.0/board/${boardId}/sprint${state ? `?state=${state}` : ''}`;
    const result = await this.request(endpoint);
    return result.values || [];
  }

  /**
   * Get issues from a board
   */
  async getBoardIssues(boardId, jql = null, startAt = 0, maxResults = 100, options = {}) {
    const params = new URLSearchParams({ startAt, maxResults });
    if (jql) params.append('jql', jql);

    // Ask for issuelinks explicitly. The agile board endpoint's default field
    // set is not guaranteed to include them, and sync builds the `issuelinks`
    // store purely from `fields.issuelinks` — without this the Product Board
    // shows "Linked Issues: None" even when Jira has the link.
    // `*navigable` keeps every standard + custom field the sync transform and
    // the FIELD_PATTERNS custom-field detection rely on.
    params.append('fields', '*navigable,issuelinks');

    const endpoint = `/rest/agile/1.0/board/${boardId}/issue?${params}`;
    return await this.request(endpoint, options);
  }

  /**
   * Search issues using JQL
   */
  async searchIssues(jql, fields = null, startAt = 0, maxResults = 100) {
    const body = {
      jql,
      startAt,
      maxResults,
      fields: fields || ['summary', 'status', 'priority', 'assignee', 'issuetype', 'created', 'updated']
    };

    return await this.request('/rest/api/3/search', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Who last changed an issue, and when.
   *
   * Jira has no "last updated by" field — only `updated`, which carries no
   * author — so this reads the issue changelog. The changelog endpoint pages
   * oldest-first with no sort option, so getting the NEWEST entry takes two
   * calls: one to learn the total, one to fetch the final page.
   *
   * Returns null rather than throwing: this is decoration, and a standup must
   * still render if the call fails.
   *
   * @param {string} key
   * @returns {Promise<{author: string, created: string}|null>}
   */
  async getLastChangeAuthor(key) {
    try {
      const first = await this.request(
        `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?maxResults=1`
      );
      const total = first?.total ?? 0;
      if (!total) return null;

      const last = total <= 1
        ? first
        : await this.request(
          `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${total - 1}&maxResults=1`
        );

      const entry = last?.values?.[0] || last?.histories?.[0];
      if (!entry?.author) return null;

      return {
        author: entry.author.displayName || entry.author.name || null,
        created: entry.created || null
      };
    } catch (error) {
      logger.debug(`[Jira API] No changelog for ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Get a single issue by key
   */
  async getIssue(key, fields = null) {
    const params = new URLSearchParams();
    if (fields) params.append('fields', fields.join(','));

    const endpoint = `/rest/api/3/issue/${key}${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint);
  }

  // All write operations (createIssue, updateIssue, transitionIssue, deleteIssue)
  // have been removed. This app is read-only. Only GET requests to Jira are used.
}

/**
 * Custom error class for Jira API errors
 */
class JiraError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
  }
}

export { JiraClient, JiraError };
