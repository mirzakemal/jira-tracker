import { getReleaseProgress, getAllProjects } from '../db/queries.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';
import logger from '../utils/logger.js';

export class ReleaseProgressView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.releases = null;
    this.isLoading = true;
    this.error = null;
    this.projectKey = null;
    this.projects = [];
  }

  async load(projectKey = null) {
    this.projectKey = projectKey;
    this.isLoading = true;
    this.refresh();
    try {
      const [releases, projects] = await Promise.all([
        getReleaseProgress({ projectKey }),
        getAllProjects()
      ]);
      this.releases = releases;
      this.projects = projects;
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[Releases] Failed to load:', error);
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    const container = document.getElementById('releases-view');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  render() {
    if (this.error) return this.renderError();

    if (this.isLoading) {
      return `<div class="releases-view" id="releases-view"><div class="loading-board"><div class="spinner"></div><p>Loading release progress...</p></div></div>`;
    }

    if (!this.releases || this.releases.length === 0) {
      return this.renderEmpty();
    }

    const projectsHtml = this.projects.map(p =>
      `<option value="${escapeHtml(p.key)}"${p.key === this.projectKey ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const maxTotal = Math.max(...this.releases.map(r => r.total), 1);
    const totalIssues = this.releases.reduce((s, r) => s + r.total, 0);
    const totalCompleted = this.releases.reduce((s, r) => s + r.completed, 0);
    const overallRate = totalIssues > 0 ? Math.round((totalCompleted / totalIssues) * 100) : 0;
    const atRiskCount = this.releases.filter(r => r.risk === 'high' || r.risk === 'critical').length;

    return `
      <div class="releases-view" id="releases-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="releases-back-btn">← Back to Board</button>
            <h2>Release Progress</h2>
          </div>
          <div class="view-header-right">
            <select class="project-filter" id="releases-project-filter">
              <option value="">All Projects</option>
              ${projectsHtml}
            </select>
          </div>
        </div>

        <div class="releases-summary">
          <div class="summary-card">
            <div class="summary-value">${this.releases.length}</div>
            <div class="summary-label">Releases</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${totalIssues}</div>
            <div class="summary-label">Total Issues</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${overallRate}%</div>
            <div class="summary-label">Completion Rate</div>
          </div>
          <div class="summary-card ${atRiskCount > 0 ? 'summary-card-warning' : ''}">
            <div class="summary-value">${atRiskCount}</div>
            <div class="summary-label">At Risk</div>
          </div>
        </div>

        <div class="releases-grid">
          ${this.releases.map(release => this.renderReleaseCard(release)).join('')}
        </div>
      </div>
    `;
  }

  renderReleaseCard(release) {
    const riskClass = release.risk === 'critical' ? 'risk-critical' :
                       release.risk === 'high' ? 'risk-high' :
                       release.risk === 'medium' ? 'risk-medium' : 'risk-low';
    const riskLabel = release.risk === 'critical' ? 'Overdue' :
                       release.risk === 'high' ? 'At Risk' :
                       release.risk === 'medium' ? 'Watch' : 'On Track';
    const progressColor = release.progress >= 80 ? 'bar-green' :
                           release.progress >= 50 ? 'bar-amber' : 'bar-red';
    const showIssueList = release.issues.length <= 15;
    const slug = release.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');

    return `
      <div class="release-card ${riskClass}" data-release="${escapeHtml(release.name)}">
        <div class="release-card-header">
          <h3 class="release-name">${escapeHtml(release.name)}</h3>
          <span class="release-risk-badge ${riskClass}">${riskLabel}</span>
        </div>

        <div class="release-progress-bar">
          <div class="progress-track">
            <div class="progress-fill ${progressColor}" style="width: ${release.progress}%"></div>
          </div>
          <span class="progress-text">${release.progress}%</span>
        </div>

        <div class="release-stats">
          <div class="release-stat">
            <span class="stat-value">${release.total}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="release-stat stat-done">
            <span class="stat-value">${release.completed}</span>
            <span class="stat-label">Done</span>
          </div>
          <div class="release-stat stat-inprogress">
            <span class="stat-value">${release.inProgress}</span>
            <span class="stat-label">In Progress</span>
          </div>
          ${release.targetDate ? `
            <div class="release-stat">
              <span class="stat-value">${formatDate(release.targetDate)}</span>
              <span class="stat-label">Target</span>
            </div>
          ` : ''}
        </div>

        ${showIssueList ? `
          <div class="release-issue-list">
            ${release.issues.map(issue => {
              const isDone = (issue.status_category || '').toLowerCase().includes('done') ||
                             (issue.status_category || '').toLowerCase().includes('closed') ||
                             (issue.status_category || '').toLowerCase().includes('resolved');
              return `
                <div class="release-issue-row ${isDone ? 'issue-completed' : ''}"
                     data-issue-key="${escapeHtml(issue.key)}"
                     title="${escapeHtml(issue.summary || issue.key)}">
                  <span class="issue-key-badge">${escapeHtml(issue.key)}</span>
                  <span class="issue-status-tag ${isDone ? 'status-done' : 'status-active'}">${escapeHtml(issue.status || '')}</span>
                  <span class="issue-summary-text">${escapeHtml(issue.summary || '')}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="release-issue-count">${release.issues.length} issues</div>
        `}
      </div>
    `;
  }

  renderEmpty() {
    const projectsHtml = this.projects.map(p =>
      `<option value="${escapeHtml(p.key)}"${p.key === this.projectKey ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');
    return `
      <div class="releases-view" id="releases-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="releases-back-btn">← Back to Board</button>
            <h2>Release Progress</h2>
          </div>
          <div class="view-header-right">
            <select class="project-filter" id="releases-project-filter">
              <option value="">All Projects</option>
              ${projectsHtml}
            </select>
          </div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>No Releases Found</h3>
          <p>No issues with fix versions found in cached data. Try syncing your data or selecting a different project.</p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('releases-back-btn')?.addEventListener('click', () => this.onBack?.());
    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      this.error = null;
      this.load(this.projectKey);
    });
    document.getElementById('releases-project-filter')?.addEventListener('change', (e) => {
      this.load(e.target.value || null);
    });
    document.querySelectorAll('.release-issue-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const key = row.dataset.issueKey;
        if (key) {
          openIssueDrawer(key, this.jiraDomain, () => {});
        }
      });
    });
  }

  renderError() {
    return `
      <div class="releases-view">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load releases</h3>
          <p>${escapeHtml(this.error || 'Unknown error')}</p>
          <button class="btn btn-primary retry-btn" id="retry-load-btn">Retry</button>
        </div>
      </div>
    `;
  }
}

export const ReleaseProgressViewStyles = `
  .releases-view {
    padding: 0;
  }
  .releases-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .summary-card-warning {
    border-color: var(--amber, #f0a020);
  }
  .summary-card-warning .summary-value {
    color: var(--amber, #f0a020);
  }
  .releases-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .release-card {
    background: var(--bg-secondary, #1e1e36);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 16px;
    border-left: 4px solid var(--border, #333);
  }
  .release-card.risk-critical {
    border-left-color: #dc3545;
    background: #fff5f5;
  }
  .release-card.risk-high {
    border-left-color: #f0a020;
    background: #fffcf0;
  }
  .release-card.risk-medium {
    border-left-color: #17a2b8;
  }
  .release-card.risk-low {
    border-left-color: #28a745;
  }
  .release-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .release-name {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .release-risk-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 12px;
  }
  .release-risk-badge.risk-critical {
    background: #dc3545;
    color: white;
  }
  .release-risk-badge.risk-high {
    background: #f0a020;
    color: white;
  }
  .release-risk-badge.risk-medium {
    background: #17a2b8;
    color: white;
  }
  .release-risk-badge.risk-low {
    background: #28a745;
    color: white;
  }
  .release-progress-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .progress-track {
    flex: 1;
    height: 10px;
    background: var(--bg, #e9ecef);
    border-radius: 5px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 5px;
    transition: width 0.6s ease;
    min-width: 4px;
  }
  .progress-fill.bar-green { background: #28a745; }
  .progress-fill.bar-amber { background: #f0a020; }
  .progress-fill.bar-red { background: #dc3545; }
  .progress-text {
    font-size: 13px;
    font-weight: 600;
    min-width: 38px;
    text-align: right;
  }
  .release-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 12px;
  }
  .release-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
  }
  .stat-label {
    font-size: 11px;
    color: var(--text-secondary, #6c757d);
  }
  .stat-done .stat-value { color: #28a745; }
  .stat-remaining .stat-value { color: #dc3545; }
  .release-issue-list {
    border-top: 1px solid var(--border, #dee2e6);
    padding-top: 10px;
    max-height: 300px;
    overflow-y: auto;
  }
  .release-issue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    cursor: pointer;
    border-radius: 4px;
    padding: 5px 6px;
    transition: background 0.15s;
  }
  .release-issue-row:hover {
    background: rgba(0,0,0,0.05);
  }
  .release-issue-row.issue-completed {
    opacity: 0.55;
  }
  .issue-key-badge {
    font-family: monospace;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg, #e9ecef);
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .issue-status-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
    white-space: nowrap;
  }
  .issue-status-tag.status-done {
    background: #d4edda;
    color: #155724;
  }
  .issue-status-tag.status-active {
    background: #cce5ff;
    color: #004085;
  }
  .issue-summary-text {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .release-issue-count {
    padding-top: 8px;
    font-size: 12px;
    color: var(--text-secondary, #6c757d);
  }
  .project-filter {
    padding: 6px 10px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    font-size: 13px;
    background: var(--bg, white);
    color: var(--text, #333);
  }
`;
