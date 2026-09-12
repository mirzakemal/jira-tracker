import {
  getProductCards,
  getProductBoardFilterOptions,
  getEngDerivedStatus,
  acknowledgeMilestone,
  setDocStatus,
  needsDocumentation
} from '../db/product-queries.js';
import { getAllProjects } from '../db/queries.js';
import { buildHandoff, buildCreateDocUrl } from '../utils/product-handoff.js';
import {
  BOARD_IDS,
  DOC_STATUSES,
  docStatus,
  PRODUCT_STATUSES,
  STATUS_CATEGORIES,
  PRODUCT_PROJECT_KEY
} from '../product-config.js';
import logger from '../utils/logger.js';
import { escapeHtml, escapeAttr } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

/**
 * Product Board view — the dual-board dashboard.
 *
 * Reads entirely from the local `product_cards` store, which `product-sync.js`
 * reconciles after each Jira sync. No network calls, no Jira writes: the
 * "New Product Card" button hands off to Jira's own create screen.
 */
export class ProductBoardView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.cards = null;
    this.options = { customers: [], reporters: [], priorities: [] };
    this.projects = [];
    this.filters = { customer: '', priority: '', reporter: '', search: '' };
    this.isLoading = true;
    this.error = null;
    this.boundHandler = null;
    this.hasLoaded = false;
  }

  async load(filters = {}) {
    this.filters = { ...this.filters, ...filters };

    // Only show the full-board spinner on the FIRST load. A filter or search
    // refresh must leave the board in place: swapping in the loading state
    // destroys the search box the user is typing into and flashes the whole
    // column layout on every keystroke.
    if (!this.hasLoaded) {
      this.isLoading = true;
      this.refresh();
    }

    try {
      const [cards, options, projects] = await Promise.all([
        getProductCards(this.toQueryFilters()),
        getProductBoardFilterOptions(),
        getAllProjects()
      ]);
      this.cards = cards;
      this.options = options;
      this.projects = projects;
      this.isLoading = false;
      this.hasLoaded = true;
      this.refresh();
    } catch (error) {
      logger.error('[ProductBoard] Failed to load:', error);
      this.error = error.message;
      this.isLoading = false;
      this.refresh();
    }
  }

  /** Map the UI's single-select filters onto the query layer's shape. */
  toQueryFilters() {
    const filters = {};
    if (this.filters.customer) filters.customer = this.filters.customer;
    if (this.filters.priority) filters.priority = this.filters.priority;
    if (this.filters.reporter) filters.reporter = this.filters.reporter;
    if (this.filters.search) filters.search = this.filters.search;
    return filters;
  }

  refresh() {
    const el = document.getElementById('product-board-view');
    if (!el) return;

    // The whole view is re-rendered, which would blow away the search box the
    // user is typing into. Restore focus and caret afterwards.
    const active = document.activeElement;
    const wasSearching = active && active.id === 'product-search';
    const caret = wasSearching ? active.selectionStart : null;

    el.outerHTML = this.render();
    this.bindEvents();

    if (wasSearching) {
      const search = document.getElementById('product-search');
      if (search) {
        search.focus();
        if (caret !== null) search.setSelectionRange(caret, caret);
      }
    }
  }

  render() {
    if (this.error) return this.renderError();

    // The #product-board-view wrapper must exist in the loading state too, or
    // refresh() cannot find the container after the async load resolves.
    if (this.isLoading) {
      return `
        <div class="product-board-view" id="product-board-view">
          <div class="loading-board"><div class="spinner"></div><p>Loading product board...</p></div>
        </div>
      `;
    }

    return `
      <div class="product-board-view" id="product-board-view">
        ${this.renderHeader()}
        ${this.renderFilters()}
        ${this.renderBoard()}
      </div>
    `;
  }

  renderHeader() {
    return `
      <div class="view-header">
        <div class="view-header-left">
          <h2>Product Board</h2>
        </div>
        <div class="view-header-right">
          <button class="btn btn-primary" id="product-new-card-btn">
            + New Product Card
          </button>
        </div>
      </div>
    `;
  }

  renderFilters() {
    const option = (value, current) =>
      `<option value="${escapeAttr(value)}"${value === current ? ' selected' : ''}>${escapeHtml(value)}</option>`;

    const activeCount = Object.values(this.filters).filter(Boolean).length;

    return `
      <div class="product-filters">
        <div class="product-filter product-filter-search">
          <label for="product-search">Search</label>
          <input type="search"
                 id="product-search"
                 placeholder="Card number, title, description, linked issues…"
                 value="${escapeAttr(this.filters.search)}"
                 autocomplete="off">
        </div>
        <div class="product-filter">
          <label for="product-filter-customer">Customer</label>
          <select id="product-filter-customer">
            <option value="">All customers</option>
            ${this.options.customers.map(c => option(c, this.filters.customer)).join('')}
          </select>
        </div>
        <div class="product-filter">
          <label for="product-filter-priority">Priority</label>
          <select id="product-filter-priority">
            <option value="">All priorities</option>
            ${this.options.priorities.map(p => option(p, this.filters.priority)).join('')}
          </select>
        </div>
        <div class="product-filter">
          <label for="product-filter-reporter">Reporter</label>
          <select id="product-filter-reporter">
            <option value="">All reporters</option>
            ${this.options.reporters.map(r => option(r, this.filters.reporter)).join('')}
          </select>
        </div>
        ${activeCount > 0
          ? `<button class="btn btn-sm" id="product-clear-filters">Clear filters (${activeCount})</button>`
          : ''}
      </div>
    `;
  }

  buildColumns() {
    const byStatus = new Map(PRODUCT_STATUSES.map(name => [name, []]));

    for (const card of this.cards) {
      const status = card.status || 'No status';
      if (!byStatus.has(status)) byStatus.set(status, []);
      byStatus.get(status).push(card);
    }

    return [...byStatus.entries()].map(([name, cards]) => ({
      name,
      cards,
      category: STATUS_CATEGORIES[name] || 'todo'
    }));
  }

  renderBoard() {
    if (!this.cards || this.cards.length === 0) {
      const filtered = Object.values(this.filters).some(Boolean);
      return `
        <div class="empty-state">
          <h3>${filtered ? 'No cards match these filters' : 'No product cards yet'}</h3>
          <p class="empty-hint">
            ${filtered
              ? 'Try clearing a filter to widen the results.'
              : `Cards appear here after a sync of the ${escapeHtml(PRODUCT_PROJECT_KEY)} project.`}
          </p>
        </div>
      `;
    }

    const columns = this.buildColumns().map(column => `
      <section class="pb-column pb-column-${column.category}"
               aria-label="${escapeAttr(column.name)}">
        <header class="pb-column-header">
          <span class="pb-column-title">${escapeHtml(column.name)}</span>
          <span class="pb-column-count">${column.cards.length}</span>
        </header>
        <div class="pb-column-cards">
          ${column.cards.map(card => this.renderCard(card)).join('')
            || '<div class="pb-column-empty">No cards</div>'}
        </div>
      </section>
    `).join('');

    return `<div class="pb-board">${columns}</div>`;
  }

  renderCard(card) {
    const derived = getEngDerivedStatus(card);
    const engKey = card.eng_issue_key;
    // Prefer the product issue's own assignee; fall back to whoever is on the
    // linked Eng card so the field is not blank just because the product item
    // is unassigned in Jira.
    const assignee = card.assignee_name || card.assigned_engineer_name;
    const assigneeFromEng = !card.assignee_name && !!card.assigned_engineer_name;
    // Unacknowledged milestones are what the Action Required banner lists; flag
    // the same cards on the board so the two views agree.
    const needsAction = Object.values(card.milestones || {}).some(m => m && !m.acknowledged);
    const linked = card.linked_issues || [];
    const hasEpic = linked.some(l => l.is_epic);

    return `
      <article class="pb-card${needsAction ? ' pb-card-action' : ''}${hasEpic ? ' pb-card-epic' : ''}"
               data-issue-key="${escapeAttr(card.product_issue_key || '')}"
               ${hasEpic ? 'title="Delivered by an epic"' : ''}>
        <div class="pb-card-title">${escapeHtml(card.title || 'Untitled')}</div>

        <div class="pb-card-meta">
          ${card.product_issue_key
            ? `<a class="pb-card-key pb-card-key-link"
                  href="${escapeAttr(this.jiraUrl(card.product_issue_key))}"
                  target="_blank" rel="noopener"
                  title="Open ${escapeAttr(card.product_issue_key)} in Jira">${escapeHtml(card.product_issue_key)}</a>`
            : '<span class="pb-card-key pb-card-draft">local draft</span>'}
          ${card.priority
            ? `<span class="pb-card-priority pb-priority-${escapeAttr(this.priorityClass(card.priority))}"
                     title="Priority">${escapeHtml(card.priority)}</span>`
            : ''}
          ${card.customer
            ? `<span class="pb-card-customer">${escapeHtml(card.customer)}</span>`
            : ''}
        </div>

        ${derived && derived !== card.status
          ? `<div class="pb-card-derived" title="From the linked Engineering card">Eng: ${escapeHtml(derived)}</div>`
          : ''}

        <div class="pb-card-linked">
          <div class="pb-card-linked-head">
            <span class="pb-card-linked-label">Linked Issues</span>
            ${linked.length > 0
              ? `<span class="pb-card-linked-count">${linked.length}</span>`
              : '<span class="pb-card-muted">None</span>'}
          </div>
          ${linked.length > 0
            ? `<div class="pb-card-linked-list">${linked.map(link => `
                <div class="pb-card-linked-row">
                  <span class="pb-card-linked-key${link.key === engKey ? ' pb-card-linked-eng' : ''}${link.is_epic ? ' pb-card-linked-epic' : ''}${link.type_chip?.tone === 'customer' ? ' pb-card-linked-customer' : ''}"
                        title="${escapeAttr(link.type_chip?.label || (link.key === engKey ? 'Engineering card' : 'Linked issue'))}">${link.is_epic ? '⚡ ' : ''}${link.type_chip?.tone === 'customer' ? '🏢 ' : ''}${escapeHtml(link.key)}</span>
                  ${link.type_chip
                    ? `<span class="pb-card-linked-status pb-cat-${escapeAttr(link.type_chip.tone)}"
                             title="${escapeAttr(link.status ? `${link.issue_type} — ${link.status}` : link.issue_type || '')}">${escapeHtml(link.type_chip.label)}</span>`
                    : link.status
                      ? `<span class="pb-card-linked-status pb-cat-${escapeAttr(this.categoryClass(link.status_category))}">${escapeHtml(link.status)}</span>`
                      : link.issue_type
                        ? `<span class="pb-card-linked-status pb-cat-type" title="Status not synced yet">${escapeHtml(link.issue_type)}</span>`
                        : '<span class="pb-card-linked-status pb-cat-unknown" title="Not in the local cache yet — run a sync">Not synced</span>'}
                </div>
                ${link.assignee_name
                  ? `<div class="pb-card-linked-who" title="Assignee of ${escapeAttr(link.key)}">${escapeHtml(link.assignee_name)}</div>`
                  : ''}
              `).join('')}</div>`
            : ''}
        </div>

        ${this.renderCardActions(card)}

        <div class="pb-card-people">
          <span class="pb-card-person">
            <span class="pb-card-person-label">Reporter</span>
            <span class="pb-card-person-name">${card.reporter_name
              ? escapeHtml(card.reporter_name)
              : '<span class="pb-card-muted">Unknown</span>'}</span>
          </span>
          <span class="pb-card-person">
            <span class="pb-card-person-label">Assignee</span>
            <span class="pb-card-person-name"${assigneeFromEng
              ? ` title="From the linked Eng card ${escapeAttr(engKey || '')}"`
              : ''}>${assignee
                ? escapeHtml(assignee)
                : '<span class="pb-card-muted">Unassigned</span>'}</span>
          </span>
        </div>
      </article>
    `;
  }

  /**
   * The action this card is waiting on, rendered inline on the card itself.
   *
   * Replaces the old board-level "Action Required" banner: the prompt now sits
   * on the card it refers to, so there is no jumping between a list and a board
   * to work out which card a line belongs to.
   *
   * @param {object} card
   * @returns {string}
   */
  renderCardActions(card) {
    const parts = [];

    const testPending = card.milestones?.ready_to_test
      && !card.milestones.ready_to_test.acknowledged;
    if (testPending) {
      parts.push(`
        <div class="pb-card-action-row pb-action-test">
          <span class="pb-action-text">🧪 Ready to test</span>
          <button class="btn btn-sm pb-test-done" data-card-id="${card.id}">Mark tested</button>
        </div>
      `);
    }

    const docPart = this.renderDocAction(card);
    if (docPart) parts.push(docPart);

    return parts.length ? `<div class="pb-card-actions">${parts.join('')}</div>` : '';
  }

  /**
   * Documentation state for a card.
   *
   * Shown once the Eng card is released, and kept visible afterwards while the
   * state is anything other than the default — so a finished document still
   * reads as finished rather than vanishing.
   *
   * @param {object} card
   * @returns {string}
   */
  renderDocAction(card) {
    const status = card.doc_status || 'not_started';
    const outstanding = needsDocumentation(card);
    const settledButTracked = !outstanding && status !== 'not_started';
    if (!outstanding && !settledButTracked) return '';

    const meta = docStatus(status) || DOC_STATUSES[0];
    const options = DOC_STATUSES.map(s => `
      <option value="${escapeAttr(s.key)}"${s.key === status ? ' selected' : ''}>${escapeHtml(s.label)}</option>
    `).join('');

    return `
      <div class="pb-card-action-row pb-action-doc pb-doc-${escapeAttr(status)}">
        <div class="pb-doc-head">
          <span class="pb-action-text">${meta.icon} Confluence</span>
          <select class="pb-doc-select"
                  data-card-id="${card.id}"
                  aria-label="Confluence documentation status for ${escapeAttr(card.title || card.product_issue_key || 'card')}">
            ${options}
          </select>
        </div>
        <div class="pb-doc-controls">
          ${status === 'not_started'
            ? `<button class="btn btn-sm btn-primary pb-doc-create" data-card-id="${card.id}">
                 📝 Create Documentation
               </button>`
            : ''}
          ${status === 'in_progress'
            ? `<button class="btn btn-sm pb-doc-create" data-card-id="${card.id}">Open in Confluence</button>
               <button class="btn btn-sm pb-doc-done" data-card-id="${card.id}">Mark done</button>`
            : ''}
          ${status === 'done'
            ? `<span class="pb-doc-settled">Documented${card.doc_updated_at
                ? ` ${escapeHtml(formatDate(card.doc_updated_at) || '')}` : ''}</span>`
            : ''}
          ${status === 'not_needed'
            ? '<span class="pb-doc-settled pb-doc-muted">No documentation needed</span>'
            : ''}
        </div>
      </div>
    `;
  }

  /**
   * Map a Jira status CATEGORY onto a colour class for the linked-issue chips.
   * Category is used rather than the status name because TSM2 alone has 14
   * statuses; the three categories are what a reader actually scans for.
   */
  categoryClass(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('done') || c.includes('complete')) return 'done';
    if (c.includes('progress') || c.includes('indeterminate')) return 'progress';
    if (c.includes('to do') || c.includes('new')) return 'todo';
    return 'unknown';
  }

  /**
   * Map a Jira priority name onto a colour class. Matches on substring so
   * "Highest"/"P1 - Critical" and similar variants land on the right style.
   */
  priorityClass(priority) {
    const p = String(priority).toLowerCase();
    if (p.includes('highest') || p.includes('critical') || p.includes('blocker')) return 'highest';
    if (p.includes('high') || p.includes('major')) return 'high';
    if (p.includes('lowest') || p.includes('trivial')) return 'lowest';
    if (p.includes('low') || p.includes('minor')) return 'low';
    return 'medium';
  }

  renderError() {
    return `
      <div class="product-board-view" id="product-board-view">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load product board</h3>
          <p>${escapeHtml(this.error || 'Unknown error')}</p>
          <button class="btn btn-primary retry-btn" id="product-retry-btn">Retry</button>
        </div>
      </div>
    `;
  }

  /**
   * Browse URL for an issue key, or '#' when the domain is unknown.
   *
   * @param {string} issueKey
   * @returns {string}
   */
  jiraUrl(issueKey) {
    const site = String(this.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!site || !issueKey) return '#';
    return `https://${site}/browse/${encodeURIComponent(issueKey)}`;
  }

  /**
   * Open a product card's Jira issue in a new tab.
   *
   * @param {string} issueKey
   */
  openInJira(issueKey) {
    const site = String(this.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!site || !issueKey) {
      logger.warn('[ProductBoard] Cannot open Jira without a domain and issue key');
      return;
    }
    window.open(`https://${site}/browse/${encodeURIComponent(issueKey)}`, '_blank', 'noopener');
  }

  /**
   * Open Jira's own create screen, prefilled from config. The app never POSTs
   * to Jira — see AGENTS.md "Read-Only Rule".
   */
  openCreateFlow() {
    const handoff = buildHandoff({ title: '', description: '' }, this.jiraDomain, {
      projects: this.projects
    });

    if (handoff.url) {
      window.open(handoff.url, '_blank', 'noopener');
      return;
    }

    // Fall back to the Product board itself when the create-screen IDs are not
    // configured — still gets the user where they need to go.
    const site = String(this.jiraDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!site) {
      logger.warn('[ProductBoard] No Jira domain available for create flow');
      return;
    }
    const boardUrl = BOARD_IDS.product
      ? `https://${site}/jira/software/boards/${BOARD_IDS.product}`
      : `https://${site}/jira/your-work`;
    logger.info(`[ProductBoard] Create-issue prefill unavailable (${handoff.missing.join(', ')}) — opening board`);
    window.open(boardUrl, '_blank', 'noopener');
  }

  /**
   * Re-read the cards without the first-load spinner, after an action changed
   * one of them.
   */
  async reloadCards() {
    this.cards = await getProductCards(this.toQueryFilters());
    this.refresh();
  }

  /**
   * Open Confluence's create-page screen for this card's documentation, and
   * move the card to "in progress".
   *
   * The status is advanced on the way out rather than waiting for the user to
   * come back and set it: they have just been sent off to write the thing.
   */
  async openDocFlow(cardId) {
    const card = this.cards?.find(c => c.id === cardId);
    const { url } = buildCreateDocUrl(card || {}, this.jiraDomain);

    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      logger.warn('[ProductBoard] No Confluence domain available for the doc flow');
    }

    if ((card?.doc_status || 'not_started') === 'not_started') {
      await setDocStatus(cardId, 'in_progress');
      await this.reloadCards();
    }
  }

  bindEvents() {
    const root = document.getElementById('product-board-view');
    if (!root) return;

    // Single delegated listener per render, so re-rendering cannot stack
    // duplicate handlers onto the same elements.
    this.boundHandler = async (e) => {
      if (e.target.closest('#product-new-card-btn')) {
        this.openCreateFlow();
        return;
      }
      if (e.target.closest('#product-retry-btn')) {
        this.error = null;
        this.load().catch(err => logger.error('[ProductBoard] retry failed:', err));
        return;
      }
      if (e.target.closest('#product-clear-filters')) {
        this.filters = { customer: '', priority: '', reporter: '', search: '' };
        this.load().catch(err => logger.error('[ProductBoard] clear filters failed:', err));
        return;
      }

      // --- card-level actions. Dataset values are strings; the store keys
      // cards by number, so every id is coerced. ---

      const createDoc = e.target.closest('.pb-doc-create');
      if (createDoc) {
        e.stopPropagation();
        const cardId = Number(createDoc.dataset.cardId);
        this.openDocFlow(cardId);
        return;
      }

      const markDone = e.target.closest('.pb-doc-done');
      if (markDone) {
        e.stopPropagation();
        await setDocStatus(Number(markDone.dataset.cardId), 'done');
        await this.reloadCards();
        return;
      }

      const markTested = e.target.closest('.pb-test-done');
      if (markTested) {
        e.stopPropagation();
        await acknowledgeMilestone(Number(markTested.dataset.cardId), 'ready_to_test');
        await this.reloadCards();
        return;
      }

      // Anything inside the action area is a control, not a way into the
      // issue — clicking the Confluence row must never open the issue.
      if (e.target.closest('.pb-card-actions')) return;

      const card = e.target.closest('.pb-card');
      if (card?.dataset.issueKey) {
        this.openInJira(card.dataset.issueKey);
      }
    };
    root.addEventListener('click', this.boundHandler);

    // Delegated so it survives the re-render each change triggers.
    root.addEventListener('change', async (e) => {
      const select = e.target.closest('.pb-doc-select');
      if (!select) return;
      await setDocStatus(Number(select.dataset.cardId), select.value);
      await this.reloadCards();
    });

    const onFilterChange = (id, key) => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        this.filters[key] = e.target.value;
        this.load().catch(err => logger.error('[ProductBoard] filter failed:', err));
      });
    };
    onFilterChange('product-filter-customer', 'customer');
    onFilterChange('product-filter-priority', 'priority');
    onFilterChange('product-filter-reporter', 'reporter');

    const search = document.getElementById('product-search');
    if (search) {
      search.addEventListener('input', (e) => {
        this.filters.search = e.target.value;
        // Debounced: every keystroke re-renders the whole board.
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
          this.load().catch(err => logger.error('[ProductBoard] search failed:', err));
        }, 180);
      });
    }
  }

  destroy() {
    const root = document.getElementById('product-board-view');
    if (root && this.boundHandler) {
      root.removeEventListener('click', this.boundHandler);
    }
    this.boundHandler = null;
  }
}

export const ProductBoardViewStyles = `
.product-board-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* --- Filters --- */
.product-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.product-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}
.product-filter label {
  font-size: 14.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.product-filter select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font-size: 17px;
}
.product-filter-search {
  flex: 1 1 280px;
  min-width: 220px;
}
.product-filter input[type="search"] {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font-size: 16px;
  font-family: inherit;
}
.product-filter input[type="search"]::placeholder {
  color: var(--text-muted);
}
.product-filter input[type="search"]:focus,
.product-filter select:focus {
  outline: none;
  box-shadow: var(--focus-ring);
  border-color: var(--primary);
}

/* --- Card actions (replaces the old board-level Action Required banner) --- */
.pb-card-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-light);
}
.pb-card-action-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border-strong);
}
.pb-action-text {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-h);
  white-space: nowrap;
}
.pb-action-test {
  border-left-color: var(--info);
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.pb-action-doc { border-left-color: var(--warning); }
/* Settled documentation stops shouting — it is a record, not a prompt. */
.pb-action-doc.pb-doc-done { border-left-color: var(--success); }
.pb-action-doc.pb-doc-not_needed { border-left-color: var(--border-strong); opacity: 0.75; }

.pb-doc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.pb-doc-select {
  flex-shrink: 0;
  max-width: 110px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
}
.pb-doc-select:focus {
  outline: none;
  box-shadow: var(--focus-ring);
  border-color: var(--primary);
}
.pb-doc-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.pb-doc-controls .btn { font-size: 13.5px; padding: 4px 9px; }
.pb-doc-settled { font-size: 13.5px; color: var(--success); font-weight: 600; }
.pb-doc-muted { color: var(--text-muted); font-weight: 400; }

/* --- Kanban board --- */
.pb-board {
  display: grid;
  grid-auto-flow: column;
  /* Wide enough for the larger type: a linked-issue row is a key, a status
     chip and an assignee, and squeezing them wraps every row. */
  grid-auto-columns: minmax(300px, 1fr);
  gap: var(--space-md);
  overflow-x: auto;
  padding-bottom: var(--space-sm);
  align-items: start;
}
.pb-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-top: 3px solid var(--border-strong);
  border-radius: var(--radius-md);
}
.pb-column-todo { border-top-color: var(--text-muted); }
.pb-column-inprogress { border-top-color: var(--info); }
.pb-column-done { border-top-color: var(--success); }

.pb-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border);
}
.pb-column-title {
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  /* Long status names must wrap rather than stretch the column. */
  overflow-wrap: anywhere;
}
.pb-column-count {
  flex-shrink: 0;
  min-width: 20px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
}
.pb-column-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm);
  min-height: 40px;
}
.pb-column-empty {
  padding: var(--space-md);
  text-align: center;
  font-size: 16px;
  color: var(--text-muted);
}

.pb-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-sm) var(--space-md);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: background 0.1s, box-shadow 0.1s;
}
.pb-card:hover {
  background: var(--hover);
  box-shadow: var(--shadow-sm);
}
.pb-card-action {
  border-left: 3px solid var(--warning);
}
/* Delivered by an epic: ring the whole card in orange. */
.pb-card-epic {
  border-color: var(--warning);
}
.pb-card-title {
  font-weight: 600;
  font-size: 17px;
  line-height: 1.35;
  color: var(--text-h);
  overflow-wrap: anywhere;
}
.pb-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 14.5px;
  color: var(--text-muted);
}
.pb-card-key { font-family: monospace; }
.pb-card-draft { font-style: italic; }
.pb-card-customer {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  overflow-wrap: anywhere;
}
.pb-card-derived {
  align-self: flex-start;
  padding: 1px 7px;
  border-radius: 8px;
  background: var(--info-bg);
  color: var(--info);
  font-size: 14.5px;
  font-weight: 600;
}
.pb-card-priority {
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 700;
  border: 1px solid transparent;
}
.pb-priority-highest { background: var(--danger-bg); color: var(--danger); }
.pb-priority-high { background: var(--warning-bg); color: var(--warning); }
.pb-priority-medium { background: var(--surface-sunken); color: var(--text-muted); border-color: var(--border); }
.pb-priority-low,
.pb-priority-lowest { background: var(--info-bg); color: var(--info); }

.pb-card-linked {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border-light);
}
.pb-card-linked-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pb-card-linked-label {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
.pb-card-linked-count {
  min-width: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
}
.pb-card-linked-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pb-card-linked-who {
  font-size: 12.5px;
  color: var(--text-muted);
  padding-left: 4px;
  margin-top: -1px;
  overflow-wrap: anywhere;
}
.pb-card-linked-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.pb-card-linked-row .pb-card-linked-status { flex-shrink: 0; }
.pb-card-linked-key {
  font-family: var(--mono, monospace);
  font-size: 13px;
  padding: 0 5px;
  border-radius: 6px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  color: var(--text);
  flex-shrink: 0;
}
/* An epic is a bigger commitment than a task — call it out in orange, which is
   not used by any other state on this board. */
.pb-card-linked-epic {
  border-color: var(--warning);
  border-width: 2px;
  color: var(--warning);
  font-weight: 700;
}
/* A customer card is a customer, not work — ring it in the info colour. */
.pb-card-linked-customer {
  border-color: var(--info);
  border-width: 2px;
  color: var(--info);
  font-weight: 700;
}
/* The Eng card is the one that drives status and the assignee — mark it. */
.pb-card-linked-eng {
  background: var(--primary-bg);
  border-color: var(--primary-border);
  color: var(--primary);
  font-weight: 700;
}
.pb-card-linked-status {
  font-size: 12.5px;
  font-weight: 600;
  padding: 0 6px;
  border-radius: 8px;
  text-align: right;
  overflow-wrap: anywhere;
}
.pb-cat-todo { background: var(--surface-sunken); color: var(--text-muted); }
.pb-cat-progress { background: var(--info-bg); color: var(--info); }
.pb-cat-done { background: var(--success-bg); color: var(--success); }
.pb-cat-epic,
.pb-cat-customer {
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: 12px;
}
.pb-cat-epic { background: var(--warning-bg); color: var(--warning); }
.pb-cat-customer { background: var(--info-bg); color: var(--info); }
.pb-cat-type {
  background: var(--warning-bg);
  color: var(--warning);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 12px;
}
.pb-cat-unknown {
  background: transparent;
  color: var(--text-muted);
  font-style: italic;
  font-weight: 400;
}

.pb-card-people {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding-top: 6px;
  border-top: 1px solid var(--border-light);
}
.pb-card-person {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pb-card-person-label {
  font-size: 13.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
.pb-card-person-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.pb-card-muted { color: var(--text-muted); font-weight: 400; }

@media (max-width: 720px) {
  .product-filter { min-width: 100%; }
  .product-alert { flex-wrap: wrap; }
  /* Stack the columns instead of scrolling sideways on a phone. */
  .pb-board {
    grid-auto-flow: row;
    grid-auto-columns: auto;
  }
}
`;
