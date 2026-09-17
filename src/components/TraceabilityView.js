/**
 * Traceability Gaps — product intent, engineering work and support tickets
 * that don't point at each other.
 *
 * Three tabs, one per direction of the gap. Every row opens Jira in a new tab.
 * "Link in Jira" opens the engineering issue so a person can add the missing
 * link there — this app never writes to Jira.
 */

import { escapeHtml, escapeAttr } from '../utils/html.js';
import { updateQueryParams } from '../utils/router.js';
import { loadTraceability } from '../db/trace-queries.js';
import { PRODUCT_PROJECT_KEY, ENG_PROJECT_KEY } from '../product-config.js';
import logger from '../utils/logger.js';

const TABS = ['pdt', 'eng', 'tts'];
const PAGE = 20;

export class TraceabilityView {
  constructor(client, jiraDomain) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.isLoading = true;
    this.error = null;
    this.data = null;
    this.tab = 'pdt';
    this.includeBugs = false;
    this.includeParked = false;
    this.expanded = new Set();
    this._destroyed = false;
    this._loadSeq = 0;
  }

  get filters() {
    return { tab: this.tab, includeBugs: this.includeBugs, includeParked: this.includeParked };
  }

  /**
   * @param {object} [filters] - `{tab, includeBugs, includeParked}` or URL
   *   params `{tab, bugs, parked}` ('1' = on).
   */
  async load(filters = {}) {
    if (filters.tab && TABS.includes(filters.tab)) this.tab = filters.tab;
    if (typeof filters.includeBugs === 'boolean') this.includeBugs = filters.includeBugs;
    if (typeof filters.bugs === 'string') this.includeBugs = filters.bugs === '1';
    if (typeof filters.includeParked === 'boolean') this.includeParked = filters.includeParked;
    if (typeof filters.parked === 'string') this.includeParked = filters.parked === '1';

    const seq = ++this._loadSeq;
    this.isLoading = true;
    this.error = null;
    this.refresh();

    try {
      const data = await loadTraceability({ includeBugs: this.includeBugs, includeParked: this.includeParked });
      if (this._destroyed || seq !== this._loadSeq) return;
      this.data = data;
    } catch (error) {
      if (this._destroyed || seq !== this._loadSeq) return;
      logger.error('[Traceability] load failed:', error);
      this.error = error.message || 'Could not build the report';
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
    return `<div id="trace-view" class="tr-view">${this.renderInner()}</div>`;
  }

  refresh() {
    const root = document.getElementById('trace-view');
    if (!root) return;
    root.innerHTML = this.renderInner();
    this.bindEvents();
  }

  renderInner() {
    return `${this.renderHeader()}<div id="tr-body">${this.renderBody()}</div>`;
  }

  renderHeader() {
    const d = this.data;
    const count = n => (n === undefined ? '' : `<span class="tr-n num">${n}</span>`);
    const support = d?.tts.supportProject || 'TTS';
    const ttsGap = d ? d.tts.mentioned.length + d.tts.none.length : undefined;

    return `
      <div class="tr-header">
        <div>
          <h2 class="tr-title">Traceability Gaps</h2>
          <p class="tr-subtitle">Product intent, engineering work and support tickets that don't point at each other</p>
        </div>
        <div class="tr-tools">
          <button type="button" class="tr-toggle" id="tr-bugs-toggle" aria-pressed="${this.includeBugs}" title="Bugs rarely have a product parent; include them in the ${escapeAttr(ENG_PROJECT_KEY)} tab anyway"><i></i>Include bugs</button>
          <button type="button" class="tr-toggle" id="tr-parked-toggle" aria-pressed="${!this.includeParked}" title="Parked = customer is Archived, or the title starts with [Archived] [KIV] [On Hold] [WIP] [Duplicated]"><i></i>Hide parked</button>
        </div>
      </div>
      <div class="tr-tabs" role="tablist" aria-label="Gap type">
        <button type="button" class="tr-tab" role="tab" data-tab="pdt" aria-selected="${this.tab === 'pdt'}">${escapeHtml(PRODUCT_PROJECT_KEY)} cards with no engineering work ${count(d?.pdtWithoutEng.length)}</button>
        <button type="button" class="tr-tab" role="tab" data-tab="eng" aria-selected="${this.tab === 'eng'}">${escapeHtml(ENG_PROJECT_KEY)} work with no product parent ${count(d?.engWithoutPdt.length)}</button>
        <button type="button" class="tr-tab" role="tab" data-tab="tts" aria-selected="${this.tab === 'tts'}">${escapeHtml(support)} tickets not linked to engineering ${count(ttsGap)}</button>
      </div>
    `;
  }

  renderBody() {
    if (this.isLoading && !this.data) {
      return `<div class="loading-board"><div class="spinner"></div><p>Following the links…</p></div>`;
    }
    if (this.error) return `<div class="error-message" style="padding:20px">${escapeHtml(this.error)}</div>`;
    if (!this.data) return '';
    if (this.tab === 'eng') return this.renderEng();
    if (this.tab === 'tts') return this.renderTts();
    return this.renderPdt();
  }

  renderPdt() {
    const rows = this.data.pdtWithoutEng;
    return `
      <div class="tr-banner info">${escapeHtml(PRODUCT_PROJECT_KEY)} cards in Ready for Technical Specification, Ready for Development or Development Process with no linked ${escapeHtml(ENG_PROJECT_KEY)} issue and no ${escapeHtml(ENG_PROJECT_KEY)} child — agreed, but nobody is building it. Idlest first.</div>
      ${this.list('pdt', rows, r => this.row(r, `idle ${r.idleDays ?? '?'}d`, (r.idleDays ?? 0) >= 30), 'Every committed product card has engineering work behind it.')}`;
  }

  renderEng() {
    const d = this.data;
    return `
      <div class="tr-banner info">Open ${escapeHtml(ENG_PROJECT_KEY)} work with no epic parent, no link to a ${escapeHtml(PRODUCT_PROJECT_KEY)} card, and no ${escapeHtml(PRODUCT_PROJECT_KEY)} key in its title — built without, or before, a product decision. ${this.includeBugs ? 'Bugs included.' : 'Bugs are left out by default: they rarely need a product parent.'} Oldest first.</div>
      ${this.list('eng', d.engWithoutPdt, r => this.row(r, `${r.ageDays ?? '?'}d old`, (r.ageDays ?? 0) >= 180, true), 'Every open engineering item traces to a product card or an epic.')}`;
  }

  renderTts() {
    const t = this.data.tts;
    const support = t.supportProject;
    if (t.cached === 0 && t.uncachedMentions.length === 0) {
      return `<div class="tr-banner warn">No ${escapeHtml(support)} tickets in the cache yet. ${escapeHtml(support)} has no agile board, so it is fetched by JQL during sync — run a sync, then come back.</div>`;
    }

    const mentionRow = (m, ttsKey) => `
      <div class="tr-link2">
        <a class="tr-key" href="${escapeAttr(this.jiraUrl(ttsKey))}" target="_blank" rel="noopener">${escapeHtml(ttsKey)}</a>
        <span class="tr-arrow" aria-hidden="true">→</span>
        <a class="tr-key" href="${escapeAttr(this.jiraUrl(m.key))}" target="_blank" rel="noopener">${escapeHtml(m.key)}</a>
        <span class="tr-sum" title="${escapeAttr(m.summary)}">${escapeHtml(m.summary)}</span>
        ${m.status ? `<span class="tr-chip ${this.statusCls(m.status)}">${escapeHtml(m.status)}</span>` : ''}
        <a class="tr-act" href="${escapeAttr(this.jiraUrl(m.key))}" target="_blank" rel="noopener" title="Opens the engineering issue in Jira, where a person can add the link">Link in Jira ↗</a>
      </div>`;

    const mentioned = t.mentioned.flatMap(r => r.mentionedBy.map(m => mentionRow(m, r.key)));
    const uncached = t.uncachedMentions.flatMap(u => u.mentionedBy.map(m => mentionRow(m, u.key)));

    return `
      <p class="tr-summary"><b class="num">${t.linked.length}</b> of <b class="num">${t.cached}</b> open ${escapeHtml(support)} tickets are linked to ${escapeHtml(ENG_PROJECT_KEY)} in Jira.</p>

      <section class="tr-sec">
        <h3><span class="tr-chip warn">mentioned, not linked</span> Named in a ${escapeHtml(ENG_PROJECT_KEY)} title, no Jira issue link <span class="tr-n num">${mentioned.length}</span></h3>
        <div class="tr-banner warn">The relationship exists in someone's head and in the title text, but Jira doesn't know about it — so Jira's own reports, and the Customer Card Dashboard, can't follow it.</div>
        <div class="tr-rows">${mentioned.length ? mentioned.join('') : '<div class="tr-empty">No open ticket is cited in a title without also being linked.</div>'}</div>
      </section>

      <section class="tr-sec">
        <h3><span class="tr-chip bad">not connected</span> Open ${escapeHtml(support)} tickets with no ${escapeHtml(ENG_PROJECT_KEY)} link or mention <span class="tr-n num">${t.none.length}</span></h3>
        ${this.list('tts-none', t.none, r => this.row(r, `${r.ageDays ?? '?'}d open`, (r.ageDays ?? 0) >= 30, true), `Every open ${escapeHtml(support)} ticket is connected to engineering.`)}
      </section>

      ${uncached.length ? `
      <section class="tr-sec">
        <h3><span class="tr-chip dim">cited, not in cache</span> ${escapeHtml(support)} keys in ${escapeHtml(ENG_PROJECT_KEY)} titles that aren't cached <span class="tr-n num">${uncached.length}</span></h3>
        <div class="tr-banner info">Closed tickets, or ${escapeHtml(support)} hasn't been synced since these were filed. Still no Jira link either way.</div>
        <div class="tr-rows">${uncached.join('')}</div>
      </section>` : ''}
    `;
  }

  list(id, rows, rowFn, emptyText) {
    const showAll = this.expanded.has(id);
    const visible = showAll ? rows : rows.slice(0, PAGE);
    const more = rows.length - visible.length;
    return `
      <div class="tr-rows">
        ${rows.length ? visible.map(rowFn).join('') : `<div class="tr-empty">${escapeHtml(emptyText)}</div>`}
      </div>
      ${more > 0 ? `<button type="button" class="tr-more" data-more="${id}">Show ${more} more</button>` : ''}`;
  }

  row(r, ageText, ageIsBad, withType = false) {
    const parked = r.parked ? `<span class="tr-parked" title="Detected from the ${r.parked.source}">parked · ${escapeHtml(r.parked.value)}</span>` : '';
    return `
      <a class="tr-row${r.parked ? ' is-parked' : ''}" href="${escapeAttr(this.jiraUrl(r.key))}" target="_blank" rel="noopener" data-issue-key="${escapeAttr(r.key)}" title="${escapeAttr(r.summary || '')}">
        <span class="tr-key">${escapeHtml(r.key)}</span>
        <span class="tr-sum">${escapeHtml(r.summary || '')}${r.customer ? `<span class="tr-cust">· ${escapeHtml(r.customer)}</span>` : ''}${parked}</span>
        ${withType ? `<span class="tr-chip dim">${escapeHtml(r.issue_type || '')}</span>` : ''}
        <span class="tr-chip ${this.statusCls(r.status)}">${escapeHtml(r.status || '')}</span>
        <span class="tr-age num${ageIsBad ? ' bad' : ''}">${escapeHtml(ageText)}</span>
      </a>`;
  }

  // ── Events ───────────────────────────────────────────────────────────

  bindEvents() {
    const root = document.getElementById('trace-view');
    if (!root) return;

    root.querySelectorAll('.tr-tab').forEach(btn => btn.addEventListener('click', () => {
      this.tab = btn.dataset.tab;
      updateQueryParams({ tab: this.tab === 'pdt' ? null : this.tab });
      this.refresh();
    }));

    document.getElementById('tr-bugs-toggle')?.addEventListener('click', () => {
      this.includeBugs = !this.includeBugs;
      updateQueryParams({ bugs: this.includeBugs ? '1' : null });
      this.load();
    });

    document.getElementById('tr-parked-toggle')?.addEventListener('click', () => {
      this.includeParked = !this.includeParked;
      updateQueryParams({ parked: this.includeParked ? '1' : null });
      this.load();
    });

    root.querySelectorAll('.tr-more').forEach(btn => btn.addEventListener('click', () => {
      this.expanded.add(btn.dataset.more);
      this.refresh();
    }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  jiraUrl(key) {
    const site = String(this.jiraDomain || window.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return site ? `https://${site}/browse/${encodeURIComponent(key)}` : '#';
  }

  statusCls(s) {
    const v = String(s || '').toLowerCase();
    if (/delivered|released|tested\b|done/.test(v)) return 'ok';
    if (/test comments|test run failed/.test(v)) return 'bad';
    if (/^to do$|^plan$/.test(v)) return 'dim';
    if (/test|review|feedback|validation|quality|ready for/.test(v)) return 'warn';
    return 'info';
  }
}

export const TraceabilityViewStyles = `
  .tr-view { display: flex; flex-direction: column; gap: 14px; }
  .tr-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .tr-title { margin: 0; font-size: 21px; font-weight: 700; color: var(--text-h); letter-spacing: -0.015em; }
  .tr-subtitle { margin: 2px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .tr-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .tr-toggle { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  .tr-toggle i { width: 28px; height: 16px; border-radius: 999px; background: var(--border-strong); position: relative; transition: background var(--dur-fast); }
  .tr-toggle i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left var(--dur-fast); }
  .tr-toggle[aria-pressed="true"] i { background: var(--success); }
  .tr-toggle[aria-pressed="true"] i::after { left: 14px; }
  .tr-toggle:focus-visible, .tr-tab:focus-visible, .tr-more:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

  .tr-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .tr-tab { appearance: none; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
  .tr-tab[aria-selected="true"] { border-color: var(--primary-border); background: var(--primary-bg); color: var(--text-h); }
  .tr-n { padding: 0 7px; border-radius: 999px; background: var(--surface-sunken); color: var(--text-muted); font-size: 12px; font-weight: 600; }
  .tr-tab[aria-selected="true"] .tr-n { background: var(--primary); color: #fff; }

  .tr-banner { padding: 10px 12px; border-radius: 8px; font-size: 12.5px; border: 1px solid; color: var(--text); margin-bottom: 10px; max-width: 100ch; }
  .tr-banner.info { background: var(--info-bg); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
  .tr-banner.warn { background: var(--warning-bg); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .tr-summary { margin: 0; font-size: 13.5px; color: var(--text); }
  .tr-summary b { color: var(--text-h); }

  .tr-sec { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 12px 14px; }
  .tr-sec + .tr-sec { margin-top: 12px; }
  .tr-sec h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  .tr-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; text-transform: none; letter-spacing: 0; }
  .tr-chip.ok { background: var(--success-bg); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .tr-chip.warn { background: var(--warning-bg); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .tr-chip.bad { background: var(--danger-bg); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
  .tr-chip.info { background: var(--info-bg); color: var(--info); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
  .tr-chip.dim { background: var(--surface-sunken); color: var(--text-muted); border-color: var(--border); }

  .tr-rows { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
  .tr-sec .tr-rows { border: 0; border-radius: 0; background: none; }
  .tr-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--border-light); text-decoration: none; color: inherit; }
  .tr-row:last-child { border-bottom: 0; }
  .tr-row:hover { background: var(--hover); }
  .tr-row.is-parked { opacity: .6; }
  .tr-key { font-family: var(--mono); font-size: 12.5px; font-weight: 500; color: var(--text-h); white-space: nowrap; text-decoration: none; }
  .tr-sum { font-size: 13.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr-cust { color: var(--text-muted); font-size: 12px; margin-left: 6px; }
  .tr-parked { margin-left: 8px; font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
  .tr-age { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .tr-age.bad { color: var(--danger); font-weight: 600; }
  .tr-empty { padding: 20px 14px; color: var(--text-muted); font-size: 13px; }
  .tr-more { appearance: none; width: 100%; border: 0; border-top: 1px solid var(--border-light); background: var(--surface-raised); color: var(--primary); font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px; cursor: pointer; border-radius: 0 0 10px 10px; }

  .tr-link2 { display: grid; grid-template-columns: 88px 22px 100px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--border-light); }
  .tr-link2:last-child { border-bottom: 0; }
  .tr-arrow { color: var(--text-muted); text-align: center; }
  .tr-act { font-size: 12px; font-weight: 600; padding: 4px 9px; border-radius: 6px; border: 1px solid var(--primary-border); background: var(--primary-bg); color: var(--primary); white-space: nowrap; text-decoration: none; }
  .tr-act:hover { background: var(--hover); }
  .num { font-variant-numeric: tabular-nums; }

  @media (max-width: 720px) {
    .tr-row { grid-template-columns: 80px minmax(0, 1fr); } .tr-row .tr-chip, .tr-age { display: none; }
    .tr-link2 { grid-template-columns: 80px 18px 90px minmax(0, 1fr); } .tr-link2 .tr-chip, .tr-act { display: none; }
  }
`;
