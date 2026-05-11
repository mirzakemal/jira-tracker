import { escapeHtml } from '../utils/html.js';
import { getAll, initDatabase, STORE_NAMES as STORES } from '../db/indexeddb.js';
import { isDoneStatus } from '../utils/status.js';

export class CumulativeFlowView {
  constructor(client, jiraDomain, onBack) {
    this.onBack = onBack;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.data = null;
    this._destroyed = false;
  }

  async load() {
    this.isLoading = true;
    this.refresh();
    try {
      await initDatabase();
      const issues = await getAll(STORES.ISSUES);
      this.data = this.computeCFD(issues);
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
    } catch (e) {
      this.error = e.message;
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
    }
  }

  computeCFD(issues) {
    const now = new Date();
    const weeks = 12;
    const buckets = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i * 7);
      date.setHours(23, 59, 59, 999);

      // Count issues that existed by this date
      let done = 0, inProgress = 0, todo = 0;
      for (const issue of issues) {
        if (!issue.created_at || new Date(issue.created_at) > date) continue;
        const resolved = issue.resolved_at ? new Date(issue.resolved_at) : null;
        if (resolved && resolved <= date) {
          done++;
        } else {
          // Not resolved by this date — approximate status from current data
          const cat = (issue.status_category || '').toLowerCase();
          if (cat.includes('progress')) inProgress++;
          else todo++;
        }
      }
      buckets.push({ label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), done, inProgress, todo });
    }
    return { buckets };
  }

  render() {
    if (this.isLoading) return `<div class="cfd-view" id="cfd-view"><div class="loading-board"><div class="spinner"></div><p>Loading CFD...</p></div></div>`;
    if (this.error) return `<div class="cfd-view" id="cfd-view"><div class="empty-state"><p style="color:var(--danger)">${escapeHtml(this.error)}</p></div></div>`;
    if (!this.data) return `<div class="cfd-view" id="cfd-view"><div class="empty-state"><p>No data available.</p></div></div>`;

    const { buckets } = this.data;
    const maxTotal = Math.max(...buckets.map(b => b.done + b.inProgress + b.todo), 1);

    return `
      <div class="cfd-view" id="cfd-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="cfd-back-btn">← Back</button>
            <h2>Cumulative Flow Diagram</h2>
          </div>
        </div>
        <div class="cfd-chart">
          ${buckets.map(b => {
            const total = b.done + b.inProgress + b.todo;
            const h = (total / maxTotal) * 100;
            const pDone = total > 0 ? (b.done / total) * 100 : 0;
            const pIP = total > 0 ? (b.inProgress / total) * 100 : 0;
            const pTodo = total > 0 ? (b.todo / total) * 100 : 0;
            return `
              <div class="cfd-col">
                <div class="cfd-stack" style="height:${h}%" title="Done: ${b.done}, In Progress: ${b.inProgress}, To Do: ${b.todo}">
                  <div class="cfd-seg cfd-done" style="height:${pDone}%"></div>
                  <div class="cfd-seg cfd-inprogress" style="height:${pIP}%"></div>
                  <div class="cfd-seg cfd-todo" style="height:${pTodo}%"></div>
                </div>
                <span class="cfd-label">${b.label}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="cfd-legend">
          <span><span class="cfd-dot cfd-done"></span> Done</span>
          <span><span class="cfd-dot cfd-inprogress"></span> In Progress</span>
          <span><span class="cfd-dot cfd-todo"></span> To Do</span>
        </div>
      </div>
    `;
  }

  refresh() {
    const el = document.getElementById('cfd-view');
    if (el) { el.outerHTML = this.render(); this.bindEvents(); }
  }

  bindEvents() {
    document.getElementById('cfd-back-btn')?.addEventListener('click', () => this.onBack?.());
  }

  destroy() { this._destroyed = true; }
}

export const CumulativeFlowViewStyles = `
  .cfd-view { max-width: 1200px; margin: 0 auto; }
  .cfd-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 300px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  .cfd-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }
  .cfd-stack {
    width: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 3px 3px 0 0;
    overflow: hidden;
  }
  .cfd-seg { min-height: 1px; transition: height 0.3s; }
  .cfd-done { background: var(--success); }
  .cfd-inprogress { background: var(--primary); }
  .cfd-todo { background: var(--text-muted); opacity: 0.5; }
  .cfd-label { font-size: 10px; color: var(--text-muted); margin-top: 6px; white-space: nowrap; }
  .cfd-legend {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .cfd-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .cfd-dot.cfd-done { background: var(--success); }
  .cfd-dot.cfd-inprogress { background: var(--primary); }
  .cfd-dot.cfd-todo { background: var(--text-muted); opacity: 0.5; }
`;
