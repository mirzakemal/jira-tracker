import { getIssueAging, getAllBoards, getAllSprints } from '../db/queries.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';
import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class IssueAgingView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.issues = null;
    this.isLoading = true;
    this.boardId = null;
    this.sprintId = null;
    this.boards = [];
    this.sprints = [];
    this.sortField = 'daysInStatus';
    this.sortDir = 'desc';
  }

  async load(boardId = null, sprintId = null) {
    this.boardId = boardId;
    this.sprintId = sprintId;
    this.isLoading = true;
    this.refresh();
    try {
      const [issues, boards, sprints] = await Promise.all([
        getIssueAging({ boardId, sprintId }),
        getAllBoards(),
        getAllSprints(boardId)
      ]);
      this.issues = issues;
      this.boards = boards;
      this.sprints = sprints;
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[Aging] Failed to load:', error);
      this.error = error.message;
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    const container = document.getElementById('aging-view');
    if (container) {
      container.innerHTML = this.render();
      this.bindEvents();
    }
  }

  render() {
    if (this.error) return this.renderError();

    if (this.isLoading) {
      return `<div class="aging-view" id="aging-view"><div class="loading-board"><div class="spinner"></div><p>Loading issue aging report...</p></div></div>`;
    }

    if (!this.issues || this.issues.length === 0) {
      return this.renderEmpty();
    }

    const stale = this.issues.filter(i => i.daysInStatus !== null && i.daysInStatus > 14).length;
    const total = this.issues.length;
    const boardsHtml = this.boards.map(b => `<option value="${b.id}"${b.id === this.boardId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
    const sprintsHtml = this.sprints.map(s => `<option value="${s.id}"${s.id === this.sprintId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    const sortIcon = (field) => {
      if (this.sortField !== field) return '<span class="sort-arrow neutral">↕</span>';
      return this.sortDir === 'asc' ? '<span class="sort-arrow asc">↑</span>' : '<span class="sort-arrow desc">↓</span>';
    };

    return `
      <div class="aging-view" id="aging-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="aging-back-btn">← Back to Board</button>
            <h2>Issue Aging</h2>
          </div>
          <div class="workload-filters">
            <select id="aging-board-filter">
              <option value="">All Boards</option>
              ${boardsHtml}
            </select>
            <select id="aging-sprint-filter">
              <option value="">All Sprints</option>
              ${sprintsHtml}
            </select>
          </div>
        </div>

        <div class="workload-summary">
          <div class="summary-card">
            <div class="summary-value">${total}</div>
            <div class="summary-label">Total Issues</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${stale}</div>
            <div class="summary-label">Stale (>14 days)</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${total > 0 ? Math.round((stale / total) * 100) : 0}%</div>
            <div class="summary-label">Stale Rate</div>
          </div>
        </div>

        <div class="aging-table-container">
          <table class="aging-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Summary</th>
                <th>Status</th>
                <th class="sortable" data-column="daysInStatus">Days in Status ${sortIcon('daysInStatus')}</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${this.issues.map(issue => {
                const days = issue.daysInStatus;
                let stalenessClass = '';
                if (days === null) stalenessClass = 'aging-unknown';
                else if (days > 30) stalenessClass = 'aging-critical';
                else if (days > 14) stalenessClass = 'aging-stale';
                else if (days > 7) stalenessClass = 'aging-warning';
                else stalenessClass = 'aging-fresh';

                return `
                  <tr class="aging-row ${stalenessClass}" data-issue-key="${issue.key}">
                    <td class="aging-key">${issue.key}</td>
                    <td class="aging-summary">${escapeHtml(issue.summary || '')}</td>
                    <td>${escapeHtml(issue.status || '')}</td>
                    <td class="aging-days">
                      ${days !== null ? days : '—'}
                    </td>
                    <td>${escapeHtml(issue.assignee_name || 'Unassigned')}</td>
                    <td>${escapeHtml(issue.priority || '')}</td>
                    <td class="aging-date">${formatDate(issue.updated_at)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderEmpty() {
    const boardsHtml = this.boards.map(b => `<option value="${b.id}"${b.id === this.boardId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
    const sprintsHtml = this.sprints.map(s => `<option value="${s.id}"${s.id === this.sprintId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    return `
      <div class="aging-view" id="aging-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="aging-back-btn">← Back to Board</button>
            <h2>Issue Aging</h2>
          </div>
          <div class="workload-filters">
            <select id="aging-board-filter">
              <option value="">All Boards</option>
              ${boardsHtml}
            </select>
            <select id="aging-sprint-filter">
              <option value="">All Sprints</option>
              ${sprintsHtml}
            </select>
          </div>
        </div>
        <div class="loading-board">
          <p>No issues found. Try syncing data or adjusting the board/sprint filter.</p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('aging-back-btn')?.addEventListener('click', () => {
      this.onBack?.();
    });

    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      this.error = null;
      this.load(this.boardId, this.sprintId);
    });

    document.getElementById('aging-board-filter')?.addEventListener('change', (e) => {
      this.load(e.target.value ? Number(e.target.value) : null, this.sprintId);
    });

    document.getElementById('aging-sprint-filter')?.addEventListener('change', (e) => {
      this.load(this.boardId, e.target.value ? Number(e.target.value) : null);
    });

    document.querySelectorAll('.aging-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const key = row.dataset.issueKey;
        if (key) openIssueDrawer(key, this.jiraDomain, () => {});
      });
    });

    document.querySelectorAll('.aging-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.column;
        if (this.sortField === field) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = field;
          this.sortDir = 'desc';
        }
        this.issues.sort((a, b) => {
          const aVal = a[field] ?? '';
          const bVal = b[field] ?? '';
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return this.sortDir === 'asc' ? cmp : -cmp;
        });
        this.refresh();
      });
    });
  }

  renderError() {
    return `
      <div class="aging-view">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load aging report</h3>
          <p>${escapeHtml(this.error || 'Unknown error')}</p>
          <button class="btn btn-primary retry-btn" id="retry-load-btn">Retry</button>
        </div>
      </div>
    `;
  }
}

export const IssueAgingViewStyles = `
.aging-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.aging-table-container {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.aging-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.aging-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}
.aging-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.aging-row {
  cursor: pointer;
  transition: background 0.1s;
}
.aging-row:hover {
  background: var(--hover);
}
.aging-key {
  font-family: monospace;
  font-weight: 600;
  color: var(--link);
}
.aging-summary {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aging-days {
  font-weight: 700;
  text-align: center;
  min-width: 80px;
}
.aging-critical .aging-days {
  color: #e74c3c;
}
.aging-stale .aging-days {
  color: #f39c12;
}
.aging-warning .aging-days {
  color: #2ecc71;
}
.aging-fresh .aging-days {
  color: #3498db;
}
.aging-critical {
  background: rgba(231, 76, 60, 0.06);
}
.aging-stale {
  background: rgba(243, 156, 18, 0.05);
}
.aging-date {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}
.sort-arrow {
  font-size: 11px;
  margin-left: 4px;
}
.sort-arrow.neutral { color: var(--text-muted); }
.sort-arrow.asc { color: var(--link); }
.sort-arrow.desc { color: var(--link); }
`;
