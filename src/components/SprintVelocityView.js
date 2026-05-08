import { getSprintVelocity, getAllBoards, getSprintBurndown } from '../db/queries.js';
import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class SprintVelocityView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.data = null;
    this.isLoading = true;
    this.error = null;
    this.boardId = null;
    this.boards = [];
    this.animate = true;
    this.burndowns = new Map();
    this.expandedSprints = new Set();
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
      this.error = error.message;
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
    if (this.error) return this.renderError();

    if (this.isLoading) {
      return `<div class="velocity-dashboard" id="velocity-dashboard-container"><div class="loading-board"><div class="spinner"></div><p>Loading sprint velocity...</p></div></div>`;
    }

    if (!this.data || this.data.sprints.length === 0) {
      return this.renderEmpty();
    }

    const { sprints, summary } = this.data;
    const recentSprints = sprints.slice(-5);
    const maxTotal = Math.max(...recentSprints.map(s => s.total), 1);

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
                <option value="${b.id}" ${b.id === this.boardId ? 'selected' : ''}>${escapeHtml(b.name)}</option>
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
            ${recentSprints.map(sprint => {
              const totalPct = Math.max(Math.round((sprint.total / maxTotal) * 100), 4);
              return `
                <div class="bar-row ${this.animate ? 'bar-animate' : ''}">
                  <div class="bar-label" title="${escapeHtml(sprint.name)}">
                    <span class="bar-sprint-name">${escapeHtml(sprint.name)}</span>
                    <span class="bar-sprint-date">${formatDate(sprint.start_date)}</span>
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
                  <div class="sprint-card-name">${escapeHtml(sprint.name)}</div>
                  <div class="sprint-card-date">${formatDate(sprint.start_date)} → ${formatDate(sprint.end_date)}</div>
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
                      <div class="assignee-row" title="${escapeHtml(a.name)}: ${a.completed}/${a.total} done">
                        <span class="assignee-name">${escapeHtml(a.name)}</span>
                        <span class="assignee-bar" style="--width: ${a.total > 0 ? Math.round(a.completed / a.total * 100) : 0}%"></span>
                        <span class="assignee-count">${a.completed}/${a.total}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${sprint.state !== 'future' ? `
                  <div class="sprint-card-burndown">
                    ${this.expandedSprints.has(sprint.id) ? this.renderBurndownChart(sprint.id) : `
                      <button class="burndown-toggle" data-sprint-id="${sprint.id}">
                        📈 Show Burndown
                      </button>
                    `}
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
                <option value="${b.id}">${escapeHtml(b.name)}</option>
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
    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      this.error = null;
      this.load(this.boardId);
    });

    document.querySelector('.back-btn')?.addEventListener('click', () => {
      this.onBack?.();
    });

    const boardFilter = document.getElementById('velocity-board-filter');
    boardFilter?.addEventListener('change', (e) => {
      const val = e.target.value;
      this.load(val ? parseInt(val) : null);
    });

    document.querySelectorAll('.burndown-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const sprintId = parseInt(btn.dataset.sprintId);
        this.toggleBurndown(sprintId);
      });
    });
  }

  async toggleBurndown(sprintId) {
    if (this.expandedSprints.has(sprintId)) {
      this.expandedSprints.delete(sprintId);
      this.refresh();
      return;
    }

    this.expandedSprints.add(sprintId);
    this.refresh();

    if (!this.burndowns.has(sprintId)) {
      try {
        const data = await getSprintBurndown(sprintId);
        this.burndowns.set(sprintId, data);
        this.refresh();
      } catch (e) {
        this.burndowns.set(sprintId, { error: 'Failed to load burndown' });
        this.refresh();
      }
    }
  }

  renderBurndownChart(sprintId) {
    const data = this.burndowns.get(sprintId);

    if (!data) {
      return `
        <div class="burndown-chart burndown-loading">
          <div class="spinner mini-spinner"></div>
          <span>Loading burndown...</span>
        </div>
      `;
    }

    if (data.error) {
      return `
        <div class="burndown-chart">
          <p class="burndown-error">${escapeHtml(data.error)}</p>
          <button class="burndown-toggle" data-sprint-id="${sprintId}">📈 Hide Burndown</button>
        </div>
      `;
    }

    const { dailyRemaining, idealLine, totalIssues, sprint } = data;
    if (!dailyRemaining.length) {
      return `
        <div class="burndown-chart">
          <p class="burndown-error">Sprint has invalid or missing dates</p>
          <button class="burndown-toggle" data-sprint-id="${sprintId}">📈 Hide Burndown</button>
        </div>
      `;
    }

    const maxVal = totalIssues || 1;
    const chartWidth = 400;
    const chartHeight = 150;
    const padLeft = 30;
    const padRight = 10;
    const padTop = 10;
    const padBottom = 25;
    const plotWidth = chartWidth - padLeft - padRight;
    const plotHeight = chartHeight - padTop - padBottom;

    const scaleX = (i) => padLeft + (i / (dailyRemaining.length - 1 || 1)) * plotWidth;
    const scaleY = (v) => padTop + (1 - v / maxVal) * plotHeight;

    const actualPoints = dailyRemaining.map((d, i) =>
      `${scaleX(i)},${scaleY(d.remaining)}`
    ).join(' ');

    const idealPoints = idealLine.map((d, i) =>
      `${scaleX(i)},${scaleY(d.remaining)}`
    ).join(' ');

    const yTicks = [0, Math.round(maxVal / 2), maxVal];
    const xTicks = dailyRemaining.filter((_, i) => {
      const count = dailyRemaining.length;
      if (count <= 7) return true;
      return i % Math.ceil(count / 7) === 0 || i === count - 1;
    });

    return `
      <div class="burndown-chart">
        <div class="burndown-chart-header">
          <span class="burndown-title">Burndown: ${escapeHtml(sprint.name)}</span>
          <button class="burndown-toggle" data-sprint-id="${sprintId}">📈 Hide Burndown</button>
        </div>
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="burndown-svg">
          <!-- Y axis -->
          ${yTicks.map(v => `
            <text x="${padLeft - 4}" y="${scaleY(v) + 4}" text-anchor="end" class="burndown-tick">${v}</text>
          `).join('')}
          <!-- X axis -->
          ${xTicks.map(d => `
            <text x="${scaleX(dailyRemaining.indexOf(d))}" y="${chartHeight - 6}" text-anchor="middle" class="burndown-tick">${d.date.slice(5)}</text>
          `).join('')}
          <!-- Ideal line -->
          <polyline points="${idealPoints}" class="burndown-line burndown-ideal" />
          <!-- Actual line -->
          <polyline points="${actualPoints}" class="burndown-line burndown-actual" />
          <!-- Start point -->
          <circle cx="${scaleX(0)}" cy="${scaleY(dailyRemaining[0]?.remaining ?? 0)}" r="3" class="burndown-dot" />
          <!-- End point -->
          <circle cx="${scaleX(dailyRemaining.length - 1)}" cy="${scaleY(dailyRemaining[dailyRemaining.length - 1]?.remaining ?? 0)}" r="3" class="burndown-dot" />
        </svg>
        <div class="burndown-legend">
          <span class="burndown-legend-item burndown-legend-ideal">--- Ideal</span>
          <span class="burndown-legend-item burndown-legend-actual">— Actual</span>
        </div>
      </div>
    `;
  }

  renderError() {
    return `
      <div class="velocity-dashboard">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load sprint data</h3>
          <p>${escapeHtml(this.error || 'Unknown error')}</p>
          <button class="btn btn-primary retry-btn" id="retry-load-btn">Retry</button>
        </div>
      </div>
    `;
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
    color: var(--primary);
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
    margin-top: 32px;
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
    overflow: hidden;
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
    width: 140px;
    min-width: 140px;
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
    background: var(--bg);
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
    width: var(--bar-width, 0%);
  }

  .bar-total {
    background: var(--border);
    z-index: 1;
  }

  .bar-completed {
    background: var(--primary);
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
    background: var(--primary);
    opacity: 0.75;
  }

  .legend-remain {
    background: var(--border);
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
    border-color: var(--primary);
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
    color: var(--primary);
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
    background: var(--primary);
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

  /* Burndown Chart */
  .sprint-card-burndown {
    border-top: 1px solid var(--border);
    padding-top: 12px;
    margin-top: 12px;
  }

  .burndown-toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .burndown-toggle:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .burndown-chart {
    margin-top: 8px;
  }

  .burndown-chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .burndown-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .burndown-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .mini-spinner {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  .burndown-error {
    font-size: 11px;
    color: var(--text-secondary);
    margin: 0 0 6px 0;
  }

  .burndown-svg {
    width: 100%;
    height: auto;
    background: var(--bg, #0f0f23);
    border-radius: 6px;
  }

  .burndown-tick {
    font-size: 8px;
    fill: var(--text-secondary);
  }

  .burndown-line {
    fill: none;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .burndown-ideal {
    stroke: var(--text-secondary);
    stroke-dasharray: 4, 4;
    opacity: 0.5;
  }

  .burndown-actual {
    stroke: var(--primary, #6366f1);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .burndown-dot {
    fill: var(--primary, #6366f1);
  }

  .burndown-legend {
    display: flex;
    gap: 16px;
    margin-top: 4px;
    font-size: 10px;
  }

  .burndown-legend-item {
    color: var(--text-secondary);
  }

  .burndown-legend-ideal {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .burndown-legend-actual {
    color: var(--primary, #6366f1);
    font-weight: 500;
  }
`;