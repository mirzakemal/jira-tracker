/**
 * Changelog Drawer Component
 * Slide-in drawer showing what changed in the most recent sync
 */

import { escapeHtml } from '../utils/html.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';

export class ChangelogDrawer {
  constructor(changes, jiraDomain, onClose) {
    this.changes = changes || [];
    this.jiraDomain = jiraDomain;
    this.onClose = onClose;
  }

  render() {
    const { changes } = this;

    const headerHtml = `
      <div class="changelog-drawer-header">
        <h2>What's Changed</h2>
        <span class="changelog-count">${changes.length} issue${changes.length !== 1 ? 's' : ''} updated</span>
        <button class="changelog-close-btn" id="changelog-close-btn" title="Close">&times;</button>
      </div>
    `;

    if (!changes.length) {
      return this.renderShell(headerHtml + `
        <div class="changelog-body">
          <div class="changelog-empty">
            <p>No changes detected in the last sync.</p>
            <p class="changelog-sub">Issues are up to date with Jira.</p>
          </div>
        </div>
      `);
    }

    const itemsHtml = changes.map(entry => {
      const changesList = entry.changes.map(c => {
        const oldDisplay = c.old || '(none)';
        const newDisplay = c.new || '(none)';
        const labelMap = {
          status: 'Status',
          assignee: 'Assignee',
          priority: 'Priority',
          fix_version: 'Fix Version'
        };
        return `
          <div class="changelog-field-change">
            <span class="changelog-field-name">${escapeHtml(labelMap[c.field] || c.field)}</span>
            <span class="changelog-old-value">${escapeHtml(oldDisplay)}</span>
            <span class="changelog-arrow">&rarr;</span>
            <span class="changelog-new-value">${escapeHtml(newDisplay)}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="changelog-issue-card" data-issue-key="${escapeHtml(entry.issue_key)}">
          <button class="changelog-issue-link" data-issue-key="${escapeHtml(entry.issue_key)}">
            <span class="changelog-issue-key">${escapeHtml(entry.issue_key)}</span>
            <span class="changelog-issue-summary">${escapeHtml(entry.issue_summary)}</span>
          </button>
          <div class="changelog-issue-changes">
            ${changesList}
          </div>
        </div>
      `;
    }).join('');

    return this.renderShell(headerHtml + `
      <div class="changelog-body">
        ${itemsHtml}
      </div>
    `);
  }

  renderShell(content) {
    return `
      <div class="changelog-backdrop" id="changelog-backdrop"></div>
      <div class="changelog-drawer">
        ${content}
      </div>
    `;
  }

  bindEvents() {
    const closeBtn = document.getElementById('changelog-close-btn');
    const backdrop = document.getElementById('changelog-backdrop');

    closeBtn?.addEventListener('click', () => this.close());
    backdrop?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    });

    document.querySelectorAll('.changelog-issue-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const issueKey = btn.dataset.issueKey;
        if (issueKey) {
          this.close();
          openIssueDrawer(issueKey, this.jiraDomain, null);
        }
      });
    });
  }

  close() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
    }
    const overlay = document.getElementById('changelog-overlay');
    overlay?.remove();
    if (this.onClose) this.onClose();
  }
}

/**
 * Open the changelog drawer
 */
export function openChangelogDrawer(changes, jiraDomain, onClose) {
  const existing = document.getElementById('changelog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'changelog-overlay';
  overlay.className = 'changelog-overlay';

  const drawer = new ChangelogDrawer(changes, jiraDomain, onClose);
  overlay.innerHTML = drawer.render();
  document.body.appendChild(overlay);
  drawer.bindEvents();
}

export const ChangelogDrawerStyles = `
  .changelog-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 999;
  }
  .changelog-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
  }
  .changelog-drawer {
    position: absolute;
    top: 0; right: 0;
    width: 520px;
    max-width: 95vw;
    height: 100%;
    background: var(--bg, #1a1a2e);
    box-shadow: -4px 0 20px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.25s ease-out;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .changelog-drawer-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border, #333);
    background: var(--bg-secondary, #16213e);
    flex-shrink: 0;
  }
  .changelog-drawer-header h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text, #e0e0e0);
    flex: 1;
  }
  .changelog-count {
    font-size: 12px;
    color: var(--accent, #64ffda);
    background: color-mix(in srgb, var(--accent, #64ffda) 15%, transparent);
    padding: 3px 10px;
    border-radius: 12px;
  }
  .changelog-close-btn {
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .changelog-close-btn:hover {
    color: var(--text, #e0e0e0);
  }
  .changelog-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }
  .changelog-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary, #888);
  }
  .changelog-empty p {
    margin: 4px 0;
    font-size: 14px;
  }
  .changelog-sub {
    font-size: 12px !important;
    opacity: 0.6;
  }
  .changelog-issue-card {
    background: var(--bg-secondary, #16213e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .changelog-issue-link {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }
  .changelog-issue-link:hover .changelog-issue-key {
    text-decoration: underline;
  }
  .changelog-issue-key {
    font-weight: 600;
    color: var(--accent, #64ffda);
    font-size: 13px;
    display: inline-block;
    margin-right: 8px;
  }
  .changelog-issue-summary {
    color: var(--text, #e0e0e0);
    font-size: 13px;
  }
  .changelog-issue-changes {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .changelog-field-change {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .changelog-field-name {
    color: var(--text-secondary, #888);
    width: 90px;
    flex-shrink: 0;
  }
  .changelog-old-value {
    color: var(--danger, #ff6b6b);
    text-decoration: line-through;
    text-decoration-color: var(--danger, #ff6b6b);
  }
  .changelog-arrow {
    color: var(--text-secondary, #888);
    flex-shrink: 0;
  }
  .changelog-new-value {
    color: var(--success, #51cf66);
    font-weight: 500;
  }
`;
