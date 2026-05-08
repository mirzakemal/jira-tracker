import { getDependencyChain } from '../db/queries.js';
import { escapeHtml } from '../utils/html.js';

const statusColors = {
  'to do': '#42526e', 'in progress': '#0052cc', 'in review': '#5243aa',
  done: '#00875a', closed: '#00875a', resolved: '#00875a',
  blocked: '#de350b', reopened: '#de350b', default: '#7a869a'
};

function statusColor(status) {
  const key = (status || '').toLowerCase().trim();
  return statusColors[key] || statusColors.default;
}

function statusDot(color) {
  return `<span class="dep-status-dot" style="background:${color}"></span>`;
}

export class DependencyGraphView {
  constructor(issueKey, issueSummary, onIssueClick) {
    this.issueKey = issueKey;
    this.issueSummary = issueSummary;
    this.onIssueClick = onIssueClick;
    this.direction = 'outward';
    this.tree = null;
    this.loading = false;
    this.error = null;
    this._eventsBound = false;
    this._boundDocKey = null;
  }

  async init() {
    await this._loadTree();
  }

  async _loadTree() {
    this.loading = true;
    this.error = null;
    this.tree = null;
    this.render();

    try {
      this.tree = await getDependencyChain(this.issueKey, this.direction, { maxDepth: 15 });
    } catch (err) {
      logger.error('[DependencyGraph] Failed to load:', err);
      this.error = 'Failed to load dependency graph';
    }
    this.loading = false;
    this.render();
    this._bindEvents();
  }

  async switchDirection(dir) {
    if (this.direction === dir) return;
    this.direction = dir;
    await this._loadTree();
  }

  render() {
    const container = document.getElementById('dep-graph-container');
    if (!container) return;

    const label = this.direction === 'outward' ? 'Blocks' : 'Blocked By';
    const tabOut = this.direction === 'outward' ? 'active' : '';
    const tabIn = this.direction === 'inward' ? 'active' : '';
    const backBtn = `<a href="/board" class="dep-back-btn" data-nav="/board">← Back to Board</a>`;

    let content = '';
    if (this.loading) {
      content = `<div class="dep-loading">Loading dependency graph...</div>`;
    } else if (this.error) {
      content = `<div class="dep-error">
        <p>${escapeHtml(this.error)}</p>
        <button class="dep-retry-btn" data-action="retry-dep">Retry</button>
      </div>`;
    } else if (this.tree) {
      content = this._renderTree(this.tree, 0);
    }

    container.innerHTML = `
      <div class="dep-header">
        ${backBtn}
        <h2 class="dep-title">Dependencies for <span class="dep-key">${escapeHtml(this.issueKey)}</span></h2>
        <p class="dep-summary">${escapeHtml(this.issueSummary)}</p>
      </div>
      <div class="dep-tabs">
        <button class="dep-tab ${tabOut}" data-action="dep-dir" data-dir="outward">Blocks ▸</button>
        <button class="dep-tab ${tabIn}" data-action="dep-dir" data-dir="inward">◂ Blocked By</button>
      </div>
      <div class="dep-tree">${content}</div>
    `;
  }

  _renderTree(node, depth) {
    if (!node || !node.key) return '';

    const indent = depth > 0 ? `style="padding-left:${Math.min(depth * 24, 120)}px"` : '';
    const hasChildren = node.links && node.links.length > 0;
    const chevron = hasChildren ? `<span class="dep-chevron" data-action="dep-toggle" data-key="${escapeHtml(node.key)}">▼</span>` : `<span class="dep-chevron dep-chevron-empty"></span>`;
    const color = statusColor(node.status);
    const isRoot = node.key === this.issueKey;
    const rootClass = isRoot ? ' dep-node-root' : '';

    let html = `<div class="dep-node${rootClass}" ${indent}>
      <div class="dep-node-row">
        ${chevron}
        ${statusDot(color)}
        <a class="dep-node-key" data-action="dep-issue" data-key="${escapeHtml(node.key)}" data-summary="${escapeHtml(node.summary || node.key)}">${escapeHtml(node.key)}</a>
        <span class="dep-node-summary">${escapeHtml(node.summary)}</span>
        ${node.link_type ? `<span class="dep-link-tag">${escapeHtml(node.direction_label || node.link_type)}</span>` : ''}
      </div>`;

    if (hasChildren) {
      html += `<div class="dep-children">`;
      for (const child of node.links) {
        html += this._renderTree(child, depth + 1);
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  _bindEvents() {
    if (this._eventsBound) return;

    const container = document.getElementById('dep-graph-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;

      const act = action.dataset.action;

      if (act === 'dep-dir') {
        const dir = action.dataset.dir;
        this.switchDirection(dir);
      }

      if (act === 'dep-issue') {
        const key = action.dataset.key;
        const summary = action.dataset.summary;
        if (this.onIssueClick) {
          this.onIssueClick(key, summary);
        }
      }

      if (act === 'dep-toggle') {
        const key = action.dataset.key;
        this._toggleNode(key);
      }

      if (act === 'retry-dep') {
        this._loadTree();
      }

      if (act === 'nav') {
        const href = action.dataset.nav;
        if (href && window.navigate) {
          window.navigate('board');
        }
      }
    });

    this._eventsBound = true;
  }

  _toggleNode(key) {
    const container = document.getElementById('dep-graph-container');
    if (!container) return;

    const nodeEl = container.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!nodeEl) return;

    const nodeRow = nodeEl.closest('.dep-node');
    if (!nodeRow) return;

    const children = nodeRow.querySelector(':scope > .dep-children');
    if (!children) return;

    const chevron = nodeRow.querySelector('.dep-chevron');
    const isCollapsed = children.style.display === 'none';

    children.style.display = isCollapsed ? '' : 'none';
    if (chevron) {
      chevron.textContent = isCollapsed ? '▼' : '▶';
    }
  }

  destroy() {
    const container = document.getElementById('dep-graph-container');
    if (container) {
      container.innerHTML = '';
    }
    this._eventsBound = false;
  }
}

export const DependencyGraphViewStyles = `
.dep-header { padding: 16px 20px 12px; border-bottom: 1px solid var(--border); }
.dep-back-btn { color: var(--primary); text-decoration: none; font-size: 13px; cursor: pointer; display: inline-block; margin-bottom: 8px; }
.dep-back-btn:hover { text-decoration: underline; }
.dep-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--text); }
.dep-key { color: var(--primary); }
.dep-summary { margin: 4px 0 0; font-size: 13px; color: var(--text-subtle); }
.dep-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); padding: 0 20px; }
.dep-tab { flex: 1; padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-subtle); border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s; }
.dep-tab:hover { color: var(--text); }
.dep-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.dep-tree { padding: 12px 20px 20px; overflow-y: auto; max-height: calc(100vh - 200px); }
.dep-node { font-size: 13px; }
.dep-node-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 4px; cursor: default; }
.dep-node-row:hover { background: var(--hover); }
.dep-node-root .dep-node-row { font-weight: 600; }
.dep-chevron { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; color: var(--text-subtle); flex-shrink: 0; user-select: none; }
.dep-chevron:hover { color: var(--text); }
.dep-chevron-empty { cursor: default; }
.dep-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dep-node-key { color: var(--primary); text-decoration: none; cursor: pointer; font-family: monospace; font-size: 12px; }
.dep-node-key:hover { text-decoration: underline; }
.dep-node-summary { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dep-link-tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: var(--hover-border); color: var(--text-subtle); flex-shrink: 0; }
.dep-children {}
.dep-loading { text-align: center; padding: 40px; color: var(--text-subtle); font-size: 14px; }
.dep-error { text-align: center; padding: 40px; color: var(--danger); }
.dep-retry-btn { margin-top: 12px; padding: 6px 16px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); cursor: pointer; font-size: 13px; color: var(--text); }
.dep-retry-btn:hover { background: var(--hover); }
`;
