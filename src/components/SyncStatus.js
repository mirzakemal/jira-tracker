/**
 * Sync Status Component
 * Displays sync indicator and provides sync controls
 */

export class SyncStatus {
  constructor(onSyncRequest) {
    this.onSyncRequest = onSyncRequest;
    this.isSyncing = false;
    this.syncStatus = null;
  }

  /**
   * Update sync status
   */
  setStatus(status) {
    this.syncStatus = status;
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
      ? this.timeAgo(new Date(lastSync))
      : 'Never';

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
  }

  /**
   * Format time ago
   */
  timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

    return date.toLocaleDateString();
  }
}

/**
 * Sync Status Styles
 */
export const SyncStatusStyles = `
  .sync-status {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow);
  }

  .sync-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    background: var(--accent);
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .sync-button:hover:not(:disabled) {
    background: var(--accent-hover);
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
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .sync-count {
    font-weight: 600;
    color: var(--text);
  }

  .sync-time {
    color: var(--text-secondary);
  }
`;
