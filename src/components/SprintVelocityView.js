import { getSprintVelocity, getAllBoards } from '../db/queries.js';
import logger from '../utils/logger.js';

export class SprintVelocityView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.data = null;
    this.isLoading = true;
    this.boardId = null;
    this.boards = [];
    this.animate = true;
  }

  async load(boardId = null) {
    this.boardId = boardId;
    this.isLoading = true;
    this.refresh();
    try {
      this.boards = await getAllBoards();
      this.data = await getSprintVelocity(boardId);
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[Velocity] Failed to load:', error);
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    const container = document.getElementById('velocity-dashboard-container');
    if (container) {
      container.innerHTML = this.render();
      this.bindEvents();
    }
  }

  render() {
    if (this.isLoading) {
      return `<div class="velocity-dashboard" id="velocity-dashboard-container"><div class="loading-board"><div class="spinner"></div><p>Loading sprint velocity...</p></div></div>`;
    }

    if (!this.data || this.data.sprints.length === 0) {
      return this.renderEmpty();
    }

    const { sprints, summary } = this.data;
    const maxTotal = Math.max(...sprints.map(s => s.total), 1);

    return `
      <div class="velocity-dashboard" id="velocity-dashboard-container">
        <div class="velocity-header">
          <div class="velocity-header-left">
            <button class="btn btn-secondary back-btn" title="Back to Board">
              ← Back to Board
            </button>
            <h2>Sprint Velocity Dashboard</h2>
            <select class="velocity-board-filter" id="velocity-board-filter">
              <option value="">All Boards</option>
              ${this.boards.map(b => `
                <option value="${b.id}" ${b.id === this.boardId ? 'selected' : ''}>${this.escapeHtml(b.name)}</option>
              `).join('')}
            </select>
          </div>
          <div class="velocity-summary-cards">
            <div class="summary-card">
              <div class="summary-value">${summary.totalSprints}</div>
              <div class="summary-label">Sprints</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${summary.totalCompleted}/${summary.totalIssues}</div>
              <div class="summary-label">Completed Issues</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${summary.averageVelocity}</div>
              <div class="summary-label">Avg Velocity</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${summary.overallRate}%</div>
              <div class="summary-label">Completion Rate</div>
            </div>
          </div>
        </div>

        <div class="velocity-chart">
          <h3>Completion Trend</h3>
          <div class="bar-chart">
            ${sprints.map(sprint => {
              const totalPct = Math.max(Math.round((sprint.total / maxTotal) * 100), 4);
              return `
                <div class="bar-row ${this.animate ? 'bar-animate' : ''}">
                  <div class="bar-label" title="${this.escapeHtml(sprint.name)}">
                    <span class="bar-sprint-name">${this.escapeHtml(sprint.name)}</span>
                    <span class="bar-sprint-date">${this.formatDate(sprint.start_date)}</span>
                  </div>
                  <div class="bar-track" title="Total: ${sprint.total} issues">
                    <div class="bar-fill bar-total" style="--bar-width: ${totalPct}%">
                      <span class="bar-value">${sprint.total}</span>
                    </div>
                    <div class="bar-fill bar-completed" style="--bar-width: ${totalPct * sprint.completed / sprint.total}%">
                      <span class="bar-value">${sprint.completed}</span>
                    </div>
                  </div>
                  <div class="bar-pct">
                    <span class="pct-value ${sprint.rate >= 80 ? 'pct-good' : sprint.rate >= 50 ? 'pct-ok' : 'pct-low'}">${sprint.rate}%</span>
                  </div>
                </div>
              `;
            }).join('')}
            <div class="bar-legend">
              <span class="legend-item"><span class="legend-color legend-done"></span> Completed</span>
              <span class="legend-item"><span class="legend-color legend-remain"></span> Remaining</span>
            </div>
          </div>
        </div>

        <div class="velocity-sprints">
          <h3>Sprint Breakdown</h3>
          <div class="sprint-grid">
            ${sprints.map(sprint => `
              <div class="sprint-card" data-sprint-id="${sprint.id}">
                <div class="sprint-card-header">
                  <div class="sprint-card-name">${this.escapeHtml(sprint.name)}</div>
                  <div class="sprint-card-date">${this.formatDate(sprint.start_date)} → ${this.formatDate(sprint.end_date)}</div>
                </div>
                <div class="sprint-card-stats">
                  <div class="stat">
                    <div class="stat-value">${sprint.total}</div>
                    <div class="stat-label">Total</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${sprint.completed}</div>
                    <div class="stat-label">Done</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${sprint.rate}%</div>
                    <div class="stat-label">Rate</div>
                  </div>
                </div>
                ${sprint.assignees.length > 0 ? `
                  <div class="sprint-card-assignees">
                    ${sprint.assignees.map(a => `
                      <div class="assignee-row" title="${this.escapeHtml(a.name)}: ${a.completed}/${a.total} done">
                        <span class="assignee-name">${this.escapeHtml(a.name)}</span>
                        <span class="assignee-bar" style="--width: ${a.total > 0 ? Math.round(a.completed / a.total * 100) : 0}%"></span>
                        <span class="assignee-count">${a.completed}/${a.total}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    return `
      <div class="velocity-dashboard">
        <div class="velocity-header">
          <button class="btn btn-secondary back-btn" onclick="switchToBoardView()" title="Back to Board">
            ← Back to Board
          </button>
          <h2>Sprint Velocity Dashboard</h2>
          ${this.boards.length > 0 ? `
            <select class="velocity-board-filter" id="velocity-board-filter">
              <option value="">All Boards</option>
              ${this.boards.map(b => `
                <option value="${b.id}">${this.escapeHtml(b.name)}</option>
              `).join('')}
            </select>
          ` : ''}
        </div>
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h3>No sprint data yet</h3>
          <p>Sync your Jira data to see sprint velocity and completion trends.</p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.querySelector('.back-btn')?.addEventListener('click', () => {
      this.onBack?.();
    });

    const boardFilter = document.getElementById('velocity-board-filter');
    boardFilter?.addEventListener('change', (e) => {
      const val = e.target.value;
      this.load(val ? parseInt(val) : null);
    });
  }

  formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export const SprintVelocityViewStyles = `
  .velocity-dashboard {
    max-width: 1400px;
    margin: 0 auto;
  }

  .velocity-header {
    margin-bottom: 32px;
  }

  .velocity-header .back-btn {
    margin-bottom: 12px;
    font-size: 13px;
  }

  .velocity-header h2 {
    margin: 0 0 16px 0;
    font-size: 20px;
    font-weight: 600;
  }

  .velocity-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .velocity-board-filter {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }

  .velocity-summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .summary-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }

  .summary-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
  }

  .summary-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .velocity-chart {
    margin-bottom: 32px;
  }

  .velocity-chart h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .bar-chart {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    min-height: 32px;
  }

  .bar-row:last-child {
    margin-bottom: 0;
  }

  .bar-label {
    width: 180px;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bar-sprint-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-sprint-date {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .bar-track {
    flex: 1;
    height: 24px;
    background: var(--hover);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }

  .bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding-left: 8px;
    transition: width 0.6s ease;
  }

  .bar-animate .bar-fill {
    animation: barGrow 0.6s ease-out forwards;
  }

  @keyframes barGrow {
    from { width: 0; }
    to { width: var(--bar-width); }
  }

  .bar-total {
    width: var(--bar-width);
    background: var(--hover);
    z-index: 1;
  }

  .bar-completed {
    width: var(--bar-width);
    background: var(--accent);
    opacity: 0.75;
    z-index: 2;
  }

  .bar-value {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .bar-completed .bar-value {
    color: white;
  }

  .bar-pct {
    width: 48px;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .pct-good { color: #22c55e; }
  .pct-ok { color: #eab308; }
  .pct-low { color: #ef4444; }

  .bar-legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .legend-done {
    background: var(--accent);
    opacity: 0.75;
  }

  .legend-remain {
    background: var(--hover);
  }

  .velocity-sprints h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .sprint-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .sprint-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    transition: border-color 0.2s;
  }

  .sprint-card:hover {
    border-color: var(--accent);
  }

  .sprint-card-header {
    margin-bottom: 12px;
  }

  .sprint-card-name {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .sprint-card-date {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .sprint-card-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent);
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .sprint-card-assignees {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .assignee-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .assignee-row:last-child {
    margin-bottom: 0;
  }

  .assignee-name {
    width: 100px;
    min-width: 100px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .assignee-bar {
    flex: 1;
    height: 6px;
    background: var(--hover);
    border-radius: 3px;
    position: relative;
    overflow: hidden;
  }

  .assignee-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: var(--width);
    background: var(--accent);
    border-radius: 3px;
  }

  .assignee-count {
    font-size: 11px;
    color: var(--text-secondary);
    min-width: 36px;
    text-align: right;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .empty-state h3 {
    font-size: 18px;
    margin-bottom: 8px;
  }

  .empty-state p {
    color: var(--text-secondary);
    font-size: 14px;
  }
`;