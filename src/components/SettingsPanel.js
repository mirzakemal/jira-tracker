/**
 * Settings Panel Component
 * Handles Jira connection configuration
 */

import { JiraClient, JiraError } from '../api/jira.js';
import { loadCredentials, saveCredentials, clearCredentials } from '../utils/storage.js';

export class SettingsPanel {
  constructor(onConnect) {
    this.onConnect = onConnect;
    this.client = null;
    this.isConnected = false;
    this.user = null;
  }

  render() {
    const saved = loadCredentials() || {};

    return `
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Jira Connection</h2>
          <span class="connection-status ${this.isConnected ? 'connected' : 'disconnected'}">
            ${this.isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>

        <form class="settings-form" id="settings-form">
          <div class="form-group">
            <label for="jira-domain">Jira Domain</label>
            <input
              type="text"
              id="jira-domain"
              placeholder="your-domain.atlassian.net"
              value="${saved.domain || ''}"
              required
            />
            <small>Example: mycompany.atlassian.net</small>
          </div>

          <div class="form-group">
            <label for="jira-email">Email</label>
            <input
              type="email"
              id="jira-email"
              placeholder="you@example.com"
              value="${saved.email || ''}"
              required
            />
          </div>

          <div class="form-group">
            <label for="jira-token">API Token</label>
            <input
              type="password"
              id="jira-token"
              placeholder="Enter your API token"
              value="${saved.token ? '••••••••••••' : ''}"
              autocomplete="off"
              required
            />
            <small>
              <a href="https://id.atlassian.com/manage/api-tokens" target="_blank" rel="noopener">
                Create API token
              </a>
            </small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-connect">
              ${this.isConnected ? 'Update Connection' : 'Connect'}
            </button>
            ${this.isConnected ? `
              <button type="button" class="btn btn-secondary" id="btn-disconnect">
                Disconnect
              </button>
            ` : ''}
          </div>

          ${this.user ? `
            <div class="user-info">
              <img src="${this.user.avatarUrls['48x48']}" alt="Avatar" class="user-avatar" />
              <div class="user-details">
                <span class="user-name">${this.user.displayName}</span>
                <span class="user-email">${this.user.emailAddress}</span>
              </div>
            </div>
          ` : ''}

          <div class="error-message" id="error-message" style="display: none;"></div>
        </form>
      </div>
    `;
  }

  bindEvents() {
    const form = document.getElementById('settings-form');
    const connectBtn = document.getElementById('btn-connect');
    const disconnectBtn = document.getElementById('btn-disconnect');

    form?.addEventListener('submit', (e) => this.handleSubmit(e, connectBtn));
    disconnectBtn?.addEventListener('click', () => this.handleDisconnect());
  }

  async handleSubmit(e, btn) {
    e.preventDefault();

    const domain = document.getElementById('jira-domain').value.trim();
    const email = document.getElementById('jira-email').value.trim();
    const tokenInput = document.getElementById('jira-token');
    const token = tokenInput.value.includes('•')
      ? loadCredentials().token
      : tokenInput.value.trim();

    if (!domain || !email || !token) {
      this.showError('Please fill in all fields');
      return;
    }

    this.setLoading(btn, true);
    this.hideError();

    try {
      this.client = new JiraClient({ domain, email, apiToken: token });
      this.user = await this.client.testConnection();
      this.isConnected = true;

      saveCredentials({ domain, email, token });

      this.onConnect({ client: this.client, user: this.user });
    } catch (error) {
      this.showError(error.message || 'Failed to connect to Jira');
      this.isConnected = false;
      this.client = null;
      this.user = null;
    } finally {
      this.setLoading(btn, false);
    }
  }

  handleDisconnect() {
    this.isConnected = false;
    this.client = null;
    this.user = null;
    clearCredentials();
    this.onConnect(null);
  }

  showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  hideError() {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }

  setLoading(btn, loading) {
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Connecting...' : 'Connect';
    }
  }
}
