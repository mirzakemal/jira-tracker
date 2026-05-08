import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class IssueDetailDrawer {
  constructor(issueKey, jiraDomain, onClose) {
    this.issueKey = issueKey;
    this.jiraDomain = jiraDomain;
    this.onClose = onClose;
    this.issue = null;
    this.parsedRaw = null;
    this.isLoading = true;
  }

  async load() {
    try {
      const { getIssueByKey, getTags } = await import('../db/queries.js');
      this.issue = await getIssueByKey(this.issueKey);
      if (!this.issue) {
        this.isLoading = false;
        this.refresh();
        return;
      }
      if (!this.issue.tags || this.issue.tags.length === 0) {
        this.issue.tags = await getTags(this.issueKey);
      }
      if (this.issue.raw_data) {
        try {
          this.parsedRaw = JSON.parse(this.issue.raw_data);
        } catch (e) {
          this.parsedRaw = null;
        }
      }
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[IssueDetailDrawer] Failed to load:', error);
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    const overlay = document.getElementById('issue-detail-overlay');
    if (overlay) {
      overlay.innerHTML = this.render();
      this.bindEvents();
    }
  }

  render() {
    if (this.isLoading) {
      return this.renderShell('<div class="loading-board"><div class="spinner"></div><p>Loading issue details...</p></div>');
    }
    if (!this.issue) {
      return this.renderShell('<div class="loading-board"><p>Issue not found in local cache. Please sync your data.</p></div>');
    }

    const i = this.issue;
    const jiraUrl = this.jiraDomain
      ? `https://${this.jiraDomain.replace(/^https?:\/\//, '')}/browse/${i.key}`
      : `/browse/${i.key}`;

    return `
      <div class="issue-detail-backdrop" id="issue-detail-backdrop"></div>
      <div class="issue-detail-drawer" id="issue-detail-drawer" role="dialog" aria-modal="true" aria-label="Issue ${i.key}">
        <div class="drawer-header">
          <div class="drawer-title">
            <span class="issue-type-badge">${escapeHtml(i.issue_type || 'Issue')}</span>
            <span class="issue-key">${escapeHtml(i.key)}</span>
            <span class="issue-status-badge">${escapeHtml(i.status || 'Unknown')}</span>
          </div>
          <div class="drawer-actions">
            <a href="${jiraUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Open in Jira</a>
            <button class="btn btn-secondary btn-sm" id="dep-graph-btn" data-issue="${escapeHtml(i.key)}" data-summary="${escapeHtml(i.summary || '')}" aria-label="Show dependencies">Dependencies</button>
            <button class="drawer-close" id="drawer-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="drawer-body">
          <h2 class="issue-summary">${escapeHtml(i.summary || 'No summary')}</h2>
          <div class="issue-meta-grid">
            <div class="meta-item">
              <label>Assignee</label>
              <span>${escapeHtml(i.assignee_name || 'Unassigned')}</span>
            </div>
            <div class="meta-item">
              <label>Reporter</label>
              <span>${escapeHtml(i.reporter_name || 'Unknown')}</span>
            </div>
            <div class="meta-item">
              <label>Priority</label>
              <span>${escapeHtml(i.priority || 'None')}</span>
            </div>
            <div class="meta-item">
              <label>Fix Version</label>
              <span>${escapeHtml(i.fix_version || '-')}</span>
            </div>
            <div class="meta-item">
              <label>Created</label>
              <span>${formatDate(i.created_at)}</span>
            </div>
            <div class="meta-item">
              <label>Updated</label>
              <span>${formatDate(i.updated_at)}</span>
            </div>
          </div>
          ${this.renderDescription()}
          ${this.renderSubtasks()}
          ${this.renderLinkedIssues()}
          ${this.renderComments()}
          <div class="issue-section">
            <h4>Local Tags</h4>
            <div class="issue-tags">
              ${i.tags && i.tags.length > 0
                ? i.tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('')
                : '<span class="no-data">No tags</span>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderShell(body) {
    return `
      <div class="issue-detail-backdrop" id="issue-detail-backdrop"></div>
      <div class="issue-detail-drawer" id="issue-detail-drawer" role="dialog" aria-modal="true">
        <div class="drawer-header">
          <div class="drawer-title">
            <span class="issue-key">${escapeHtml(this.issueKey)}</span>
          </div>
          <div class="drawer-actions">
            <button class="drawer-close" id="drawer-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="drawer-body">${body}</div>
      </div>
    `;
  }

  renderDescription() {
    const body = this._getADFContent('description');
    if (!body) {
      return `
        <div class="issue-section">
          <h4>Description</h4>
          <div class="issue-description"><span class="no-data">No description</span></div>
        </div>`;
    }
    return `
      <div class="issue-section">
        <h4>Description</h4>
        <div class="issue-description">${this.renderAdfPlainText(body)}</div>
      </div>`;
  }

  renderSubtasks() {
    const subtasks = this.parsedRaw?.fields?.subtasks || [];
    if (!subtasks.length) return '';
    return `
      <div class="issue-section">
        <h4>Subtasks (${subtasks.length})</h4>
        <div class="issue-subtasks">
          ${subtasks.map(s => `
            <div class="subtask-item">
              <span class="subtask-status">${escapeHtml(s.fields?.status?.name || 'Unknown')}</span>
              <a href="#" class="subtask-key" data-issue-key="${escapeHtml(s.key)}">${escapeHtml(s.key)}</a>
              <span class="subtask-summary">${escapeHtml(s.fields?.summary || '')}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  renderLinkedIssues() {
    const links = this.parsedRaw?.fields?.issuelinks || [];
    if (!links.length) return '';
    return `
      <div class="issue-section">
        <h4>Linked Issues (${links.length})</h4>
        <div class="linked-issues">
          ${links.map(link => {
            const type = link.type?.name || 'relates to';
            const isOutward = !!(link.outwardIssue);
            const linked = isOutward ? link.outwardIssue : link.inwardIssue;
            if (!linked) return '';
            return `
              <div class="linked-issue-item">
                <span class="link-type ${isOutward ? 'outward' : 'inward'}">${escapeHtml(type)}</span>
                <a href="#" class="linked-issue-key" data-issue-key="${escapeHtml(linked.key)}">${escapeHtml(linked.key)}</a>
                <span class="linked-issue-summary">${escapeHtml(linked.fields?.summary || '')}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>`;
  }

  renderComments() {
    const comments = this._getADFContent('comment');
    if (!comments || !comments.length) {
      return `
        <div class="issue-section">
          <h4>Comments</h4>
          <div class="issue-comments"><span class="no-data">No comments cached</span></div>
        </div>`;
    }
    return `
      <div class="issue-section">
        <h4>Comments (${comments.length})</h4>
        <div class="issue-comments">
          ${comments.map(c => `
            <div class="comment-item">
              <div class="comment-author">${escapeHtml(c.author?.displayName || 'Unknown')}</div>
              <div class="comment-date">${formatDate(c.created)}</div>
              <div class="comment-body">${this.renderAdfPlainText(c.body)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  _getADFContent(field) {
    const fields = this.parsedRaw?.fields;
    if (!fields) return null;
    if (field === 'description') return fields.description || null;
    if (field === 'comment') return fields.comment?.comments || null;
    return null;
  }

  renderAdfPlainText(node) {
    if (!node) return '';
    if (typeof node === 'string') return escapeHtml(node);
    if (node.text) return escapeHtml(node.text);
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(c => this._renderAdfNode(c)).join('');
    }
    return '';
  }

  _renderAdfNode(node) {
    if (!node) return '';
    if (typeof node === 'string') return escapeHtml(node);

    const type = node.type;
    const content = node.content;

    if (node.text) {
      let text = escapeHtml(node.text);
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'strong': text = `<strong>${text}</strong>`; break;
            case 'em': text = `<em>${text}</em>`; break;
            case 'code': text = `<code>${text}</code>`; break;
            case 'link': text = `<a href="${escapeHtml(mark.attrs?.href || '#')}" target="_blank" rel="noopener">${text}</a>`; break;
            case 'strike': text = `<del>${text}</del>`; break;
            case 'underline': text = `<u>${text}</u>`; break;
          }
        }
      }
      return text;
    }

    if (!content || !Array.isArray(content)) return '';

    const inner = content.map(c => this._renderAdfNode(c)).join('');

    switch (type) {
      case 'paragraph': return `<p>${inner}</p>`;
      case 'heading': return `<h${node.attrs?.level || 3}>${inner}</h${node.attrs?.level || 3}>`;
      case 'bulletList': return `<ul>${inner}</ul>`;
      case 'orderedList': return `<ol>${inner}</ol>`;
      case 'listItem': return `<li>${inner}</li>`;
      case 'codeBlock': return `<pre><code>${inner}</code></pre>`;
      case 'blockquote': return `<blockquote>${inner}</blockquote>`;
      case 'rule': return '<hr>';
      case 'hardBreak': return '<br>';
      case 'mention': return `<span class="mention">@${escapeHtml(node.attrs?.text || 'unknown')}</span>`;
      case 'emoji': return escapeHtml(node.attrs?.text || node.attrs?.shortName || '');
      case 'inlineCard': return `<a href="${escapeHtml(node.attrs?.url || '#')}" class="inline-card" target="_blank" rel="noopener">${escapeHtml(node.attrs?.url || 'link')}</a>`;
      case 'media': return `<span class="media-placeholder">📎 Attachment</span>`;
      case 'table': return `<table class="adf-table">${inner}</table>`;
      case 'tableRow': return `<tr>${inner}</tr>`;
      case 'tableCell': return `<td>${inner}</td>`;
      case 'tableHeader': return `<th>${inner}</th>`;
      case 'panel': return `<div class="adf-panel">${inner}</div>`;
      default: return inner;
    }
  }

  bindEvents() {
    if (!this._boundClose) {
      this._boundClose = () => {
        const overlay = document.getElementById('issue-detail-overlay');
        overlay?.remove();
        this._cleanup();
        window.activeIssueDrawer = null;
        this.onClose?.();
      };
      this._boundHandleKey = (e) => {
        if (e.key === 'Escape') this._boundClose();
      };
      this._boundHashChange = () => this._boundClose();
      document.addEventListener('keydown', this._boundHandleKey);
      window.addEventListener('hashchange', this._boundHashChange);
    }

    const close = this._boundClose;
    document.getElementById('drawer-close')?.addEventListener('click', close);
    document.getElementById('issue-detail-backdrop')?.addEventListener('click', close);

    document.querySelectorAll('.subtask-key, .linked-issue-key').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const key = link.dataset.issueKey;
        if (key) {
          const overlay = document.getElementById('issue-detail-overlay');
          overlay?.remove();
          this._cleanup();
          window.activeIssueDrawer = null;
          openIssueDrawer(key, this.jiraDomain, this.onClose);
        }
      });
    });

    document.getElementById('dep-graph-btn')?.addEventListener('click', () => {
      const key = document.getElementById('dep-graph-btn')?.dataset.issue;
      const summary = document.getElementById('dep-graph-btn')?.dataset.summary;
      if (key) {
        const encodedSummary = encodeURIComponent(summary || '');
        window.navigate('deps', { issueKey: key, summary: encodedSummary });
      }
    });
  }

  _cleanup() {
    if (this._boundHandleKey) {
      document.removeEventListener('keydown', this._boundHandleKey);
      this._boundHandleKey = null;
    }
    if (this._boundHashChange) {
      window.removeEventListener('hashchange', this._boundHashChange);
      this._boundHashChange = null;
    }
    this._boundClose = null;
  }
}

export function openIssueDrawer(issueKey, jiraDomain, onClose) {
  if (window.activeIssueDrawer) {
    window.activeIssueDrawer._cleanup();
    window.activeIssueDrawer = null;
  }
  const existing = document.getElementById('issue-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'issue-detail-overlay';
  overlay.className = 'issue-detail-overlay';

  const drawer = new IssueDetailDrawer(issueKey, jiraDomain, onClose);
  window.activeIssueDrawer = drawer;
  overlay.innerHTML = drawer.render();
  document.body.appendChild(overlay);
  drawer.load();
}

export const IssueDetailDrawerStyles = `
  .issue-detail-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 1000;
  }
  .issue-detail-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
  }
  .issue-detail-drawer {
    position: absolute;
    top: 0; right: 0;
    width: 600px;
    max-width: 90vw;
    height: 100%;
    background: var(--bg, #1a1a2e);
    box-shadow: -4px 0 24px rgba(0,0,0,0.25);
    display: flex;
    flex-direction: column;
    animation: drawerSlideIn 0.2s ease;
  }
  @keyframes drawerSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border, #333);
    background: var(--surface, #1e1e36);
    flex-shrink: 0;
  }
  .drawer-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .drawer-title .issue-type-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--accent, #4f8cff);
    color: white;
  }
  .drawer-title .issue-key {
    font-size: 16px;
    font-weight: 700;
    color: var(--text, #e0e0e0);
  }
  .drawer-title .issue-status-badge {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    background: var(--hover, #2a2a44);
    color: var(--text, #e0e0e0);
  }
  .drawer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .drawer-close {
    background: none;
    border: none;
    color: var(--text-secondary, #999);
    font-size: 24px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .drawer-close:hover {
    color: var(--text, #e0e0e0);
  }
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  .issue-summary {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text, #e0e0e0);
    line-height: 1.4;
  }
  .issue-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin: 0 0 20px 0;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .meta-item label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary, #888);
    letter-spacing: 0.3px;
  }
  .meta-item span {
    font-size: 13px;
    color: var(--text, #e0e0e0);
  }
  .issue-section {
    margin-bottom: 20px;
  }
  .issue-section h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text, #e0e0e0);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border, #333);
  }
  .issue-description {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text, #e0e0e0);
    white-space: pre-wrap;
  }
  .issue-description p {
    margin: 0 0 8px 0;
  }
  .issue-description ul, .issue-description ol {
    margin: 0 0 8px 0;
    padding-left: 20px;
  }
  .issue-description li {
    margin-bottom: 4px;
  }
  .issue-description h1, .issue-description h2, .issue-description h3, .issue-description h4 {
    margin: 12px 0 6px 0;
    font-size: 14px;
  }
  .issue-description code {
    background: var(--hover, #2a2a44);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 12px;
  }
  .issue-description pre {
    background: var(--hover, #2a2a44);
    padding: 10px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 12px;
    margin: 8px 0;
  }
  .issue-description blockquote {
    border-left: 3px solid var(--accent, #4f8cff);
    margin: 8px 0;
    padding: 4px 12px;
    color: var(--text-secondary, #aaa);
  }
  .issue-subtasks, .linked-issues {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .subtask-item, .linked-issue-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 6px 8px;
    background: var(--surface, #1e1e36);
    border-radius: 6px;
    border: 1px solid var(--border, #333);
  }
  .subtask-status {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--hover, #2a2a44);
    color: var(--text-secondary, #aaa);
  }
  .subtask-key, .linked-issue-key {
    font-weight: 600;
    color: var(--accent, #4f8cff);
    text-decoration: none;
    cursor: pointer;
  }
  .subtask-key:hover, .linked-issue-key:hover {
    text-decoration: underline;
  }
  .subtask-summary, .linked-issue-summary {
    color: var(--text-secondary, #aaa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .link-type {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-style: italic;
  }
  .link-type.outward {
    background: rgba(79, 140, 255, 0.15);
    color: var(--accent, #4f8cff);
  }
  .link-type.inward {
    background: rgba(255, 165, 0, 0.15);
    color: orange;
  }
  .issue-comments {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .comment-item {
    padding: 10px 12px;
    background: var(--surface, #1e1e36);
    border-radius: 8px;
    border: 1px solid var(--border, #333);
  }
  .comment-author {
    font-size: 13px;
    font-weight: 600;
    color: var(--text, #e0e0e0);
  }
  .comment-date {
    font-size: 11px;
    color: var(--text-secondary, #888);
    margin-bottom: 6px;
  }
  .comment-body {
    font-size: 13px;
    color: var(--text, #e0e0e0);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .issue-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag-badge {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    background: var(--hover, #2a2a44);
    color: var(--text-secondary, #ccc);
    border: 1px solid var(--border, #444);
  }
  .no-data {
    color: var(--text-secondary, #888);
    font-style: italic;
    font-size: 13px;
  }
  .mention {
    color: var(--accent, #4f8cff);
    font-weight: 500;
  }
  .inline-card {
    color: var(--accent, #4f8cff);
  }
  .media-placeholder {
    color: var(--text-secondary, #888);
    font-style: italic;
  }
  .adf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .adf-table td {
    padding: 6px 8px;
    border: 1px solid var(--border, #333);
  }
  .adf-panel {
    padding: 10px;
    background: var(--hover, #2a2a44);
    border-radius: 6px;
    margin: 8px 0;
  }
`;
