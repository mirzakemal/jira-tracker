/**
 * Jira API Client
 * Handles authentication and communication with Jira Cloud REST API
 */

class JiraClient {
  constructor({ domain, email, apiToken }) {
    if (!domain || !email || !apiToken) {
      throw new Error('Domain, email, and API token are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format');
    }
    if (!domain.startsWith('https://')) {
      console.warn('⚠️ Warning: Using non-HTTPS connection - credentials may be exposed');
    }
    this.domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.email = email;
    this.apiToken = apiToken;
    this.baseUrl = `https://${this.domain}`;
  }

  /**
   * Get authorization header for API requests
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
   * Make an authenticated request to the Jira API
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...this.getAuthHeader(), ...options.headers };

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ errorMessages: [response.statusText] }));
        
        // Handle specific status codes
        if (response.status === 401) {
          console.error('[Jira API] 401 Authentication failed - check your credentials');
          throw new JiraError(401, 'Authentication failed - please check your Jira credentials and reconnect');
        }
        if (response.status === 403) {
          console.error('[Jira API] 403 Forbidden - insufficient permissions');
          throw new JiraError(403, 'Forbidden - your account does not have permission for this action');
        }
        if (response.status === 404) {
          console.error('[Jira API] 404 Not found:', endpoint);
          throw new JiraError(404, 'Resource not found');
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '5';
          console.error(`[Jira API] 429 Rate limited - retry after ${retryAfter} seconds`);
          throw new JiraError(429, `Rate limited. Please wait ${retryAfter} seconds before trying again`);
        }
        if (response.status >= 500) {
          console.error(`[Jira API] ${response.status} Server error`);
          throw new JiraError(response.status, 'Jira server error. Please try again later');
        }
        
        throw new JiraError(response.status, error.errorMessages?.[0] || error.message || response.statusText);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof JiraError) throw error;
      if (error.name === 'AbortError') {
        throw error; // Propagate abort errors for cancellation
      }
      console.error('[Jira API] Request failed:', endpoint, error);
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
   * Get a single issue by key
   */
  async getIssue(key, fields = null) {
    const params = new URLSearchParams();
    if (fields) params.append('fields', fields.join(','));

    const endpoint = `/rest/api/3/issue/${key}${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint);
  }

  /**
   * Create a new issue
   */
  async createIssue(projectKey, summary, issueType, options = {}) {
    const body = {
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
        ...options
      }
    };

    return await this.request('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Update an issue
   */
  async updateIssue(key, updates) {
    return await this.request(`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: updates })
    });
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(key) {
    const result = await this.request(`/rest/api/3/issue/${key}/transitions`);
    return result.transitions || [];
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(key, transitionId) {
    return await this.request(`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } })
    });
  }

  /**
   * Delete an issue
   */
  async deleteIssue(key) {
    return await this.request(`/rest/api/3/issue/${key}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get issue types for a project
   */
  async getIssueTypes(projectKey) {
    const project = await this.request(`/rest/api/3/project/${projectKey}`);
    return project.issueTypes || [];
  }

  /**
   * Get assignee candidates for a project
   */
  async getAssignableUsers(projectKey) {
    return await this.request(`/rest/api/3/user/assignable/search?project=${projectKey}`);
  }
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
