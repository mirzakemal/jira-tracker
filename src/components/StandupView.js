import { escapeHtml } from '../utils/html.js';
import { getAll, initDatabase, STORE_NAMES as STORES } from '../db/indexeddb.js';
import { isDoneStatus } from '../utils/status.js';

export class StandupView {
  constructor(client, jiraDomain, onBack) {
    this.onBack = onBack;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.people = [];
    this.currentIdx = 0;
    this._destroyed = false;
  }

  async load() {
    this.isLoading = true;
    this.refresh();
    try {
      await initDatabase();
      const [issues, users] = await Promise.all([getAll(STORES.ISSUES), getAll(STORES.USERS)]);
      const userMap = new Map(users.map(u => [u.account_id, u.display_name]));
      const active = issues.filter(i => i.assignee_id && !isDoneStatus(i.status));
      const byPerson = {};
      for (const issue of active) {
        const name = userMap.get(issue.assignee_id) || issue.assignee_name || 'Unassigned';
        if (!byPerson[issue.assignee_id]) byPerson[issue.assignee_id] = { name, inProgress: [], blocked: [] };
        const cat = (issue.status_category || '').toLowerCase();
        if (cat.includes('progress')) byPerson[issue.assignee_id].inProgress.push(issue);
        else byPerson[issue.assignee_id].blocked.push(issue);
      }
      this.people = Object.values(byPerson).filter(p => p.inProgress.length || p.blocked.length).sort((a, b) => a.name.localeCompare(b.name));
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
    } catch (e) {
      this.error = e.message;
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
    }
  }

  render() {
    if (this.isLoading) return `<div class="standup-view" id="standup-view"><div class="loading-board"><div class="spinner"></div><p>Loading standup...</p></div></div>`;
    if (this.error) return `<div class="standup-view" id="standup-view"><div class="empty-state"><p style="color:var(--danger)">${escapeHtml(this.error)}</p></div></div>`;
    if (!this.people.length) return `<div class="standup-view" id="standup-view"><div class="empty-state"><p>No active assignees found.</p></div></div>`;

    const p = this.people[this.currentIdx];
    return `
      <div class="standup-view" id="standup-view">
        <div class="standup-header">
          <button class="back-btn" id="standup-back-btn">← Exit</button>
          <div class="standup-nav">
            <button class="btn btn-secondary" id="standup-prev" ${this.currentIdx === 0 ? 'disabled' : ''}>← Prev</button>
            <span class="standup-counter">${this.currentIdx + 1} / ${this.people.length}</span>
            <button class="btn btn-secondary" id="standup-next" ${this.currentIdx >= this.people.length - 1 ? 'disabled' : ''}>Next →</button>
          </div>
        </div>
        <div class="standup-person">
          <h1 class="standup-name">${escapeHtml(p.name)}</h1>
          <div class="standup-sections">
            <div class="standup-section">
              <h3>🔄 In Progress (${p.inProgress.length})</h3>
              ${p.inProgress.length ? p.inProgress.map(i => `
                <div class="standup-issue">
                  <span class="issue-key">${escapeHtml(i.key)}</span>
                  <span class="standup-summary">${escapeHtml(i.summary || '')}</span>
                  <span class="status-badge">${escapeHtml(i.status || '')}</span>
                </div>
              `).join('') : '<p class="standup-empty">None</p>'}
            </div>
            <div class="standup-section">
              <h3>🚧 Blockers / To Do (${p.blocked.length})</h3>
              ${p.blocked.length ? p.blocked.map(i => `
                <div class="standup-issue">
                  <span class="issue-key">${escapeHtml(i.key)}</span>
                  <span class="standup-summary">${escapeHtml(i.summary || '')}</span>
                  <span class="status-badge">${escapeHtml(i.status || '')}</span>
                </div>
              `).join('') : '<p class="standup-empty">None</p>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  refresh() {
    const el = document.getElementById('standup-view');
    if (el) { el.outerHTML = this.render(); this.bindEvents(); }
  }

  bindEvents() {
    document.getElementById('standup-back-btn')?.addEventListener('click', () => this.onBack?.());
    document.getElementById('standup-prev')?.addEventListener('click', () => { this.currentIdx--; this.refresh(); });
    document.getElementById('standup-next')?.addEventListener('click', () => { this.currentIdx++; this.refresh(); });
  }

  destroy() { this._destroyed = true; }
}

export const StandupViewStyles = `
  .standup-view {
    max-width: 900px;
    margin: 0 auto;
    min-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .standup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }
  .standup-nav { display: flex; align-items: center; gap: 12px; }
  .standup-counter { font-size: 14px; color: var(--text-muted); font-weight: 500; }
  .standup-person { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .standup-name {
    font-size: 36px;
    font-weight: 700;
    margin-bottom: 32px;
    text-align: center;
  }
  .standup-sections {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
    align-items: start;
    gap: 24px;
  }
  @media (max-width: 700px) { .standup-sections { grid-template-columns: 1fr; } }
  .standup-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    padding: 20px;
    max-height: 400px;
    overflow-y: auto;
  }
  .standup-section h3 { margin: 0 0 12px; font-size: 15px; }
  .standup-issue {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-light);
  }
  .standup-issue:last-child { border-bottom: none; }
  .standup-summary {
    flex: 1;
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .standup-empty { color: var(--text-muted); font-size: 13px; font-style: italic; }
`;
