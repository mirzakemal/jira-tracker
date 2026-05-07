import logger from '../utils/logger.js';

export class TeamWorkloadView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.data = null;
    this.isLoading = true;
    this.boardId = null;
    this.sprintId = null;
    this.boards = [];
    this.sprints = [];
  }

  async load(boardId = null, sprintId = null) {
    this.boardId = boardId;
    this.sprintId = sprintId;
    this.isLoading = true;
    this.refresh();
    try {
      const { getTeamWorkload, getAllBoards, getAllSprints } = await import('../db/queries.js');
      const [data, boards, sprints] = await Promise.all([
        getTeamWorkload({ boardId: this.boardId, sprintId: this.sprintId }),
        getAllBoards(),
        getAllSprints()
      ]);
      this.data = data;
      this.boards = boards;
      this.sprints = sprints;
      this.isLoading = false;
      this.refresh();
    } catch (error) {
      logger.error('[Workload] Failed to load:', error);
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    const el = document.getElementById('workload-view');
    if (el) {
      el.outerHTML = this.render();
      this.bindEvents();
    }
  }

  render() {
    if (this.isLoading) {
      return `
        <div class="workload-view" id="workload-view">
          <div class="loading-board"><div class="spinner"></div><p>Loading team workload...</p></div>
        </div>`;
    }

    const { people, statuses, totalIssues } = this.data || { people: [], statuses: [], totalIssues: 0 };
    const totalPeople = people.length;
    const avgPerPerson = totalPeople > 0 ? Math.round(totalIssues / totalPeople) : 0;
    const maxTotal = Math.max(...people.map(p => p.total), 1);
    const maxCellCount = Math.max(...statuses.map(s => {
      let max = 0;
      people.forEach(p => {
        const cell = p.statuses.find(sc => sc.status === s);
        if (cell && cell.count > max) max = cell.count;
      });
      return max;
    }), 1);

    if (people.length === 0) {
      return `
        <div class="workload-view" id="workload-view">
          <div class="view-header">
            <div class="view-header-left">
              <button class="btn btn-secondary back-btn">← Back to Board</button>
              <h2>Team Workload</h2>
            </div>
          </div>
          <div class="loading-board">
            <p>No issues found. Sync your data and select a board/sprint with active issues.</p>
            ${this.renderFilters()}
          </div>
        </div>`;
    }

    return `
      <div class="workload-view" id="workload-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="btn btn-secondary back-btn">← Back to Board</button>
            <h2>Team Workload</h2>
          </div>
          ${this.renderFilters()}
        </div>
        <div class="workload-summary">
          <div class="summary-card">
            <div class="summary-value">${totalPeople}</div>
            <div class="summary-label">Team Members</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${totalIssues}</div>
            <div class="summary-label">Total Issues</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${avgPerPerson}</div>
            <div class="summary-label">Avg / Person</div>
          </div>
        </div>
        <div class="workload-heatmap-container">
          <div class="workload-heatmap">
            <table class="heatmap-table">
              <thead>
                <tr>
                  <th class="heatmap-person-header">Team Member</th>
                  <th class="heatmap-total-header">Total</th>
                  ${statuses.map(s => `<th class="heatmap-status-header" title="${this.escapeHtml(s)}">${this.escapeHtml(s.length > 12 ? s.substring(0, 12) + '…' : s)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${people.map(person => `
                  <tr>
                    <td class="heatmap-person">
                      <div class="person-info">
                        <span class="person-name">${this.escapeHtml(person.name)}</span>
                        <div class="person-load-bar">
                          <div class="person-load-fill" style="width: ${Math.min(person.total / maxTotal * 100, 100)}%"></div>
                        </div>
                      </div>
                    </td>
                    <td class="heatmap-total"><strong>${person.total}</strong></td>
                    ${statuses.map(status => {
                      const cell = person.statuses.find(sc => sc.status === status);
                      const count = cell ? cell.count : 0;
                      const intensity = count > 0 ? Math.max(5, Math.min(count / maxCellCount * 100, 100)) : 0;
                      const intensityClass = count >= 8 ? 'intensity-high' : count >= 5 ? 'intensity-medium' : '';
                      const popupId = `workload-popup`;
                      return `
                        <td class="heatmap-cell ${count > 0 ? 'has-issues ' + intensityClass : ''}"
                            style="--intensity: ${intensity}%"
                            data-person="${this.escapeHtml(person.id)}"
                            data-status="${this.escapeHtml(status)}"
                            data-count="${count}"
                            aria-label="${count} issues in ${status} for ${person.name}">
                          ${count > 0 ? `<span class="cell-count">${count}</span>` : '<span class="cell-empty">-</span>'}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="workload-popup" id="workload-popup" style="display: none;">
          <div class="popup-header">
            <span id="popup-title"></span>
            <button class="popup-close" id="popup-close" aria-label="Close">&times;</button>
          </div>
          <div class="popup-issues" id="popup-issues"></div>
        </div>
      </div>`;
  }

  renderFilters() {
    return `
      <div class="workload-filters">
        <select id="workload-board-filter" class="board-select" aria-label="Board">
          <option value="">All Boards</option>
          ${this.boards.map(b => `<option value="${b.id}" ${String(this.boardId) === String(b.id) ? 'selected' : ''}>${this.escapeHtml(b.name)}</option>`).join('')}
        </select>
        <select id="workload-sprint-filter" class="board-select" aria-label="Sprint">
          <option value="">All Sprints</option>
          ${this.sprints.map(s => `<option value="${s.id}" ${String(this.sprintId) === String(s.id) ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>`;
  }

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.querySelector('.back-btn')?.addEventListener('click', () => {
      this.onBack?.();
    });

    document.getElementById('workload-board-filter')?.addEventListener('change', (e) => {
      this.load(e.target.value ? Number(e.target.value) : null, this.sprintId);
    });
    document.getElementById('workload-sprint-filter')?.addEventListener('change', (e) => {
      this.load(this.boardId, e.target.value ? Number(e.target.value) : null);
    });

    document.querySelectorAll('.heatmap-cell.has-issues').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const personId = cell.dataset.person;
        const status = cell.dataset.status;
        if (!personId || !status || !this.data) return;

        const person = this.data.people.find(p => p.id === personId);
        if (!person) return;
        const statusData = person.statuses.find(s => s.status === status);
        if (!statusData) return;

        this.showPopup(person, statusData);
      });
    });

    document.getElementById('popup-close')?.addEventListener('click', () => {
      this.hidePopup();
    });

    const popup = document.getElementById('workload-popup');
    popup?.addEventListener('click', (e) => {
      const link = e.target.closest('.popup-issue-key');
      if (link) {
        e.preventDefault();
        const key = link.dataset.issueKey;
        if (key) {
          import('./IssueDetailDrawer.js').then(({ openIssueDrawer }) => {
            openIssueDrawer(key, this.jiraDomain, () => {});
          });
        }
      }
    });

    if (this._boundDocClick) {
      document.removeEventListener('click', this._boundDocClick);
    }
    this._boundDocClick = (e) => {
      if (!e.target.closest('.heatmap-cell') && !e.target.closest('#workload-popup')) {
        this.hidePopup();
      }
    };
    document.addEventListener('click', this._boundDocClick);
  }

  showPopup(person, statusData) {
    const popup = document.getElementById('workload-popup');
    const title = document.getElementById('popup-title');
    const issues = document.getElementById('popup-issues');
    if (!popup || !title || !issues) return;

    title.textContent = `${statusData.count} issues for ${person.name} — ${statusData.status}`;
    issues.innerHTML = statusData.issues.map(i => `
      <div class="popup-issue-item">
        <a href="#" class="popup-issue-key" data-issue-key="${this.escapeHtml(i.key)}">${this.escapeHtml(i.key)}</a>
        <span class="popup-issue-summary">${this.escapeHtml(i.summary || '')}</span>
        <span class="popup-issue-meta">
          ${i.priority ? `<span class="priority-badge">${this.escapeHtml(i.priority)}</span>` : ''}
          ${i.issue_type ? `<span class="type-badge">${this.escapeHtml(i.issue_type)}</span>` : ''}
        </span>
      </div>
    `).join('');

    popup.style.display = 'block';
  }

  hidePopup() {
    const popup = document.getElementById('workload-popup');
    if (popup) popup.style.display = 'none';
    this.selectedPopupCell = null;
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
}

export const TeamWorkloadViewStyles = `
  .workload-view {
    padding: 24px;
    max-width: 100%;
    overflow-x: auto;
  }
  .workload-view h2 {
    margin: 0;
    font-size: 20px;
    color: var(--text);
  }
  .workload-filters {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .workload-filters select {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .workload-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  }
  .summary-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 24px;
    text-align: center;
    min-width: 120px;
  }
  .summary-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
  }
  .summary-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .workload-heatmap-container {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  .heatmap-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 600px;
  }
  .heatmap-table thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .heatmap-table th {
    background: var(--surface);
    padding: 12px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--text);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  .heatmap-person-header {
    min-width: 160px;
  }
  .heatmap-total-header {
    text-align: center;
    width: 60px;
  }
  .heatmap-status-header {
    text-align: center;
    min-width: 80px;
  }
  .heatmap-table td {
    padding: 10px;
    border-bottom: 1px solid var(--border);
  }
  .heatmap-person {
    padding: 10px 12px;
  }
  .person-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .person-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .person-load-bar {
    height: 3px;
    background: var(--hover);
    border-radius: 2px;
    overflow: hidden;
  }
  .person-load-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }
  .heatmap-total {
    text-align: center;
    color: var(--text);
    font-size: 14px;
  }
  .heatmap-cell {
    text-align: center;
    border-radius: 4px;
    transition: background 0.2s;
  }
  .heatmap-cell.has-issues {
    background: hsla(210, 80%, 50%, calc(var(--intensity) / 100));
    color: white;
    cursor: pointer;
    font-weight: 600;
  }
  .heatmap-cell.has-issues:hover {
    filter: brightness(1.2);
  }
  .heatmap-cell.intensity-medium {
    background: hsla(35, 90%, 50%, calc(var(--intensity) / 100));
  }
  .heatmap-cell.intensity-high {
    background: hsla(0, 80%, 55%, calc(var(--intensity) / 100));
  }
  .cell-count {
    display: block;
    font-size: 13px;
  }
  .cell-empty {
    color: var(--text-secondary);
    font-size: 12px;
  }
  .workload-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 500;
    width: 420px;
    max-width: 90vw;
    max-height: 70vh;
    display: none;
  }
  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
    font-size: 14px;
  }
  .popup-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
  }
  .popup-close:hover {
    color: var(--text);
  }
  .popup-issues {
    padding: 12px 16px;
    overflow-y: auto;
    max-height: 50vh;
  }
  .popup-issue-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .popup-issue-item:last-child {
    border-bottom: none;
  }
  .popup-issue-key {
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }
  .popup-issue-key:hover {
    text-decoration: underline;
  }
  .popup-issue-summary {
    color: var(--text);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .popup-issue-meta {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .priority-badge, .type-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--hover);
    color: var(--text-secondary);
    white-space: nowrap;
  }
`;
