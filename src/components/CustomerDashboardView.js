import { getCustomerCards } from '../db/product-queries.js';
import { hydrateEpics } from '../db/epic-hydrator.js';
import { CUSTOMER_BOARD_ID, ENG_PROJECT_KEY } from '../product-config.js';
import logger from '../utils/logger.js';
import { escapeHtml, escapeAttr } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

/**
 * Customer Card Dashboard — one full-width card per CUSTOMER CARD.
 *
 * Built from the Customer Testing Board (TSM2 issues of type "Customer", e.g.
 * TSM2-7612 "UOL Customer Card"), NOT from the Product Board. A customer card
 * represents a customer and links out to the work being tested for them, so the
 * Linked Issues section carries the same information as a product card's.
 */
export class CustomerDashboardView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.cards = null;
    this.allCards = [];
    this.filters = { customer: '', search: '' };
    this.isLoading = true;
    this.hasLoaded = false;
    this.error = null;
    this.boundHandler = null;
    this._searchTimer = null;
    // Epics already fetched this session, so a re-render does not refetch.
    this._hydratedEpics = new Set();
    this._destroyed = false;
    // The in-flight hydration, exposed so callers (and tests) can await it.
    // The dedupe set is marked before the fetch resolves, so a second call
    // would otherwise return immediately while the first is still landing.
    this._hydrating = Promise.resolve();
  }

  /**
   * Fill in epics the board sweep never cached, then re-read.
   *
   * Runs after first paint: an epic with no summary and no children is one that
   * sits on no board, so the local store simply has nothing for it. Bounded to
   * the epics on screen, and silent on failure — the view already rendered.
   */
  async hydrateVisibleEpics() {
    if (!this.client) return;

    const epics = (this.cards || [])
      .flatMap(c => c.linked_issues || [])
      .filter(l => l.is_epic && (!l.summary || !(l.children || []).length))
      .map(l => l.key);

    const filled = await hydrateEpics(this.client, epics, this._hydratedEpics);
    if (filled > 0 && !this._destroyed) {
      this.cards = await getCustomerCards(this.toQueryFilters());
      this.refresh();
    }
  }

  async load(filters = {}) {
    this.filters = { ...this.filters, ...filters };

    if (!this.hasLoaded) {
      this.isLoading = true;
      this.refresh();
    }

    try {
      // The unfiltered set drives the filter dropdown, so choosing a customer
      // does not empty the control that made the choice.
      const [cards, allCards] = await Promise.all([
        getCustomerCards(this.toQueryFilters()),
        this.hasLoaded ? Promise.resolve(this.allCards) : getCustomerCards()
      ]);
      this.cards = cards;
      this.allCards = allCards;
      this.isLoading = false;
      this.hasLoaded = true;
      this.refresh();

      this._hydrating = this.hydrateVisibleEpics()
        .catch(err => logger.debug('[CustomerDashboard] epic hydration failed:', err?.message));
    } catch (error) {
      logger.error('[CustomerDashboard] Failed to load:', error);
      this.error = error.message;
      this.isLoading = false;
      this.refresh();
    }
  }

  toQueryFilters() {
    const filters = {};
    if (this.filters.customer) filters.customer = this.filters.customer;
    if (this.filters.search) filters.search = this.filters.search;
    return filters;
  }

  refresh() {
    const el = document.getElementById('customer-dashboard-view');
    if (!el) return;

    const active = document.activeElement;
    const wasSearching = active && active.id === 'customer-search';
    const caret = wasSearching ? active.selectionStart : null;

    el.outerHTML = this.render();
    this.bindEvents();

    if (wasSearching) {
      const search = document.getElementById('customer-search');
      if (search) {
        search.focus();
        if (caret !== null) search.setSelectionRange(caret, caret);
      }
    }
  }

  render() {
    if (this.error) return this.renderError();

    // The wrapper must exist in the loading state too, or refresh() cannot find
    // the container once the async load resolves.
    if (this.isLoading) {
      return `
        <div class="customer-dashboard" id="customer-dashboard-view">
          <div class="loading-board"><div class="spinner"></div><p>Loading customer cards...</p></div>
        </div>
      `;
    }

    const cards = this.cards || [];
    const linked = cards.reduce((n, c) => n + (c.linked_issues?.length || 0), 0);

    return `
      <div class="customer-dashboard" id="customer-dashboard-view">
        <div class="view-header">
          <div class="view-header-left"><h2>Customer Card Dashboard</h2></div>
          <div class="view-header-right">
            <span class="cd-summary">
              ${cards.length} customer card${cards.length === 1 ? '' : 's'} · ${linked} linked issue${linked === 1 ? '' : 's'}
            </span>
            <a class="btn btn-sm" href="${escapeAttr(this.boardUrl())}" target="_blank" rel="noopener">
              Open board in Jira
            </a>
          </div>
        </div>
        ${this.renderFilters()}
        ${this.renderCards()}
      </div>
    `;
  }

  renderFilters() {
    const activeCount = Object.values(this.filters).filter(Boolean).length;
    const options = this.allCards.map(c => `
      <option value="${escapeAttr(c.key)}"${c.key === this.filters.customer ? ' selected' : ''}>
        ${escapeHtml(c.title)}
      </option>
    `).join('');

    return `
      <div class="product-filters">
        <div class="product-filter product-filter-search">
          <label for="customer-search">Search</label>
          <input type="search" id="customer-search"
                 placeholder="Card number, title, linked issues…"
                 value="${escapeAttr(this.filters.search)}" autocomplete="off">
        </div>
        <div class="product-filter">
          <label for="customer-filter">Customer</label>
          <select id="customer-filter">
            <option value="">All customers</option>
            ${options}
          </select>
        </div>
        ${activeCount > 0
          ? `<button class="btn btn-sm" id="customer-clear-filters">Clear filters (${activeCount})</button>`
          : ''}
      </div>
    `;
  }

  renderCards() {
    const cards = this.cards || [];
    if (cards.length === 0) {
      const filtered = Object.values(this.filters).some(Boolean);
      return `
        <div class="empty-state">
          <h3>${filtered ? 'No customer cards match these filters' : 'No customer cards found'}</h3>
          <p class="empty-hint">
            ${filtered
              ? 'Try clearing a filter to widen the results.'
              : `Customer cards are ${escapeHtml(ENG_PROJECT_KEY)} issues of type "Customer". Run a sync to pull them in.`}
          </p>
        </div>
      `;
    }
    return `<div class="cd-cards">${cards.map(c => this.renderCard(c)).join('')}</div>`;
  }

  renderCard(card) {
    const linked = card.linked_issues || [];

    return `
      <section class="cd-card">
        <header class="cd-card-header">
          <a class="cd-card-key" href="${escapeAttr(this.jiraUrl(card.key))}"
             target="_blank" rel="noopener">${escapeHtml(card.key)}</a>
          <h3 class="cd-card-name">${escapeHtml(card.title)}</h3>
          ${card.priority ? `<span class="cd-chip">${escapeHtml(card.priority)}</span>` : ''}
          <span class="cd-chip cd-chip-status">${escapeHtml(card.status || '—')}</span>
          <span class="cd-card-meta">
            <span class="cd-label">Assignee</span> ${escapeHtml(card.assignee_name || 'Unassigned')}
            ${card.updated_at
              ? `<span class="cd-label cd-label-gap">Updated</span> ${escapeHtml(formatDate(card.updated_at) || '')}`
              : ''}
          </span>
        </header>

        <div class="cd-links-block">
          <div class="cd-links-head">
            <span class="cd-label">Linked Issues</span>
            <span class="cd-links-count">${linked.length}</span>
          </div>
          ${linked.length
            ? `<div class="cd-links">${linked.map(l => this.renderLink(l)).join('')}</div>`
            : '<span class="cd-muted">None</span>'}
        </div>
      </section>
    `;
  }

  /**
   * One linked issue. The whole row is the link, so anywhere in it opens Jira.
   *
   * An epic renders its child work items indented beneath it, inside the same
   * bordered group, so it reads as "these belong to that" rather than as a flat
   * list of unrelated keys.
   */
  renderLink(link) {
    const children = link.children || [];

    return `
      <div class="cd-link-group${link.is_epic ? ' cd-link-group-epic' : ''}">
        ${this.renderRow(link, { epic: link.is_epic })}
        ${children.length
          ? `<div class="cd-children">
               <div class="cd-children-head">
                 <span class="cd-children-label">↳ ${children.length} child work item${children.length === 1 ? '' : 's'} in ${escapeHtml(link.key)}</span>
               </div>
               ${children.map(c => this.renderRow(c, { child: true })).join('')}
             </div>`
          : ''}
      </div>
    `;
  }

  /**
   * A single clickable row — used for both linked issues and epic children.
   *
   * @param {object} issue
   * @param {object} [opts] - { epic, child }
   */
  renderRow(issue, opts = {}) {
    const chip = issue.type_chip;
    const cls = [
      'cd-link',
      opts.child ? 'cd-link-child' : '',
      opts.epic ? 'cd-link-is-epic' : ''
    ].filter(Boolean).join(' ');

    return `
      <a class="${cls}" href="${escapeAttr(this.jiraUrl(issue.key))}"
         target="_blank" rel="noopener" title="${escapeAttr(issue.summary || issue.key)}">
        <span class="cd-link-key${opts.epic ? ' cd-link-epic' : ''}${chip?.tone === 'customer' ? ' cd-link-customer' : ''}">${opts.epic ? '⚡ ' : ''}${escapeHtml(issue.key)}</span>
        <span class="cd-link-summary${issue.summary ? '' : ' cd-muted'}">${escapeHtml(issue.summary || 'Loading from Jira…')}</span>
        ${chip
          ? `<span class="cd-link-status cd-cat-${escapeAttr(chip.tone)}"
                   title="${escapeAttr(issue.status ? `${issue.issue_type} — ${issue.status}` : issue.issue_type || '')}">${escapeHtml(chip.label)}</span>`
          : issue.status
            ? `<span class="cd-link-status cd-cat-${escapeAttr(this.categoryClass(issue.status_category))}">${escapeHtml(issue.status)}</span>`
            : issue.issue_type
              ? `<span class="cd-link-status cd-cat-type">${escapeHtml(issue.issue_type)}</span>`
              : '<span class="cd-link-status cd-cat-unknown">Not synced</span>'}
        <span class="cd-link-who">${issue.assignee_name ? escapeHtml(issue.assignee_name) : ''}</span>
      </a>
    `;
  }

  /** Matches the Product Board's colour mapping, on status CATEGORY. */
  categoryClass(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('done') || c.includes('complete')) return 'done';
    if (c.includes('progress') || c.includes('indeterminate')) return 'progress';
    if (c.includes('to do') || c.includes('new')) return 'todo';
    return 'unknown';
  }

  site() {
    return String(this.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  jiraUrl(issueKey) {
    const site = this.site();
    if (!site || !issueKey) return '#';
    return `https://${site}/browse/${encodeURIComponent(issueKey)}`;
  }

  /** The Customer Testing Board this view mirrors. */
  boardUrl() {
    const site = this.site();
    if (!site) return '#';
    return `https://${site}/jira/software/c/projects/${ENG_PROJECT_KEY}/boards/${CUSTOMER_BOARD_ID}`;
  }

  renderError() {
    return `
      <div class="customer-dashboard" id="customer-dashboard-view">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load the customer card dashboard</h3>
          <p>${escapeHtml(this.error || 'Unknown error')}</p>
          <button class="btn btn-primary retry-btn" id="customer-retry-btn">Retry</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const root = document.getElementById('customer-dashboard-view');
    if (!root) return;

    this.boundHandler = (e) => {
      if (e.target.closest('#customer-retry-btn')) {
        this.error = null;
        this.load().catch(err => logger.error('[CustomerDashboard] retry failed:', err));
        return;
      }
      if (e.target.closest('#customer-clear-filters')) {
        this.filters = { customer: '', search: '' };
        this.load().catch(err => logger.error('[CustomerDashboard] clear failed:', err));
      }
    };
    root.addEventListener('click', this.boundHandler);

    document.getElementById('customer-filter')?.addEventListener('change', (e) => {
      this.filters.customer = e.target.value;
      this.load().catch(err => logger.error('[CustomerDashboard] filter failed:', err));
    });

    const search = document.getElementById('customer-search');
    if (search) {
      search.addEventListener('input', (e) => {
        this.filters.search = e.target.value;
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
          this.load().catch(err => logger.error('[CustomerDashboard] search failed:', err));
        }, 180);
      });
    }
  }

  destroy() {
    this._destroyed = true;
    const root = document.getElementById('customer-dashboard-view');
    if (root && this.boundHandler) root.removeEventListener('click', this.boundHandler);
    this.boundHandler = null;
    clearTimeout(this._searchTimer);
  }
}

export const CustomerDashboardViewStyles = `
.customer-dashboard { display: flex; flex-direction: column; gap: var(--space-lg); }
.cd-summary { font-size: 15px; color: var(--text-muted); margin-right: var(--space-md); }

/* One full-width card per customer, stacked down the page. */
.cd-cards { display: flex; flex-direction: column; gap: var(--space-lg); }
.cd-card {
  border: 1px solid var(--border);
  border-left: 4px solid var(--info);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}
.cd-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
  background: var(--surface-sunken);
}
.cd-card-key {
  font-family: var(--mono, monospace);
  font-size: 14.5px;
  font-weight: 700;
  color: var(--info);
  text-decoration: none;
}
.cd-card-key:hover { text-decoration: underline; }
.cd-card-name { margin: 0; font-size: 19px; }
.cd-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-size: 13px;
  white-space: nowrap;
}
.cd-card-meta { margin-left: auto; font-size: 14px; color: var(--text); white-space: nowrap; }
.cd-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  margin-right: 3px;
}
.cd-label-gap { margin-left: var(--space-md); }

.cd-links-block { padding: var(--space-md) var(--space-lg); }
.cd-links-head { display: flex; align-items: center; gap: 6px; margin-bottom: var(--space-sm); }
.cd-links-count {
  padding: 0 7px;
  border-radius: 9px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 700;
}
.cd-links { display: flex; flex-direction: column; gap: 6px; }
.cd-link-group { display: flex; flex-direction: column; }
/* An epic and its children read as one unit. */
.cd-link-group-epic {
  border: 1px solid var(--warning);
  border-radius: var(--radius-sm);
  background: var(--warning-bg);
  padding: 4px 6px;
}
.cd-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-sm);
  padding: 5px 6px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.cd-link:hover { background: var(--hover); }
.cd-link:hover .cd-link-summary { text-decoration: underline; }
.cd-link:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.cd-children {
  display: flex;
  flex-direction: column;
  margin-left: var(--space-md);
  padding-left: var(--space-md);
  /* A rail down the left makes the parent/child relationship unmistakable. */
  border-left: 2px solid var(--warning);
}
.cd-children-head { padding: 3px 6px 1px; }
.cd-children-label {
  font-size: 12.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--warning);
}
.cd-link-child { font-size: 13.5px; }
.cd-link-child .cd-link-key { background: transparent; }
@media (max-width: 800px) {
  .cd-link { grid-template-columns: auto minmax(0, 1fr); }
  .cd-card-meta { margin-left: 0; }
}
.cd-link-key {
  font-family: var(--mono, monospace);
  font-size: 13.5px;
  padding: 0 5px;
  border-radius: 6px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
}
.cd-link-key:hover { text-decoration: underline; }
.cd-link-epic { border: 2px solid var(--warning); color: var(--warning); font-weight: 700; }
.cd-link-customer { border: 2px solid var(--info); color: var(--info); font-weight: 700; }
.cd-link-summary { color: var(--text); overflow-wrap: anywhere; }
.cd-link-status {
  padding: 0 7px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.cd-cat-todo { background: var(--surface-sunken); color: var(--text-muted); }
.cd-cat-progress { background: var(--info-bg); color: var(--info); }
.cd-cat-done { background: var(--success-bg); color: var(--success); }
.cd-cat-epic { background: var(--warning-bg); color: var(--warning); letter-spacing: 0.05em; font-weight: 700; }
.cd-cat-customer { background: var(--info-bg); color: var(--info); letter-spacing: 0.05em; font-weight: 700; }
.cd-cat-type { background: var(--warning-bg); color: var(--warning); text-transform: uppercase; font-size: 12px; }
.cd-cat-unknown { color: var(--text-muted); font-style: italic; font-weight: 400; }
.cd-link-who { color: var(--text-muted); white-space: nowrap; }
.cd-muted { color: var(--text-muted); font-size: 14px; }
`;
