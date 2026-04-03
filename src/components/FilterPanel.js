/**
 * Filter Panel Component
 * Provides filtering controls for issues
 */

export class FilterPanel {
  constructor(filters, onFilterChange) {
    this.filters = filters || {};
    this.onFilterChange = onFilterChange;
    this.availableFilters = {
      status: [],
      fixVersion: [],
      customer: [],
      product: [],
      assignee: [],
      reporter: [],
      qaTester: [],
      tags: []
    };
  }

  /**
   * Set available filter options
   */
  setAvailableOptions(options) {
    this.availableFilters = { ...this.availableFilters, ...options };
    // Only refresh if component is already rendered
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
  }

  /**
   * Update filters without re-rendering
   * The parent component will handle updating the display
   */
  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    // Don't auto-refresh - parent component controls rendering
  }

  /**
   * Clear all filters
   */
  clearAll() {
    this.filters = {};
    if (this.onFilterChange) {
      this.onFilterChange(this.filters);
    }
    // Don't auto-refresh - parent component controls rendering
  }

  /**
   * Render the filter panel
   */
  render(issueCount = null) {
    const countLabel = issueCount !== null ? `Filters (${issueCount} issues)` : 'Filters';
    return `
      <div class="filter-panel" id="filter-panel">
        <div class="filter-header">
          <h3>${countLabel}</h3>
          <button class="clear-filters-btn" id="clear-filters-btn" title="Clear all filters">
            Clear all
          </button>
        </div>

        <div class="filter-grid">
          ${this.renderSearchFilter()}
          ${this.renderStatusFilter()}
          ${this.renderFixVersionFilter()}
          ${this.renderCustomerFilter()}
          ${this.renderProductFilter()}
          ${this.renderPeopleFilters()}
          ${this.renderDateFilter()}
          ${this.renderTagsFilter()}
        </div>
      </div>
    `;
  }

  renderSearchFilter() {
    return `
      <div class="filter-group full-width">
        <label for="search-filter">Search</label>
        <input
          type="text"
          id="search-filter"
          class="filter-input"
          placeholder="Search by key or summary..."
          value="${this.escapeHtml(this.filters.searchQuery || '')}"
        />
      </div>
    `;
  }

  renderStatusFilter() {
    const statuses = this.availableFilters.status || [];
    const selectedStatuses = this.filters.status || [];

    return `
      <div class="filter-group">
        <label for="status-filter">Status</label>
        <select id="status-filter" class="filter-select" multiple>
          ${statuses.map(s => `
            <option value="${this.escapeHtml(s)}" ${selectedStatuses.includes(s) ? 'selected' : ''}>
              ${this.escapeHtml(s)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderFixVersionFilter() {
    const versions = this.availableFilters.fixVersion || [];
    const selected = this.filters.fixVersion || '';

    return `
      <div class="filter-group">
        <label for="fixversion-filter">Fix Version</label>
        <select id="fixversion-filter" class="filter-select">
          <option value="">All Versions</option>
          ${versions.map(v => `
            <option value="${this.escapeHtml(v)}" ${selected === v ? 'selected' : ''}>
              ${this.escapeHtml(v)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderCustomerFilter() {
    const customers = this.availableFilters.customer || [];
    const selected = this.filters.customer || '';

    return `
      <div class="filter-group">
        <label for="customer-filter">Customer</label>
        <select id="customer-filter" class="filter-select">
          <option value="">All Customers</option>
          ${customers.map(c => `
            <option value="${this.escapeHtml(c)}" ${selected === c ? 'selected' : ''}>
              ${this.escapeHtml(c)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderProductFilter() {
    const products = this.availableFilters.product || [];
    const selected = this.filters.product || '';

    return `
      <div class="filter-group">
        <label for="product-filter">Product</label>
        <select id="product-filter" class="filter-select">
          <option value="">All Products</option>
          ${products.map(p => `
            <option value="${this.escapeHtml(p)}" ${selected === p ? 'selected' : ''}>
              ${this.escapeHtml(p)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderPeopleFilters() {
    const assignees = this.availableFilters.assignee || [];
    const reporters = this.availableFilters.reporter || [];
    const qaTesters = this.availableFilters.qaTester || [];

    return `
      <div class="filter-group">
        <label for="assignee-filter">Assignee</label>
        <select id="assignee-filter" class="filter-select">
          <option value="">All Assignees</option>
          ${assignees.map(a => `
            <option value="${this.escapeHtml(a.account_id || a.accountId)}" ${this.filters.assigneeId === (a.account_id || a.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(a.display_name || a.displayName)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="filter-group">
        <label for="reporter-filter">Reporter</label>
        <select id="reporter-filter" class="filter-select">
          <option value="">All Reporters</option>
          ${reporters.map(r => `
            <option value="${this.escapeHtml(r.account_id || r.accountId)}" ${this.filters.reporterId === (r.account_id || r.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(r.display_name || r.displayName)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="filter-group">
        <label for="qa-tester-filter">QA Tester</label>
        <select id="qa-tester-filter" class="filter-select">
          <option value="">All QA Testers</option>
          ${qaTesters.map(q => `
            <option value="${this.escapeHtml(q.account_id || q.accountId)}" ${this.filters.qaTesterId === (q.account_id || q.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(q.display_name || q.displayName)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderDateFilter() {
    return `
      <div class="filter-group">
        <label for="date-filter">Updated After</label>
        <input
          type="date"
          id="date-filter"
          class="filter-input"
          value="${this.filters.updatedAfter || ''}"
        />
      </div>
      <div class="filter-group">
        <label for="to-be-tested-filter">To Be Tested By</label>
        <input
          type="date"
          id="to-be-tested-filter"
          class="filter-input"
          value="${this.filters.toBeTestedByDate || ''}"
          title="Show issues that need testing before this date"
        />
      </div>
    `;
  }

  renderTagsFilter() {
    const tags = this.availableFilters.tags || [];
    const selected = this.filters.tag || '';

    return `
      <div class="filter-group">
        <label for="tag-filter">Tags</label>
        <select id="tag-filter" class="filter-select">
          <option value="">All Tags</option>
          ${tags.map(t => `
            <option value="${this.escapeHtml(t)}" ${selected === t ? 'selected' : ''}>
              ${this.escapeHtml(t)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  /**
   * Refresh the component in the DOM
   */
  refresh() {
    const container = document.getElementById('filter-panel');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Search filter
    const searchInput = document.getElementById('search-filter');
    searchInput?.addEventListener('input', (e) => {
      this.filters.searchQuery = e.target.value || null;
      this.emitChange();
    });

    // Clear filters button
    const clearBtn = document.getElementById('clear-filters-btn');
    clearBtn?.addEventListener('click', () => this.clearAll());

    // Status filter (multi-select)
    const statusSelect = document.getElementById('status-filter');
    statusSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.status = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Fix version filter
    const fixVersionSelect = document.getElementById('fixversion-filter');
    fixVersionSelect?.addEventListener('change', (e) => {
      this.filters.fixVersion = e.target.value || null;
      this.emitChange();
    });

    // Customer filter
    const customerSelect = document.getElementById('customer-filter');
    customerSelect?.addEventListener('change', (e) => {
      this.filters.customer = e.target.value || null;
      this.emitChange();
    });

    // Product filter
    const productSelect = document.getElementById('product-filter');
    productSelect?.addEventListener('change', (e) => {
      this.filters.product = e.target.value || null;
      this.emitChange();
    });

    // Assignee filter
    const assigneeSelect = document.getElementById('assignee-filter');
    assigneeSelect?.addEventListener('change', (e) => {
      this.filters.assigneeId = e.target.value || null;
      this.emitChange();
    });

    // Reporter filter
    const reporterSelect = document.getElementById('reporter-filter');
    reporterSelect?.addEventListener('change', (e) => {
      this.filters.reporterId = e.target.value || null;
      this.emitChange();
    });

    // QA Tester filter
    const qaTesterSelect = document.getElementById('qa-tester-filter');
    qaTesterSelect?.addEventListener('change', (e) => {
      this.filters.qaTesterId = e.target.value || null;
      this.emitChange();
    });

    // Date filter
    const dateInput = document.getElementById('date-filter');
    dateInput?.addEventListener('change', (e) => {
      this.filters.updatedAfter = e.target.value || null;
      this.emitChange();
    });

    // To Be Tested filter
    const toBeTestedInput = document.getElementById('to-be-tested-filter');
    toBeTestedInput?.addEventListener('change', (e) => {
      this.filters.toBeTestedByDate = e.target.value || null;
      this.emitChange();
    });

    // Tag filter
    const tagSelect = document.getElementById('tag-filter');
    tagSelect?.addEventListener('change', (e) => {
      this.filters.tag = e.target.value || null;
      this.emitChange();
    });
  }

  /**
   * Emit filter change event
   * Does NOT trigger a re-render - parent component handles that
   */
  emitChange() {
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }

    // Update URL with filters if in All Issues view
    if (window.updateQueryParams && window.filtersToParams) {
      const params = window.filtersToParams(this.filters);
      params.allIssues = 'true';
      window.updateQueryParams(params, false);
    }
    // Note: We don't call refresh() here - the parent component handles re-rendering
    // This prevents the input from losing focus during typing
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Filter Panel Styles
 */
export const FilterPanelStyles = `
  .filter-panel {
    background: var(--surface);
    border-radius: 8px;
    padding: 16px;
    box-shadow: var(--shadow);
    margin-bottom: 16px;
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .filter-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--text);
  }

  .clear-filters-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .clear-filters-btn:hover {
    background: var(--hover);
    color: var(--text);
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .filter-group.full-width {
    grid-column: 1 / -1;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .filter-input,
  .filter-select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 14px;
    background: var(--background);
    color: var(--text);
    transition: border-color 0.2s ease;
  }

  .filter-input:focus,
  .filter-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .filter-select[multiple] {
    min-height: 80px;
  }

  .filter-group small {
    font-size: 11px;
    color: var(--text-secondary);
    font-style: italic;
  }
`;
