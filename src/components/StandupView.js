import { escapeHtml, escapeAttr } from '../utils/html.js';
import { getAll, initDatabase, STORE_NAMES as STORES } from '../db/indexeddb.js';
import { isDoneStatus } from '../utils/status.js';
import { formatDate } from '../utils/date.js';
import logger from '../utils/logger.js';

/** Default recency window, in days, for "what changed recently". */
export const DEFAULT_STANDUP_DAYS = 5;

/**
 * Standup columns, left to right.
 *
 * Matched on the Eng status NAME (lowercased), not the category — TSM2 files
 * "Ready To Test" under the Done category, so a category check would file it as
 * finished work. The first column is the catch-all: anything still open that no
 * other column claims lands there, so a workflow change can never make an
 * in-flight ticket disappear.
 */
export const STANDUP_COLUMNS = [
  {
    key: 'todo',
    title: 'Blockers / To Do',
    icon: '🚧',
    tone: 'todo',
    // A failed test run is a blocker, not testing in progress — named
    // explicitly rather than left to the catch-all so the intent is obvious.
    names: ['test run failed'],
    catchAll: true
  },
  { key: 'inProgress', title: 'In Progress', icon: '🔄', tone: 'progress', names: ['in progress'] },
  {
    key: 'review',
    title: 'Review',
    icon: '👀',
    tone: 'review',
    // One column covering the whole review stage. The card still shows the
    // specific status, so "Code Quality Check" vs "Review Approval" is visible
    // without spending three columns on it.
    names: ['code quality check', 'in review', 'review approval']
  },
  {
    key: 'test',
    title: 'Test',
    icon: '🧪',
    tone: 'test',
    // Every testing stage TSM2 uses, including the shouty ones.
    names: [
      'ready to test', 'ready for test', 'ready for qa',
      'testing', 'testing in progress', 'tested',
      'test run passed', 'test comments',
      'ready for regression'
    ]
  },
  {
    key: 'completed',
    title: 'Completed',
    icon: '✅',
    tone: 'done',
    // "Ready For Approval" is spelled with a capital F in Jira; matching is
    // lowercased, so either spelling resolves.
    names: [
      'delivered / released', 'delivered/released', 'released', 'delivered',
      'approved', 'ready for approval'
    ],
    // Catch-all for finished work, mirroring what 'todo' does for open work.
    catchAllDone: true
  }
];

/**
 * Which column an issue belongs in, or null to leave it out.
 *
 * Named columns win first. Anything left over goes to the catch-all unless it
 * is already finished: with no Completed column, closed work (Tested, Delivered
 * / Released, ...) would otherwise be mislabelled as a blocker.
 *
 * @param {object} issue
 * @returns {string|null} column key
 */
export function columnForIssue(issue) {
  const status = (issue?.status || '').toLowerCase().trim();

  for (const column of STANDUP_COLUMNS) {
    if (column.names?.includes(status)) return column.key;
  }

  // Unmatched work falls to a catch-all rather than disappearing: finished
  // work to Completed, everything still open to Blockers / To Do.
  const category = (issue?.status_category || '').toLowerCase();
  if (isDoneStatus(issue?.status) || category.includes('done')) return 'completed';

  return 'todo';
}

/**
 * Is this issue's last update within `days` of now?
 *
 * NOTE: this is the issue's `updated` timestamp, i.e. "this ticket changed",
 * not "this person made the change". Jira attributes individual changes in the
 * changelog, which this app only caches for the most recent sync, so per-author
 * attribution is not available offline.
 *
 * @param {object} issue
 * @param {number} days
 * @param {number} [now]
 * @returns {boolean}
 */
export function isRecentlyUpdated(issue, days, now = Date.now()) {
  if (!issue?.updated_at) return false;
  const updated = new Date(issue.updated_at).getTime();
  if (Number.isNaN(updated)) return false;
  return updated >= now - days * 24 * 60 * 60 * 1000;
}

export class StandupView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.onBack = onBack;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.people = [];
    this.currentIdx = 0;
    this._destroyed = false;
    this.days = DEFAULT_STANDUP_DAYS;
    this.selectedId = '';
    this._allIssues = null;
    this._userMap = null;
    // issue key -> { author, created }. Filled in lazily, best effort.
    this._lastChangeByKey = new Map();
  }

  /**
   * "Updated by X, <when>" — omitted entirely until the lookup answers, rather
   * than showing a placeholder that may never resolve.
   *
   * @param {object} issue
   * @returns {string}
   */
  renderLastChange(issue) {
    const change = this._lastChangeByKey.get(issue.key);
    if (!change?.author) return '';

    // Name only. The timestamp lives in the Created/Updated row above — showing
    // it here too put two unlabelled dates on the card that read as duplicates.
    return `
      <div class="standup-card-by">
        <span class="standup-by-label">Updated by</span>
        <span class="standup-by-name">${escapeHtml(change.author)}</span>
      </div>
    `;
  }

  /**
   * Look up who last changed each of the cards currently on screen.
   *
   * Deliberately scoped to the visible person's cards — a handful — rather than
   * synced for every issue: Jira exposes this only through the per-issue
   * changelog, so it costs API calls that scale with the number of issues
   * asked for. Renders without it and fills in when the answers arrive.
   */
  async loadLastChangeAuthors() {
    if (!this.client) return;

    const person = this.people[this.currentIdx];
    if (!person) return;

    const keys = Object.values(person.columns)
      .flat()
      .map(i => i.key)
      .filter(key => key && !this._lastChangeByKey.has(key));
    if (keys.length === 0) return;

    // Mark up front so a re-render mid-flight doesn't queue the same keys again.
    for (const key of keys) this._lastChangeByKey.set(key, null);

    await Promise.all(keys.map(async (key) => {
      const change = await this.client.getLastChangeAuthor(key);
      if (change) this._lastChangeByKey.set(key, change);
    }));

    if (!this._destroyed) this.refresh();
  }

  async load() {
    this.isLoading = true;
    this.refresh();
    try {
      await initDatabase();
      const [issues, users] = await Promise.all([getAll(STORES.ISSUES), getAll(STORES.USERS)]);
      this._userMap = new Map(users.map(u => [u.account_id, u.display_name]));
      this._allIssues = issues;
      this.rebuild();
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
      this.loadLastChangeAuthors()
        .catch(err => logger.debug('[Standup] last-change lookup failed:', err?.message));
    } catch (e) {
      this.error = e.message;
      this.isLoading = false;
      if (!this._destroyed) this.refresh();
    }
  }

  /**
   * Group the cached issues into per-person standup entries.
   *
   * Runs off the in-memory snapshot so changing the window or the person does
   * not re-read IndexedDB.
   */
  rebuild() {
    const issues = this._allIssues || [];
    const userMap = this._userMap || new Map();
    const now = Date.now();

    const recent = issues.filter(i =>
      i.assignee_id && isRecentlyUpdated(i, this.days, now)
    );

    const byPerson = {};
    for (const issue of recent) {
      const columnKey = columnForIssue(issue);
      if (!columnKey) continue;

      const name = userMap.get(issue.assignee_id) || issue.assignee_name || 'Unassigned';
      if (!byPerson[issue.assignee_id]) {
        byPerson[issue.assignee_id] = {
          id: issue.assignee_id,
          name,
          columns: Object.fromEntries(STANDUP_COLUMNS.map(c => [c.key, []]))
        };
      }
      byPerson[issue.assignee_id].columns[columnKey].push(issue);
    }

    // Newest change first, so "latest updates" reads top-down.
    const byUpdated = (a, b) => new Date(b.updated_at) - new Date(a.updated_at);
    const people = Object.values(byPerson);
    for (const person of people) {
      for (const list of Object.values(person.columns)) list.sort(byUpdated);
    }

    this.people = people
      .filter(p => Object.values(p.columns).some(list => list.length))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Keep the selected person in view; fall back to the first one.
    if (this.selectedId) {
      const idx = this.people.findIndex(p => p.id === this.selectedId);
      this.currentIdx = idx >= 0 ? idx : 0;
    }
    if (this.currentIdx >= this.people.length) this.currentIdx = 0;
  }

  render() {
    if (this.isLoading) return `<div class="standup-view" id="standup-view"><div class="loading-board"><div class="spinner"></div><p>Loading standup...</p></div></div>`;
    if (this.error) return `<div class="standup-view" id="standup-view"><div class="empty-state"><p style="color:var(--danger)">${escapeHtml(this.error)}</p></div></div>`;

    const controls = this.renderControls();

    if (!this.people.length) {
      return `
        <div class="standup-view" id="standup-view">
          ${controls}
          <div class="empty-state">
            <h3>No updates in the last ${this.days} days</h3>
            <p class="empty-hint">Widen the window, or run a sync to pull recent changes.</p>
          </div>
        </div>
      `;
    }

    const p = this.people[this.currentIdx];
    return `
      <div class="standup-view" id="standup-view">
        ${controls}
        <div class="standup-person">
          <h1 class="standup-name">${escapeHtml(p.name)}</h1>
          <p class="standup-subtitle">
            Updated in the last ${this.days} days
          </p>
          <div class="standup-sections">
            ${STANDUP_COLUMNS.map(c => this.renderSection(c, p.columns[c.key] || [])).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderControls() {
    const people = this.people;
    const current = people[this.currentIdx];

    const options = people.map(person => `
      <option value="${escapeAttr(person.id)}"${person.id === current?.id ? ' selected' : ''}>
        ${escapeHtml(person.name)}
      </option>
    `).join('');

    const dayOptions = [1, 3, 5, 7, 14].map(d => `
      <option value="${d}"${d === this.days ? ' selected' : ''}>Last ${d} day${d === 1 ? '' : 's'}</option>
    `).join('');

    // Reuses the .product-filters classes from the Product Board so every view
    // has the same filter bar: labelled controls, consistent spacing.
    return `
      <div class="product-filters standup-filters">
        <div class="product-filter">
          <label for="standup-person-filter">Person</label>
          <select id="standup-person-filter" ${people.length ? '' : 'disabled'}>
            ${people.length ? options : '<option>No one to show</option>'}
          </select>
        </div>
        <div class="product-filter">
          <label for="standup-days-filter">Updated within</label>
          <select id="standup-days-filter">
            ${dayOptions}
          </select>
        </div>
        <div class="standup-nav">
          <button class="btn btn-sm" id="standup-prev" ${this.currentIdx === 0 ? 'disabled' : ''}>← Prev</button>
          <span class="standup-counter">${people.length ? this.currentIdx + 1 : 0} / ${people.length}</span>
          <button class="btn btn-sm" id="standup-next" ${this.currentIdx >= people.length - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `;
  }

  /**
   * Browse URL for an issue key, or null when the Jira domain is unknown.
   *
   * @param {string} key
   * @returns {string|null}
   */
  jiraUrl(key) {
    const site = String(this.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!site || !key) return null;
    return `https://${site}/browse/${encodeURIComponent(key)}`;
  }

  renderSection(column, issues) {
    const points = issues.reduce((sum, i) => sum + (Number(i.story_points) || 0), 0);
    const pts = (n) => `${n} ${Number(n) === 1 ? 'pt' : 'pts'}`;

    return `
      <div class="standup-section standup-tone-${escapeAttr(column.tone || 'todo')}">
        <h3>
          <span class="standup-section-icon" aria-hidden="true">${column.icon || ''}</span>
          <span class="standup-section-title">${escapeHtml(column.title)}</span>
          <span class="standup-section-count">${issues.length}</span>
          ${points > 0 ? `<span class="standup-points-total" title="Total story points">${escapeHtml(pts(points))}</span>` : ''}
        </h3>
        ${issues.length ? `<div class="standup-cards">${issues.map(i => {
          const href = this.jiraUrl(i.key);
          // A real anchor rather than a click handler: middle-click, ctrl-click
          // and keyboard activation all work for free. The card holds no other
          // interactive element, so nesting is not a concern.
          const open = href
            ? `<a class="standup-card" href="${escapeAttr(href)}" target="_blank" rel="noopener"
                  title="Open ${escapeAttr(i.key)} in Jira">`
            : '<article class="standup-card">';
          const close = href ? '</a>' : '</article>';
          return `
          ${open}
            <div class="standup-card-top">
              <span class="issue-key">${escapeHtml(i.key)}</span>
              ${i.story_points != null
                ? `<span class="standup-points" title="Story points">${escapeHtml(pts(i.story_points))}</span>`
                : ''}
            </div>
            <div class="standup-card-summary">${escapeHtml(i.summary || '')}</div>
            <div class="standup-card-foot">
              <span class="status-badge">${escapeHtml(i.status || '')}</span>
            </div>
            <div class="standup-card-dates">
              <span class="standup-date">
                <span class="standup-date-label">Created</span>
                <span class="standup-date-value">${escapeHtml(formatDate(i.created_at) || '—')}</span>
              </span>
              <span class="standup-date">
                <span class="standup-date-label">Updated</span>
                <span class="standup-date-value">${escapeHtml(formatDate(i.updated_at) || '—')}</span>
              </span>
            </div>
            ${this.renderLastChange(i)}
          ${close}
        `;
        }).join('')}</div>` : '<p class="standup-empty">None</p>'}
      </div>
    `;
  }

  refresh() {
    const el = document.getElementById('standup-view');
    if (el) { el.outerHTML = this.render(); this.bindEvents(); }
  }

  bindEvents() {
    document.getElementById('standup-prev')?.addEventListener('click', () => {
      this.currentIdx--;
      this.selectedId = this.people[this.currentIdx]?.id || '';
      this.refresh();
    });
    document.getElementById('standup-next')?.addEventListener('click', () => {
      this.currentIdx++;
      this.selectedId = this.people[this.currentIdx]?.id || '';
      this.refresh();
    });

    document.getElementById('standup-person-filter')?.addEventListener('change', (e) => {
      this.selectedId = e.target.value;
      const idx = this.people.findIndex(p => p.id === this.selectedId);
      if (idx >= 0) this.currentIdx = idx;
      this.refresh();
      this.loadLastChangeAuthors()
        .catch(err => logger.debug('[Standup] last-change lookup failed:', err?.message));
    });

    document.getElementById('standup-days-filter')?.addEventListener('change', (e) => {
      // Select values are strings; the window arithmetic needs a number.
      this.days = Number(e.target.value);
      this.rebuild();
      this.refresh();
    });
  }

  destroy() { this._destroyed = true; }
}

export const StandupViewStyles = `
  /* Full width, like the Product Board — four columns share the screen. */
  .standup-view {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-height: 70vh;
  }

  /* --- Filter bar --- */
  .standup-filters { margin-bottom: var(--space-lg); }
  /* Navigation sits at the far end of the bar, away from the filters. */
  .standup-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
  .standup-counter { font-size: 13px; color: var(--text-muted); font-weight: 600; }
  @media (max-width: 700px) {
    .standup-nav { margin-left: 0; width: 100%; justify-content: space-between; }
  }

  /* --- Person --- */
  .standup-person { flex: 1; display: flex; flex-direction: column; }
  .standup-name {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 4px;
    text-align: center;
    letter-spacing: -0.02em;
  }
  .standup-subtitle {
    margin: 0 0 var(--space-lg);
    color: var(--text-muted);
    font-size: 15px;
    text-align: center;
  }

  /* --- Columns --- */
  .standup-sections {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: start;
    gap: var(--space-md);
  }
  @media (max-width: 1500px) { .standup-sections { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 1000px) { .standup-sections { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .standup-sections { grid-template-columns: 1fr; } }

  .standup-section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    border-top: 3px solid var(--border-strong);
    border-radius: var(--radius-md);
    max-height: 62vh;
    overflow-y: auto;
  }
  /* A colour per stage, so the eye finds the right column without reading. */
  .standup-tone-todo { border-top-color: var(--text-muted); }
  .standup-tone-progress { border-top-color: var(--info); }
  .standup-tone-review { border-top-color: var(--primary); }
  .standup-tone-test { border-top-color: var(--warning); }
  .standup-tone-done { border-top-color: var(--success); }

  .standup-section h3 {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 10px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .standup-section-icon { font-size: 16px; }
  .standup-section-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .standup-section-count,
  .standup-points-total {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    text-transform: none;
    letter-spacing: 0;
  }
  .standup-points-total { color: var(--text-muted); }

  /* --- Cards --- */
  .standup-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }
  .standup-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-xs);
    transition: box-shadow 0.1s, background 0.1s;
  }
  a.standup-card { text-decoration: none; color: inherit; cursor: pointer; }
  .standup-card:hover { background: var(--hover); box-shadow: var(--shadow-sm); }
  a.standup-card:hover .issue-key { text-decoration: underline; }
  a.standup-card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .standup-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .standup-card .issue-key {
    font-family: var(--mono, monospace);
    font-size: 13.5px;
    font-weight: 600;
  }
  .standup-points {
    font-size: 13px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    color: var(--primary);
    white-space: nowrap;
  }
  /* Summaries wrap rather than truncate — the point is to read them aloud. */
  .standup-card-summary {
    font-size: 16px;
    line-height: 1.4;
    color: var(--text-h);
    overflow-wrap: anywhere;
  }
  .standup-card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
  }
  .standup-card .status-badge {
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .standup-card-dates {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding-top: 5px;
    border-top: 1px solid var(--border-light);
  }
  .standup-date { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .standup-date-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }
  .standup-date-value { font-size: 13.5px; color: var(--text); white-space: nowrap; }
  .standup-card-by {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px;
    padding-top: 5px;
    border-top: 1px solid var(--border-light);
    font-size: 13px;
  }
  .standup-by-label {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 600;
    font-size: 12px;
  }
  .standup-by-name { font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
  .standup-by-when { color: var(--text-muted); margin-left: auto; white-space: nowrap; }
  .standup-empty {
    color: var(--text-muted);
    font-size: 15px;
    font-style: italic;
    padding: 14px 12px;
    margin: 0;
    text-align: center;
  }
`;
