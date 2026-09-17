/**
 * Bug Pattern Explorer — where bugs cluster, whether they're rising, and how
 * many escaped testing.
 *
 * Left: product areas ranked by the chosen measure. Right: the selected
 * area — monthly chart, who reports it, recurring phrases the dictionary
 * doesn't name yet, and the newest open bugs (each opens Jira in a new tab).
 *
 * The sort dropdown carries a one-line explanation that changes with the
 * selection, and a disclosure listing all four, because "escape ratio" is not
 * self-explanatory.
 */

import { escapeHtml, escapeAttr } from '../utils/html.js';
import { updateQueryParams } from '../utils/router.js';
import { loadBugPatterns, sortAreas, SORT_OPTIONS } from '../db/bug-queries.js';
import { TEAM_AREAS, TEAM_AREA_ORDER } from '../utils/team-area.js';
import logger from '../utils/logger.js';

const TYPE_LABELS = { bug: 'Bug', defect: 'Defect', incident: 'Incident' };
const TYPE_HINTS = {
  bug: 'Found in production',
  defect: 'Found during development',
  incident: 'Production incident'
};

export class BugPatternsView {
  constructor(client, jiraDomain) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.data = null;
    this.sort = 'count';
    this.teamArea = 'all';
    this.types = { bug: true, defect: true, incident: false };
    this.includeParked = false;
    this.selected = null; // product-area key
    this._destroyed = false;
    this._loadSeq = 0;
  }

  get filters() {
    return { sort: this.sort, team: this.teamArea, sel: this.selected, types: { ...this.types }, includeParked: this.includeParked };
  }

  /**
   * @param {object} [filters] - `{sort, team, sel, types, includeParked}` or URL
   *   params `{sort, team, sel, parked}`.
   */
  async load(filters = {}) {
    if (filters.sort && SORT_OPTIONS.some(o => o.key === filters.sort)) this.sort = filters.sort;
    if (filters.team && (filters.team === 'all' || TEAM_AREAS[filters.team])) this.teamArea = filters.team;
    if (typeof filters.sel === 'string' && filters.sel) this.selected = filters.sel;
    if (filters.types) this.types = { ...this.types, ...filters.types };
    if (typeof filters.includeParked === 'boolean') this.includeParked = filters.includeParked;
    if (typeof filters.parked === 'string') this.includeParked = filters.parked === '1';

    const seq = ++this._loadSeq;
    this.isLoading = true;
    this.error = null;
    this.refresh();

    try {
      const data = await loadBugPatterns({ teamArea: this.teamArea, types: this.types, includeParked: this.includeParked });
      if (this._destroyed || seq !== this._loadSeq) return;
      this.data = data;
      const ordered = sortAreas(data.areas, this.sort);
      if (!ordered.some(a => a.key === this.selected)) this.selected = ordered[0]?.key || null;
    } catch (error) {
      if (this._destroyed || seq !== this._loadSeq) return;
      logger.error('[BugPatterns] load failed:', error);
      this.error = error.message || 'Could not analyse bugs';
    } finally {
      if (!this._destroyed && seq === this._loadSeq) {
        this.isLoading = false;
        this.refresh();
      }
    }
  }

  destroy() {
    this._destroyed = true;
  }

  // ── Rendering ────────────────────────────────────────────────────────

  render() {
    return `<div id="bugs-view" class="bp-view">${this.renderInner()}</div>`;
  }

  refresh() {
    const root = document.getElementById('bugs-view');
    if (!root) return;
    root.innerHTML = this.renderInner();
    this.bindEvents();
  }

  renderInner() {
    return `${this.renderHeader()}<div id="bp-body">${this.renderBody()}</div>`;
  }

  renderHeader() {
    const sortDef = SORT_OPTIONS.find(o => o.key === this.sort) || SORT_OPTIONS[0];
    const areaBtn = (key, label, description) => `
      <button type="button" class="bp-seg-btn" data-team="${key}" aria-pressed="${this.teamArea === key}" title="${escapeAttr(description)}">${escapeHtml(label)}</button>`;

    return `
      <div class="bp-header">
        <div>
          <h2 class="bp-title">Bug Pattern Explorer</h2>
          <p class="bp-subtitle">Where bugs cluster, whether they're rising, and how many escaped testing</p>
        </div>
        <div class="bp-tools">
          <div class="bp-seg" role="group" aria-label="Team area">
            ${areaBtn('all', 'All', 'Every team area')}
            ${TEAM_AREA_ORDER.map(k => areaBtn(k, TEAM_AREAS[k].label, TEAM_AREAS[k].description)).join('')}
          </div>
          <div class="bp-types" role="group" aria-label="Issue types">
            ${Object.keys(TYPE_LABELS).map(t => `
              <button type="button" class="bp-type" data-type="${t}" aria-pressed="${Boolean(this.types[t])}" title="${escapeAttr(TYPE_HINTS[t])}">${TYPE_LABELS[t]}</button>`).join('')}
          </div>
          <label class="bp-sort">
            <span>Sort by</span>
            <select id="bp-sort" class="bp-select">
              ${SORT_OPTIONS.map(o => `<option value="${o.key}"${o.key === this.sort ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div class="bp-explain-row">
        <p class="bp-sort-explain" id="bp-sort-explain"><b>${escapeHtml(sortDef.label)}:</b> ${escapeHtml(sortDef.explain)}</p>
        <details class="bp-help">
          <summary aria-label="What do the sort options mean?">? All four measures</summary>
          <dl>
            ${SORT_OPTIONS.map(o => `<dt>${escapeHtml(o.label)}</dt><dd>${escapeHtml(o.explain)}</dd>`).join('')}
          </dl>
        </details>
      </div>
    `;
  }

  renderBody() {
    if (this.isLoading && !this.data) {
      return `<div class="loading-board"><div class="spinner"></div><p>Reading bug titles…</p></div>`;
    }
    if (this.error) return `<div class="error-message" style="padding:20px">${escapeHtml(this.error)}</div>`;
    const d = this.data;
    if (!d) return '';
    if (!d.areas.length) {
      return `<div class="bp-empty-all">No ${Object.keys(this.types).filter(t => this.types[t]).map(t => TYPE_LABELS[t]).join(' / ') || 'issue'} cards in the cache for this scope. Sync first, or widen the filters.</div>`;
    }

    const ordered = sortAreas(d.areas, this.sort);
    const max = Math.max(...ordered.map(a => a.open), 1);
    const selected = ordered.find(a => a.key === this.selected) || ordered[0];

    return `
      <p class="bp-totals">
        <b class="num">${d.totals.considered}</b> cards considered · <b class="num">${d.totals.open}</b> open ·
        <b class="num">${d.totals.bugsInWindow}</b> bugs and <b class="num">${d.totals.defectsInWindow}</b> defects created in the last ${d.months.length} months ·
        <b class="num">${d.totals.bounce}</b> bounced back
        ${d.totals.unclassified ? `· <button type="button" class="bp-link" data-select="other"><b class="num">${d.totals.unclassified}</b> unclassified</button>` : ''}
      </p>
      <div class="bp-two">
        <div class="bp-list" role="listbox" aria-label="Product areas">
          ${ordered.map(a => this.areaRow(a, max, a.key === selected.key)).join('')}
        </div>
        <div class="bp-detail">${this.renderDetail(selected, d)}</div>
      </div>
      <p class="bp-foot">Areas come from a hand-kept dictionary matched against titles — labels and components are almost never set on bugs here. When a phrase keeps appearing under "not named yet", add it to <code>utils/product-area.js</code>.</p>
    `;
  }

  areaRow(a, max, on) {
    const escape = a.escapeRatio === null
      ? '<span class="bp-chip dim" title="Bugs but no defects logged in the window — nothing to divide by">no defects</span>'
      : `<span class="bp-chip ${a.escapeRatio >= 6 ? 'bad' : a.escapeRatio >= 3 ? 'warn' : 'ok'}" title="Bugs found in production per defect caught in development">escape ${a.escapeRatio.toFixed(1)}:1</span>`;
    const trend = a.trend === null
      ? '<span class="bp-chip dim" title="Not enough history in the first months of the window">trend —</span>'
      : `<span class="bp-chip ${a.trend > 0.5 ? 'bad' : a.trend > 0 ? 'warn' : 'ok'}" title="Last third of the window vs the first third">${a.trend > 0 ? '▲' : a.trend < 0 ? '▼' : '■'} ${Math.abs(Math.round(a.trend * 100))}%</span>`;
    const bounce = a.bounce ? `<span class="bp-chip warn" title="Currently in Test Comments / Test Run Failed">↺ ${a.bounce} bounced</span>` : '';

    return `
      <button type="button" class="bp-area${on ? ' on' : ''}" role="option" aria-selected="${on}" data-select="${escapeAttr(a.key)}">
        <div class="bp-area-main">
          <div class="bp-area-name"><span>${escapeHtml(a.label)}</span><span class="bp-area-count num">${a.open}</span></div>
          <div class="bp-area-bar"><i style="width:${(a.open / max) * 100}%"></i></div>
          <div class="bp-area-chips">${escape}${bounce}${trend}</div>
        </div>
        ${this.sparkline(a.monthly)}
      </button>`;
  }

  sparkline(series) {
    const w = 88, h = 30, max = Math.max(...series, 1);
    const pts = series.map((v, i) => `${(i / Math.max(series.length - 1, 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 8)}`);
    const last = pts[pts.length - 1].split(',');
    return `<svg class="bp-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--primary)" stroke-width="1.5"/><circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="var(--primary)"/></svg>`;
  }

  renderDetail(a, d) {
    const W = 520, H = 150, pl = 28, pb = 22, pt = 8;
    const max = Math.max(...a.monthly, 1);
    const cw = (W - pl - 8) / a.monthly.length;
    const ticks = [...new Set([0, Math.ceil(max / 2), max])];
    let svg = `<svg class="bp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bugs created per month in ${escapeAttr(a.label)}">`;
    for (const v of ticks) {
      const y = pt + (H - pt - pb) * (1 - v / max);
      svg += `<line class="grid" x1="${pl}" x2="${W - 4}" y1="${y}" y2="${y}"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
    }
    a.monthly.forEach((v, i) => {
      const x = pl + i * cw + 4, bh = (H - pt - pb) * (v / max), y = pt + (H - pt - pb) - bh;
      svg += `<rect class="bar" x="${x}" y="${y}" width="${Math.max(cw - 8, 2)}" height="${bh}" rx="2"><title>${escapeHtml(d.months[i])}: ${v}</title></rect>`;
      svg += `<text x="${x + Math.max(cw - 8, 2) / 2}" y="${H - 6}" text-anchor="middle">${escapeHtml(d.months[i])}</text>`;
    });
    svg += '</svg>';

    const escapeText = a.escapeRatio === null
      ? `<b>—</b> escape ratio <small>(no defects logged in the window)</small>`
      : `<b class="num">${a.escapeRatio.toFixed(1)}:1</b> escape ratio`;

    const customers = a.customers.length
      ? a.customers.map(c => `<span class="bp-chip info">${escapeHtml(c.name)} <b class="num">${c.count}</b></span>`).join('')
      : '<span class="bp-muted">No customer named on these cards.</span>';
    const phrases = a.phrases.length
      ? a.phrases.map(p => `<span class="bp-chip dim" title="Appears in ${p.count} titles">${escapeHtml(p.phrase)} <b class="num">×${p.count}</b></span>`).join('')
      : '<span class="bp-muted">Nothing recurs that the dictionary doesn\'t already name.</span>';
    const recent = a.recent.length
      ? a.recent.map(r => `
          <a class="bp-row" href="${escapeAttr(this.jiraUrl(r.key))}" target="_blank" rel="noopener" data-issue-key="${escapeAttr(r.key)}" title="${escapeAttr(r.summary || '')}">
            <span class="bp-key"><span class="bp-pri ${this.priCls(r.priority)}"></span>${escapeHtml(r.key)}</span>
            <span class="bp-sum">${escapeHtml(r.summary || '')}${r.customer ? `<span class="bp-cust">· ${escapeHtml(r.customer)}</span>` : ''}</span>
            <span class="bp-chip ${this.statusCls(r.status)}">${escapeHtml(r.status || '')}</span>
            <span class="bp-age num">${this.daysAgo(r.created_at)}d</span>
          </a>`).join('')
      : '<div class="bp-muted" style="padding:10px 0">No open cards in this area.</div>';

    return `
      <h3 class="bp-detail-title">${escapeHtml(a.label)}</h3>
      <p class="bp-detail-hint">${escapeHtml(a.hint)}</p>
      <div class="bp-stats">
        <span><b class="num">${a.open}</b> open</span>
        <span><b class="num">${a.bugsInWindow}</b> bugs in window</span>
        <span><b class="num">${a.defectsInWindow}</b> defects caught in dev</span>
        <span>${escapeText}</span>
        <span><b class="num">${a.bounce}</b> bounced back</span>
      </div>
      ${svg}
      <p class="bp-detail-note">Bugs created per month. Defects (found in development) are counted in the escape ratio but not drawn — a tall month here with a low defect count is an area testing isn't catching.</p>
      <h4>Who reports these</h4><div class="bp-chips">${customers}</div>
      <h4>Recurring phrases the dictionary doesn't name yet</h4><div class="bp-chips">${phrases}</div>
      <h4>Newest open cards</h4><div class="bp-rows">${recent}</div>
    `;
  }

  // ── Events ───────────────────────────────────────────────────────────

  bindEvents() {
    const root = document.getElementById('bugs-view');
    if (!root) return;

    root.querySelectorAll('.bp-seg-btn').forEach(btn => btn.addEventListener('click', () => {
      this.teamArea = btn.dataset.team;
      updateQueryParams({ team: this.teamArea === 'all' ? null : this.teamArea });
      this.load();
    }));

    root.querySelectorAll('.bp-type').forEach(btn => btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      const next = { ...this.types, [t]: !this.types[t] };
      // At least one type stays on, or there is nothing to show.
      if (!Object.values(next).some(Boolean)) return;
      this.types = next;
      this.load();
    }));

    document.getElementById('bp-sort')?.addEventListener('change', (e) => {
      this.sort = e.target.value;
      updateQueryParams({ sort: this.sort === 'count' ? null : this.sort });
      this.refresh();
    });

    root.querySelectorAll('[data-select]').forEach(el => el.addEventListener('click', () => {
      this.selected = el.dataset.select;
      updateQueryParams({ sel: this.selected });
      this.refresh();
    }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  jiraUrl(key) {
    const site = String(this.jiraDomain || window.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return site ? `https://${site}/browse/${encodeURIComponent(key)}` : '#';
  }

  daysAgo(iso) {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? '?' : Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  priCls(p) {
    const v = String(p || '').toLowerCase();
    return v === 'highest' ? 'h' : v === 'high' ? 'hi' : (v === 'low' || v === 'lowest') ? 'lo' : '';
  }

  statusCls(s) {
    const v = String(s || '').toLowerCase();
    if (/delivered|released|tested\b/.test(v)) return 'ok';
    if (/test comments|test run failed/.test(v)) return 'bad';
    if (/^to do$/.test(v)) return 'dim';
    if (/test|review|quality/.test(v)) return 'warn';
    return 'info';
  }
}

export const BugPatternsViewStyles = `
  .bp-view { display: flex; flex-direction: column; gap: 14px; }
  .bp-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .bp-title { margin: 0; font-size: 21px; font-weight: 700; color: var(--text-h); letter-spacing: -0.015em; }
  .bp-subtitle { margin: 2px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .bp-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .bp-seg, .bp-types { display: inline-flex; padding: 3px; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: 8px; gap: 2px; }
  .bp-seg-btn, .bp-type { appearance: none; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
  .bp-seg-btn[aria-pressed="true"] { background: var(--surface); color: var(--text-h); box-shadow: var(--shadow-xs); }
  .bp-type[aria-pressed="true"] { background: var(--info-bg); color: var(--info); }
  .bp-seg-btn:focus-visible, .bp-type:focus-visible, .bp-area:focus-visible, .bp-select:focus-visible, .bp-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

  .bp-sort { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .bp-select { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-h); background: var(--surface); border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px; }

  .bp-explain-row { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-raised); }
  .bp-sort-explain { margin: 0; font-size: 13px; color: var(--text); max-width: 78ch; }
  .bp-sort-explain b { color: var(--text-h); }
  .bp-help { font-size: 12.5px; color: var(--text-muted); position: relative; }
  .bp-help summary { cursor: pointer; font-weight: 600; color: var(--primary); list-style: none; white-space: nowrap; }
  .bp-help summary::-webkit-details-marker { display: none; }
  .bp-help[open] summary { color: var(--text-h); }
  .bp-help dl { margin: 8px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; max-width: 60ch; }
  .bp-help dt { font-weight: 700; color: var(--text-h); }
  .bp-help dd { margin: 0; color: var(--text); }

  .bp-totals { margin: 0; font-size: 13px; color: var(--text-muted); }
  .bp-totals b { color: var(--text-h); }
  .bp-link { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: var(--primary); cursor: pointer; text-decoration: underline dotted; }

  .bp-two { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; }
  .bp-list { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; align-self: start; }
  .bp-area { appearance: none; width: 100%; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) 88px; gap: 10px; align-items: center; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--border-light); background: none; color: inherit; font: inherit; cursor: pointer; }
  .bp-area:last-child { border-bottom: 0; }
  .bp-area:hover { background: var(--hover); }
  .bp-area.on { background: var(--primary-bg); }
  .bp-area-name { font-weight: 600; color: var(--text-h); font-size: 13.5px; display: flex; justify-content: space-between; gap: 8px; }
  .bp-area-count { color: var(--text-muted); font-weight: 500; }
  .bp-area-bar { height: 6px; border-radius: 3px; background: var(--surface-sunken); margin-top: 6px; overflow: hidden; }
  .bp-area-bar i { display: block; height: 100%; background: var(--primary); }
  .bp-area-chips { display: flex; gap: 5px; margin-top: 6px; flex-wrap: wrap; }
  .bp-spark { width: 88px; height: 30px; display: block; }

  .bp-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
  .bp-chip.ok { background: var(--success-bg); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .bp-chip.warn { background: var(--warning-bg); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .bp-chip.bad { background: var(--danger-bg); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
  .bp-chip.info { background: var(--info-bg); color: var(--info); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
  .bp-chip.dim { background: var(--surface-sunken); color: var(--text-muted); border-color: var(--border); }
  .bp-chip b { font-weight: 600; }

  .bp-detail { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 14px 16px; min-width: 0; }
  .bp-detail-title { margin: 0; font-size: 16px; color: var(--text-h); }
  .bp-detail-hint { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); }
  .bp-stats { display: flex; flex-wrap: wrap; gap: 14px; margin: 10px 0 12px; font-size: 12.5px; color: var(--text-muted); }
  .bp-stats b { color: var(--text-h); }
  .bp-stats small { font-size: 11.5px; }
  .bp-chart { width: 100%; height: auto; display: block; }
  .bp-chart text { fill: var(--text-muted); font: 11px var(--sans); }
  .bp-chart .grid { stroke: var(--border); stroke-width: 1; }
  .bp-chart .bar { fill: var(--primary); }
  .bp-detail-note { font-size: 12.5px; color: var(--text-muted); margin: 8px 0 0; max-width: 64ch; }
  .bp-detail h4 { margin: 14px 0 6px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
  .bp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .bp-muted { font-size: 12.5px; color: var(--text-muted); }

  .bp-rows { display: flex; flex-direction: column; }
  .bp-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-light); text-decoration: none; color: inherit; }
  .bp-row:last-child { border-bottom: 0; }
  .bp-row:hover { background: var(--hover); }
  .bp-key { font-family: var(--mono); font-size: 12.5px; font-weight: 500; color: var(--text-h); white-space: nowrap; }
  .bp-pri { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--text-muted); }
  .bp-pri.h { background: var(--danger); } .bp-pri.hi { background: var(--warning); } .bp-pri.lo { background: var(--info); }
  .bp-sum { font-size: 13.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bp-cust { color: var(--text-muted); font-size: 12px; margin-left: 6px; }
  .bp-age { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .bp-empty-all { padding: 40px 20px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 10px; }
  .bp-foot { margin: 0; font-size: 12px; color: var(--text-muted); max-width: 80ch; }
  .bp-foot code { font-family: var(--mono); font-size: 11.5px; }
  .num { font-variant-numeric: tabular-nums; }

  @media (max-width: 900px) { .bp-two { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .bp-row { grid-template-columns: 80px minmax(0, 1fr); } .bp-row .bp-chip, .bp-age { display: none; } }
`;
