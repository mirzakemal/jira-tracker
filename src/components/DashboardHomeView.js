/**
 * Dashboard Home View Component
 * Aggregate dashboard: velocity trend, at-risk releases, aging outliers, workload imbalance
 */

import { getDashboardData } from '../db/queries.js';
import { escapeHtml } from '../utils/html.js';
import logger from '../utils/logger.js';

export class DashboardHomeView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.isLoading = true;
    this.error = null;
    this.data = null;
    this._eventsBound = false;
    this._releasesExpanded = false;
  }

  /**
   * Load dashboard data
   */
  async load() {
    this.isLoading = true;
    this.error = null;
    this.refresh();

    try {
      this.data = await getDashboardData();
      if (this._destroyed) return;
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[Dashboard] load failed:', error);
      if (this._destroyed) return;
      this.error = error;
      this.isLoading = false;
      this.refresh();
    }
  }

  /**
   * Re-render the view into its container
   */
  refresh() {
    const container = document.getElementById('dashboard-container');
    if (container) {
      container.innerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Main render
   */
  render() {
    if (this.error) return this.renderError();
    if (this.isLoading) return this.renderLoading();
    if (!this.data) return this.renderEmpty();
    return this.renderDashboard();
  }

  renderLoading() {
    return `
      <div class="dashboard-container" id="dashboard-container">
        <div class="dashboard-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">← Back to Board</button>
            <h2>Dashboard</h2>
          </div>
        </div>
        <div class="loading-container">
          <div class="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    `;
  }

  renderError() {
    const message = escapeHtml((this.error && this.error.message) || 'Failed to load dashboard data');
    return `
      <div class="dashboard-container" id="dashboard-container">
        <div class="dashboard-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">← Back to Board</button>
            <h2>Dashboard</h2>
          </div>
        </div>
        <div class="empty-state">
          <p style="color: var(--danger);">Error: ${message}</p>
          <button class="retry-btn" id="retry-load-btn">Retry</button>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return `
      <div class="dashboard-container" id="dashboard-container">
        <div class="dashboard-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">← Back to Board</button>
            <h2>Dashboard</h2>
          </div>
        </div>
        <div class="empty-state">
          <p>No dashboard data available yet. Sync data and complete sprints to populate.</p>
        </div>
      </div>
    `;
  }

  renderDashboard() {
    const { velocityTrend, atRiskReleases, agingOutliers, workloadImbalance } = this.data;

    return `
      <div class="dashboard-container" id="dashboard-container">
        <div class="dashboard-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">← Back to Board</button>
            <h2>Dashboard</h2>
          </div>
        </div>
        <div class="dashboard-grid">
          ${this.renderVelocityCard(velocityTrend)}
          ${this.renderRiskCard(atRiskReleases)}
          ${this.renderAgingCard(agingOutliers)}
          ${this.renderWorkloadCard(workloadImbalance)}
        </div>
      </div>
    `;
  }

  // --- Card Renderers ---

  renderVelocityCard(trend) {
    const hasData = trend && trend.length > 0;
    const maxVel = hasData ? Math.max(...trend.map(s => s.velocity), 1) : 1;

    return `
      <div class="dashboard-card">
        <h3 class="card-title">📈 Sprint Velocity Trend</h3>
        ${!hasData ? '<p class="card-empty">No completed sprints yet.</p>' : `
          <div class="velocity-chart">
            ${trend.map(s => {
              const barH = Math.max((s.velocity / maxVel) * 100, 2);
              return `
                <div class="velocity-bar-group">
                  <div class="velocity-bar-wrapper">
                    <div class="velocity-bar" style="height:${barH}%" title="${s.name}: ${s.velocity} completed of ${s.total} issues">
                      <span class="velocity-bar-label">${s.velocity}</span>
                    </div>
                  </div>
                  <span class="velocity-sprint-label">${escapeHtml(s.name || '')}</span>
                </div>
              `;
            }).join('')}
          </div>
          <div class="velocity-summary">
            <span class="card-stat">Avg: ${Math.round(trend.reduce((sum, s) => sum + s.velocity, 0) / trend.length)} issues/sprint</span>
          </div>
        `}
      </div>
    `;
  }

  renderRiskCard(releases) {
    const hasData = releases && releases.length > 0;
    const riskColors = { high: 'var(--danger)', medium: '#f59e0b', low: 'var(--success, #22c55e)' };
    const displayLimit = 3;
    const needsToggle = hasData && releases.length > displayLimit;
    const displayReleases = needsToggle && !this._releasesExpanded ? releases.slice(0, displayLimit) : releases;

    const renderItem = r => {
      const riskColor = riskColors[r.risk] || 'var(--text-secondary)';
      const riskLabel = { high: '🔴', medium: '🟡', low: '🟢' }[r.risk] || '';
      return `
        <div class="risk-item">
          <div class="risk-item-header">
            <span class="risk-name">${escapeHtml(r.name)}</span>
            <span class="risk-badge" style="color:${riskColor}">${riskLabel} ${r.risk}</span>
          </div>
          <div class="risk-bar-track">
            <div class="risk-bar-fill" style="width:${r.progress}%"></div>
          </div>
          <div class="risk-item-stats">
            <span>${r.completed}/${r.total} done</span>
            ${r.targetDate ? `<span>Target: ${r.targetDate}</span>` : ''}
          </div>
        </div>
      `;
    };

    return `
      <div class="dashboard-card">
        <h3 class="card-title">⚠️ At-Risk Releases</h3>
        ${!hasData ? '<p class="card-empty">No versions with issues.</p>' : `
          <div class="risk-list">
            ${displayReleases.map(renderItem).join('')}
          </div>
          ${needsToggle ? `
            <button class="risk-toggle-btn" id="releases-toggle-btn">
              ${this._releasesExpanded ? 'Show less ▲' : `Show all ${releases.length} ▸`}
            </button>
          ` : ''}
        `}
      </div>
    `;
  }

  renderAgingCard(outliers) {
    const hasData = outliers && outliers.length > 0;

    return `
      <div class="dashboard-card">
        <h3 class="card-title">🐌 Aging Outliers</h3>
        ${!hasData ? '<p class="card-empty">No stuck issues found.</p>' : `
          <div class="aging-list">
            ${outliers.map(i => `
              <div class="aging-item">
                <div class="aging-item-main">
                  <a class="issue-link" href="#" data-issue-key="${escapeHtml(i.key)}">${escapeHtml(i.key)}</a>
                  <span class="aging-summary" title="${escapeHtml(i.summary)}">${escapeHtml(i.summary)}</span>
                </div>
                <div class="aging-item-meta">
                  <span class="status-badge">${escapeHtml(i.status || '')}</span>
                  <span class="aging-days ${i.daysInStatus > 14 ? 'aging-critical' : ''}">${i.daysInStatus}d in status</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  renderWorkloadCard(imbalance) {
    const hasData = imbalance && imbalance.people.length > 0;
    const maxCount = hasData ? Math.max(...imbalance.people.map(p => p.issueCount), 1) : 1;

    return `
      <div class="dashboard-card">
        <h3 class="card-title">👥 Workload Distribution</h3>
        ${!hasData ? '<p class="card-empty">No active assignees.</p>' : `
          <div class="workload-list">
            ${imbalance.people.map(p => {
              const barW = Math.max((p.issueCount / maxCount) * 100, 2);
              const isOverAvg = p.issueCount > imbalance.average * 1.3;

              return `
                <div class="workload-item">
                  <span class="workload-name">${escapeHtml(p.name || p.id)}</span>
                  <div class="workload-bar-track">
                    <div class="workload-bar-fill ${isOverAvg ? 'workload-over' : ''}" style="width:${barW}%">${p.issueCount}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="workload-summary">
            <span class="card-stat">Total active: ${imbalance.totalActive}</span>
            <span class="card-stat">Avg: ${imbalance.average}/person</span>
          </div>
        `}
      </div>
    `;
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.getElementById('back-btn')?.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      this.load();
    });

    document.getElementById('releases-toggle-btn')?.addEventListener('click', () => {
      this._releasesExpanded = !this._releasesExpanded;
      this.render();
      this.bindEvents();
    });

    // Issue link clicks for aging outliers
    document.querySelectorAll('[data-issue-key]')?.forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const key = el.getAttribute('data-issue-key');
        if (key && this.jiraDomain) {
          window.open(`https://${this.jiraDomain}/browse/${key}`, '_blank');
        }
      });
    });
  }

  /**
   * Clean up resources
   */
  destroy() {
    this._destroyed = true;
    this._eventsBound = false;
  }
}

export const DashboardHomeViewStyles = `
  .dashboard-container {
    max-width: 1600px;
    margin: 0 auto;
  }

  .dashboard-header {
    margin-bottom: 24px;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  @media (max-width: 900px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }

  .dashboard-card {
    background: var(--surface);
    border-radius: 10px;
    padding: 20px;
    box-shadow: var(--shadow);
  }

  .card-title {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .card-empty {
    color: var(--text-secondary);
    font-size: 14px;
    text-align: center;
    padding: 20px 0;
  }

  .card-stat {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Velocity Chart */
  .velocity-chart {
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    height: 160px;
    gap: 12px;
    padding: 0 8px;
  }

  .velocity-bar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    height: 100%;
    justify-content: flex-end;
  }

  .velocity-bar-wrapper {
    width: 100%;
    height: 130px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .velocity-bar {
    width: 70%;
    background: var(--accent);
    border-radius: 4px 4px 0 0;
    position: relative;
    min-height: 4px;
    transition: height 0.3s ease;
  }

  .velocity-bar-label {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .velocity-sprint-label {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 6px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .velocity-summary {
    margin-top: 12px;
    text-align: center;
  }

  /* Risk List */
  .risk-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .risk-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .risk-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .risk-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .risk-badge {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .risk-bar-track {
    height: 8px;
    background: var(--hover-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .risk-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .risk-item-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* Aging List */
  .aging-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .aging-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: var(--hover);
    border-radius: 6px;
  }

  .aging-item-main {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .aging-summary {
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aging-item-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .aging-days {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .aging-days.aging-critical {
    color: var(--danger);
    font-weight: 600;
  }

  /* Workload List */
  .workload-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .workload-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .workload-name {
    font-size: 13px;
    color: var(--text);
    width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .workload-bar-track {
    flex: 1;
    height: 22px;
    background: var(--hover-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .workload-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
    font-size: 12px;
    font-weight: 600;
    color: white;
    min-width: 30px;
  }

  .workload-bar-fill.workload-over {
    background: #f59e0b;
  }

  .workload-summary {
    margin-top: 12px;
    display: flex;
    gap: 20px;
    justify-content: center;
  }

  .retry-btn {
    margin-top: 12px;
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
  }

  .retry-btn:hover {
    background: var(--hover);
  }
`;
