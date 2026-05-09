/**
 * Sync Status Component
 * Displays sync indicator and provides sync controls
 */

import { timeAgo } from '../utils/date.js';
import logger from '../utils/logger.js';
import { showError } from '../utils/dom.js';

export class SyncStatus {
  constructor(onSyncRequest, jiraDomain) {
    this.onSyncRequest = onSyncRequest;
    this.jiraDomain = jiraDomain;
    this.isSyncing = false;
    this.syncStatus = null;
    this.changeCount = 0;
  }

  /**
   * Update sync status
   */
  setStatus(status) {
    this.syncStatus = status;
    if (typeof status.changeCount === 'number') {
      this.changeCount = status.changeCount;
    }
    this.refresh();
  }

  /**
   * Set syncing state
   */
  setSyncing(syncing) {
    this.isSyncing = syncing;
    this.refresh();
  }

  /**
   * Render the sync status component
   */
  render() {
    const { lastSync, lastFullSync, issueCount } = this.syncStatus || {};

    const lastSyncText = lastSync
      ? timeAgo(new Date(lastSync))
      : 'Never';

    const badgeHtml = (!this.isSyncing && this.changeCount > 0)
      ? `<button class="sync-changes-badge" id="sync-changes-badge" title="View what changed">
           ${this.changeCount} issue${this.changeCount !== 1 ? 's' : ''} updated
         </button>`
      : '';

    return `
      <div class="sync-status" id="sync-status">
        <button
          class="sync-button ${this.isSyncing ? 'syncing' : ''}"
          id="sync-btn"
          title="${this.isSyncing ? 'Syncing...' : 'Sync now'}"
          ${this.isSyncing ? 'disabled' : ''}
        >
          ${this.isSyncing ? '⟳' : '🔄'}
          ${this.isSyncing ? 'Syncing...' : 'Sync'}
        </button>

        ${badgeHtml}

        <div class="sync-info">
          <span class="sync-count">${issueCount || 0} issues</span>
          <span class="sync-time" title="Last sync: ${lastSync || 'Never'}">
            Last sync: ${lastSyncText}
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Refresh the component in the DOM
   */
  refresh() {
    const container = document.getElementById('sync-status');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const syncBtn = document.getElementById('sync-btn');
    syncBtn?.addEventListener('click', () => {
      if (!this.isSyncing && this.onSyncRequest) {
        this.onSyncRequest();
      }
    });

    const badgeBtn = document.getElementById('sync-changes-badge');
    if (badgeBtn) {
      badgeBtn.addEventListener('click', () => this.showChangelog());
    }
  }

  async showChangelog() {
    try {
      const { getLatestChangelog } = await import('../db/queries.js');
      const { openChangelogDrawer } = await import('./ChangelogDrawer.js');
      const changes = await getLatestChangelog();
      openChangelogDrawer(changes, this.jiraDomain, null);
    } catch (error) {
      logger.error('[SyncStatus] Failed to show changelog:', error);
      showError('Could not load changelog. Wait for next sync.');
    }
  }

}

/**
 * Sync Status Styles
 */
export const SyncStatusStyles = `
  .sync-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    background: var(--primary);
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .sync-button:hover:not(:disabled) {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow);
  }

  .sync-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sync-button.syncing {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .sync-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .sync-count {
    font-weight: 600;
    color: var(--text);
  }

  .sync-time {
    color: var(--text-secondary);
  }

  .sync-changes-badge {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--primary, #6366f1) 12%, transparent);
    color: var(--primary, #6366f1);
    border: 1px solid var(--primary, #6366f1);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .sync-changes-badge:hover {
    background: color-mix(in srgb, var(--primary, #6366f1) 20%, transparent);
    transform: translateY(-1px);
  }
`;
