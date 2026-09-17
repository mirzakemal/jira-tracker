/**
 * Product Radar — what only a product manager can unblock this week.
 *
 * Five signals from db/radar-queries.js, each a real queue:
 * decisions waiting on product, high-priority work gone stale, rework,
 * inflow vs outflow per team area, and customers with open urgent work.
 *
 * Read-only against Jira. Every row opens the issue in a new tab; the triage
 * chips (reviewed / needs decision / parked) are stored in this browser only,
 * and "parked" drops a card off the radar — the answer to "some cards are
 * untouched on purpose".
 */

import { escapeHtml, escapeAttr } from '../utils/html.js';
import { updateQueryParams } from '../utils/router.js';
import { loadRadar, setTriage, TRIAGE_STATES } from '../db/radar-queries.js';
import { TEAM_AREAS, TEAM_AREA_ORDER } from '../utils/team-area.js';
import { PRODUCT_PROJECT_KEY, ENG_PROJECT_KEY } from '../product-config.js';
import logger from '../utils/logger.js';

/** Rows shown before "show all" in the longer lists. */
const PAGE = 15;

const TRIAGE_UI = {
  reviewed: { glyph: '✓', title: 'Mark reviewed (this browser only)' },
  decision: { glyph: '?', title: 'Needs a product decision (this browser only)' },
  parked: { glyph: '⏸', title: 'Park — drops off the radar (this browser only)' }
};

export class ProductRadarView {
  constructor(client, jiraDomain) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.data = null;
    this.area = 'all';
    this.includeParked = false;
    this.expanded = new Set(); // sections showing every row
    this._destroyed = false;
    this._loadSeq = 0;
  }

  /** Current filters, in the shape load() accepts — read by the app on refresh. */
  get filters() {
    return { area: this.area, includeParked: this.includeParked };
  }

  /**
   * @param {object} [filters] - `{area, includeParked}` from the app, or URL
   *   params `{area, parked}` where parked is '1'.
   */
  async load(filters = {}) {
    if (filters.area && (filters.area === 'all' || TEAM_AREAS[filters.area])) this.area = filters.area;
    if (typeof filters.includeParked === 'boolean') this.includeParked = filters.includeParked;
    if (typeof filters.parked === 'string') this.includeParked = filters.parked === '1';

    const seq = ++this._loadSeq;
    this.isLoading = true;
    this.error = null;
    this.refresh();

    try {
      const data = await loadRadar({ area: this.area, includeParked: this.includeParked });
      if (this._destroyed || seq !== this._loadSeq) return;
      this.data = data;
    } catch (error) {
      if (this._destroyed || seq !== this._loadSeq) return;
      logger.error('[Radar] load failed:', error);
      this.error = error.message || 'Could not build the radar';
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
    return `
      <div id="radar-view" class="radar-view">
        ${this.renderHeader()}
        <div id="radar-body">${this.renderBody()}</div>
      </div>
    `;
  }

  refresh() {
    const root = document.getElementById('radar-view');
    if (!root) return;
    root.innerHTML = `${this.renderHeader()}<div id="radar-body">${this.renderBody()}</div>`;
    this.bindEvents();
  }

  renderHeader() {
    const areaBtn = (key, label, description) => `
      <button type="button" class="radar-seg-btn" data-area="${key}"
              aria-pressed="${this.area === key}" title="${escapeAttr(description)}">${escapeHtml(label)}</button>`;
    const parkedN = this.data?.parkedCount || 0;

    return `
      <div class="radar-header">
        <div>
          <h2 class="radar-title">Product Radar</h2>
          <p class="radar-subtitle">What only a product manager can unblock this week</p>
        </div>
        <div class="radar-tools">
          <div class="radar-seg" role="group" aria-label="Team area">
            ${areaBtn('all', 'All', 'Every team area')}
            ${TEAM_AREA_ORDER.map(k => areaBtn(k, TEAM_AREAS[k].label, TEAM_AREAS[k].description)).join('')}
          </div>
          <button type="button" class="radar-toggle" id="radar-parked-toggle" aria-pressed="${!this.includeParked}"
                  title="Parked = customer is Archived, or the title starts with [Archived] [KIV] [On Hold] [WIP] [Duplicated], or you parked it here">
            <i></i>Hide parked${parkedN ? ` <span class="num">(${parkedN})</span>` : ''}
          </button>
        </div>
      </div>
    `;
  }

  renderBody() {
    if (this.isLoading && !this.data) {
      return `<div class="loading-board"><div class="spinner"></div><p>Building the radar…</p></div>`;
    }
    if (this.error) {
      return `<div class="error-message" style="padding:20px">${escapeHtml(this.error)}</div>`;
    }
    const d = this.data;
    if (!d) return '';

    const total = d.flow.total;
    const oldestHot = d.hot.length ? Math.max(...d.hot.map(r => r.ageDays ?? 0)) : 0;

    return `
      <div class="radar-tiles">
        ${this.tile('Decisions waiting', d.decisions.length, `${PRODUCT_PROJECT_KEY} in Plan · Feedback · Validation`, d.decisions.length ? 'warm' : '')}
        ${this.tile(`High priority > ${d.thresholds.HIGH_PRIORITY_AGE_DAYS}d`, d.hot.length, d.hot.length ? `oldest ${oldestHot} days` : 'nothing stale', d.hot.length ? 'hot' : '')}
        ${this.tile('In rework', d.rework.count, 'Test Comments · Test Run Failed', d.rework.count ? 'hot' : '')}
        ${this.tile(`In / out · ${d.thresholds.FLOW_WINDOW_DAYS}d`, `${total.created} <small>in</small> ${total.completed} <small>out</small>`, total.created > total.completed ? `backlog +${total.created - total.completed}` : 'keeping up', total.created > total.completed ? 'warm' : '', true)}
      </div>

      ${this.section('decisions', 'Decisions waiting on product', `${d.decisions.length}`, 'warn',
        `${PRODUCT_PROJECT_KEY} cards in Plan, Feedback or Validation — engineering can't start until these move. Idlest first.`,
        d.decisions, r => this.row(r, `idle ${r.idleDays ?? '?'}d`, (r.idleDays ?? 0) >= 60), 'Nothing waiting on a decision in this area.')}

      ${this.section('hot', `High priority, still open after ${d.thresholds.HIGH_PRIORITY_AGE_DAYS} days`, `${d.hot.length}`, 'bad',
        'Highest / High that has aged past a month. Either it isn\'t really that priority, or it\'s stuck — both are a PM call. Oldest first.',
        d.hot, r => this.row(r, `${r.ageDays}d old · idle ${r.idleDays ?? '?'}d`, (r.ageDays ?? 0) >= 180), 'No stale high-priority work in this area.')}

      ${this.section('rework', 'Rework', `${d.rework.count} bounced back`, d.rework.count ? 'bad' : 'ok',
        `Cards QA sent back (Test Comments / Test Run Failed). A cluster in one area usually means the spec was unclear, not that the code was bad. Listing the high-priority ones; the count is all priorities.`,
        d.rework.high, r => this.row(r, `${r.ageDays}d old`, false), d.rework.count ? 'None of the bounced cards is High or Highest.' : 'Nothing bounced back in this area.')}

      ${this.renderFlow(d)}
      ${this.renderCustomers(d)}

      <p class="radar-foot">
        Completion is derived from Jira's status category, not its resolution — ${ENG_PROJECT_KEY} never sets one. Team areas are inferred from titles and issue types (nothing in Jira records them); tune the rule in <code>utils/team-area.js</code>.
      </p>
    `;
  }

  tile(label, value, foot, tone = '', raw = false) {
    return `
      <div class="radar-tile ${tone}">
        <div class="radar-tile-l">${escapeHtml(label)}</div>
        <div class="radar-tile-v num">${raw ? value : escapeHtml(String(value))}</div>
        <div class="radar-tile-f">${escapeHtml(foot)}</div>
      </div>`;
  }

  section(id, title, badge, tone, why, rows, rowFn, emptyText) {
    const showAll = this.expanded.has(id);
    const visible = showAll ? rows : rows.slice(0, PAGE);
    const more = rows.length - visible.length;
    return `
      <section class="radar-sec" data-sec="${id}">
        <div class="radar-sec-h">
          <h3>${escapeHtml(title)} <span class="radar-chip ${tone}">${escapeHtml(badge)}</span></h3>
          <p class="radar-why">${escapeHtml(why)}</p>
        </div>
        <div class="radar-rows">
          ${rows.length ? visible.map(rowFn).join('') : `<div class="radar-empty">${escapeHtml(emptyText)}</div>`}
        </div>
        ${more > 0 ? `<button type="button" class="radar-more" data-more="${id}">Show ${more} more</button>` : ''}
      </section>`;
  }

  row(r, ageText, ageIsBad) {
    const setAside = r.parked || r.triage === 'parked';
    const parkedNote = r.parked
      ? `<span class="radar-parked-note" title="Detected from the ${r.parked.source}">parked · ${escapeHtml(r.parked.value)}</span>`
      : (r.triage === 'parked' ? '<span class="radar-parked-note">parked · by you</span>' : '');
    const customer = r.customer ? `<span class="radar-cust">· ${escapeHtml(r.customer)}</span>` : '';
    const area = TEAM_AREAS[r.area]?.label || '';

    return `
      <div class="radar-row${setAside ? ' is-parked' : ''}" data-issue-key="${escapeAttr(r.key)}">
        <a class="radar-link" href="${escapeAttr(this.jiraUrl(r.key))}" target="_blank" rel="noopener" title="${escapeAttr(r.summary || '')}">
          <span class="radar-key"><span class="radar-pri ${this.priCls(r.priority)}"></span>${escapeHtml(r.key)}</span>
          <span class="radar-sum">${escapeHtml(r.summary || '')}${customer}${parkedNote}</span>
          <span class="radar-chip ${this.statusCls(r.status)}">${escapeHtml(r.status || '')}</span>
          <span class="radar-area" title="Team area (inferred)">${escapeHtml(area)}</span>
          <span class="radar-age${ageIsBad ? ' bad' : ''} num">${escapeHtml(ageText)}</span>
        </a>
        <span class="radar-triage" data-key="${escapeAttr(r.key)}" role="group" aria-label="Triage">
          ${TRIAGE_STATES.map(s => `
            <button type="button" class="radar-tri${s === 'parked' ? ' p' : ''}" data-state="${s}"
                    aria-pressed="${r.triage === s}" title="${TRIAGE_UI[s].title}">${TRIAGE_UI[s].glyph}</button>`).join('')}
        </span>
      </div>`;
  }

  renderFlow(d) {
    const stateChip = s => ({
      starved: '<span class="radar-chip bad">starved</span>',
      growing: '<span class="radar-chip warn">growing</span>',
      'keeping-up': '<span class="radar-chip ok">keeping up</span>',
      quiet: '<span class="radar-chip dim">quiet</span>'
    })[s] || '';

    const cols = TEAM_AREA_ORDER.map(k => {
      const f = d.flow[k];
      const sum = f.created + f.completed || 1;
      const dim = this.area !== 'all' && this.area !== k;
      return `
        <div class="radar-flow-col${dim ? ' dim' : ''}">
          <h4>${escapeHtml(TEAM_AREAS[k].label)} ${stateChip(f.state)}</h4>
          <p class="radar-flow-def">${escapeHtml(TEAM_AREAS[k].description)}</p>
          <div class="radar-flow-bar"><i class="in" style="width:${(f.created / sum) * 100}%"></i><i class="out" style="width:${(f.completed / sum) * 100}%"></i></div>
          <div class="radar-kv"><span>Created</span><b class="num">${f.created}</b></div>
          <div class="radar-kv"><span>Completed</span><b class="num">${f.completed}</b></div>
          <div class="radar-kv"><span>Open now</span><b class="num">${f.open}</b></div>
        </div>`;
    }).join('');

    return `
      <section class="radar-sec">
        <div class="radar-sec-h">
          <h3>Inflow vs outflow, by team area <span class="radar-chip dim">${d.thresholds.FLOW_WINDOW_DAYS} days · ${escapeHtml(ENG_PROJECT_KEY)}</span></h3>
          <p class="radar-why">"Starved" = completing under ${Math.round(d.thresholds.STARVED_RATIO * 100)}% of what arrives. Orange is created, green is completed.</p>
        </div>
        <div class="radar-flow">${cols}</div>
      </section>`;
  }

  renderCustomers(d) {
    const chips = d.customers.length
      ? d.customers.map(c => `
          <span class="radar-cchip" title="${escapeAttr(c.keys.join(', '))}">${escapeHtml(c.name)} <b class="num">${c.count}</b><small>oldest ${c.oldestDays}d</small></span>`).join('')
      : '<div class="radar-empty">No named customer has stale high-priority work in this area.</div>';

    return `
      <section class="radar-sec">
        <div class="radar-sec-h">
          <h3>Customers with open High / Highest work</h3>
          <p class="radar-why">From the customer field on the cards above. Values that aren't customers (internal, productionFix, Archived) are left out.</p>
        </div>
        <div class="radar-custs">${chips}</div>
      </section>`;
  }

  // ── Events ───────────────────────────────────────────────────────────

  bindEvents() {
    const root = document.getElementById('radar-view');
    if (!root) return;

    root.querySelectorAll('.radar-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.area = btn.dataset.area;
        updateQueryParams({ area: this.area === 'all' ? null : this.area });
        this.load();
      });
    });

    document.getElementById('radar-parked-toggle')?.addEventListener('click', () => {
      this.includeParked = !this.includeParked;
      updateQueryParams({ parked: this.includeParked ? '1' : null });
      this.load();
    });

    root.querySelectorAll('.radar-more').forEach(btn => {
      btn.addEventListener('click', () => {
        this.expanded.add(btn.dataset.more);
        this.refresh();
      });
    });

    root.querySelectorAll('.radar-tri').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = btn.closest('.radar-triage')?.dataset.key;
        const state = btn.dataset.state;
        if (!key) return;
        const next = btn.getAttribute('aria-pressed') === 'true' ? null : state;
        try {
          await setTriage(key, next);
          await this.load();
        } catch (error) {
          logger.error('[Radar] triage failed:', error);
        }
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  jiraUrl(key) {
    const site = String(this.jiraDomain || window.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return site ? `https://${site}/browse/${encodeURIComponent(key)}` : '#';
  }

  priCls(p) {
    const v = String(p || '').toLowerCase();
    return v === 'highest' ? 'h' : v === 'high' ? 'hi' : (v === 'low' || v === 'lowest') ? 'lo' : '';
  }

  statusCls(s) {
    const v = String(s || '').toLowerCase();
    if (/delivered|released|tested\b/.test(v)) return 'ok';
    if (/test comments|test run failed/.test(v)) return 'bad';
    if (/^to do$|^plan$/.test(v)) return 'dim';
    if (/test|review|feedback|validation|quality/.test(v)) return 'warn';
    return 'info';
  }
}

export const ProductRadarViewStyles = `
  .radar-view { display: flex; flex-direction: column; gap: 16px; }
  .radar-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .radar-title { margin: 0; font-size: 21px; font-weight: 700; color: var(--text-h); letter-spacing: -0.015em; }
  .radar-subtitle { margin: 2px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .radar-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .radar-seg { display: inline-flex; padding: 3px; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: 8px; }
  .radar-seg-btn { appearance: none; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
  .radar-seg-btn[aria-pressed="true"] { background: var(--surface); color: var(--text-h); box-shadow: var(--shadow-xs); }
  .radar-seg-btn:focus-visible, .radar-toggle:focus-visible, .radar-tri:focus-visible, .radar-more:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

  .radar-toggle { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  .radar-toggle i { width: 28px; height: 16px; border-radius: 999px; background: var(--border-strong); position: relative; transition: background var(--dur-fast); }
  .radar-toggle i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left var(--dur-fast); }
  .radar-toggle[aria-pressed="true"] i { background: var(--success); }
  .radar-toggle[aria-pressed="true"] i::after { left: 14px; }

  .radar-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .radar-tile { padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  .radar-tile-l { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
  .radar-tile-v { font-size: 24px; font-weight: 700; color: var(--text-h); margin-top: 2px; letter-spacing: -0.02em; }
  .radar-tile-v small { font-size: 12.5px; font-weight: 500; color: var(--text-muted); margin: 0 4px 0 2px; }
  .radar-tile-f { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
  .radar-tile.hot .radar-tile-v { color: var(--danger); }
  .radar-tile.warm .radar-tile-v { color: var(--warning); }

  .radar-sec { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  .radar-sec-h { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .radar-sec-h h3 { margin: 0; font-size: 14.5px; color: var(--text-h); display: flex; gap: 8px; align-items: center; }
  .radar-why { margin: 0; font-size: 12.5px; color: var(--text-muted); max-width: 64ch; }

  .radar-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
  .radar-chip.ok { background: var(--success-bg); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .radar-chip.warn { background: var(--warning-bg); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .radar-chip.bad { background: var(--danger-bg); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
  .radar-chip.info { background: var(--info-bg); color: var(--info); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
  .radar-chip.dim { background: var(--surface-sunken); color: var(--text-muted); border-color: var(--border); }

  .radar-rows { display: flex; flex-direction: column; }
  .radar-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 14px 0 0; border-bottom: 1px solid var(--border-light); }
  .radar-row:last-child { border-bottom: 0; }
  .radar-row:hover { background: var(--hover); }
  .radar-row.is-parked { opacity: .6; }
  .radar-row.is-parked .radar-sum { text-decoration: line-through; text-decoration-color: var(--border-strong); }
  .radar-link { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; padding: 9px 14px; text-decoration: none; color: inherit; min-width: 0; }
  .radar-key { font-family: var(--mono); font-size: 12.5px; font-weight: 500; color: var(--text-h); white-space: nowrap; }
  .radar-pri { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--text-muted); }
  .radar-pri.h { background: var(--danger); } .radar-pri.hi { background: var(--warning); } .radar-pri.lo { background: var(--info); }
  .radar-sum { font-size: 13.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .radar-cust { color: var(--text-muted); font-size: 12px; margin-left: 6px; }
  .radar-parked-note { margin-left: 8px; font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-decoration: none; display: inline-block; }
  .radar-area { font-size: 11.5px; font-weight: 600; color: var(--primary); background: var(--primary-bg); border: 1px solid var(--primary-border); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
  .radar-age { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .radar-age.bad { color: var(--danger); font-weight: 600; }

  .radar-triage { display: inline-flex; gap: 3px; }
  .radar-tri { appearance: none; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 600; width: 26px; height: 22px; border-radius: 5px; cursor: pointer; display: grid; place-items: center; }
  .radar-tri:hover { background: var(--hover); color: var(--text-h); }
  .radar-tri[aria-pressed="true"] { background: var(--primary-bg); border-color: var(--primary-border); color: var(--primary); }
  .radar-tri.p[aria-pressed="true"] { background: var(--surface-sunken); border-color: var(--border-strong); color: var(--text); }

  .radar-empty { padding: 20px 14px; color: var(--text-muted); font-size: 13px; }
  .radar-more { appearance: none; width: 100%; border: 0; border-top: 1px solid var(--border-light); background: var(--surface-raised); color: var(--primary); font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px; cursor: pointer; border-radius: 0 0 10px 10px; }
  .radar-more:hover { background: var(--hover); }

  .radar-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px 14px; }
  .radar-flow-col { border: 1px solid var(--border); border-radius: 9px; padding: 11px 12px; background: var(--surface-raised); }
  .radar-flow-col.dim { opacity: .45; }
  .radar-flow-col h4 { margin: 0; font-size: 13.5px; color: var(--text-h); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .radar-flow-def { font-size: 12px; color: var(--text-muted); margin: 2px 0 8px; min-height: 2.6em; }
  .radar-flow-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-sunken); margin: 8px 0 4px; }
  .radar-flow-bar i { display: block; height: 100%; }
  .radar-flow-bar .in { background: var(--warning); } .radar-flow-bar .out { background: var(--success); }
  .radar-kv { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; border-top: 1px dashed var(--border-light); }
  .radar-kv b { color: var(--text-h); }

  .radar-custs { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 14px; }
  .radar-cchip { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-raised); font-size: 12.5px; color: var(--text-h); font-weight: 500; }
  .radar-cchip b { font-family: var(--mono); font-weight: 500; color: var(--danger); }
  .radar-cchip small { font-size: 11.5px; color: var(--text-muted); }

  .radar-foot { margin: 0; font-size: 12px; color: var(--text-muted); max-width: 80ch; }
  .radar-foot code { font-family: var(--mono); font-size: 11.5px; }
  .num { font-variant-numeric: tabular-nums; }

  @media (max-width: 900px) { .radar-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .radar-flow { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .radar-link { grid-template-columns: 80px minmax(0, 1fr); } .radar-link .radar-chip, .radar-area, .radar-age { display: none; } }
`;
