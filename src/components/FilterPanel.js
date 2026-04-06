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
      tags: [],
      projects: []
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
   * Clear a single filter field
   */
  clearField(field) {
    delete this.filters[field];
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
    // Trigger a refresh to update the UI
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
  }

  /**
   * Remove a single value from a multi-select filter
   */
  removeValue(field, value) {
    if (Array.isArray(this.filters[field])) {
      this.filters[field] = this.filters[field].filter(v => v !== value);
      // Clean up if array is empty
      if (this.filters[field].length === 0) {
        delete this.filters[field];
      }
    }
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
    // Trigger a refresh to update the UI
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
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
          ${this.renderProjectFilter()}
          ${this.renderSearchFilter()}
          ${this.renderStatusFilter()}
          ${this.renderIssueTypeFilter()}
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

  /**
   * Render clear button for a filter field
   */
  renderClearButton(fieldKey) {
    return `<button class="clear-field-btn" data-field="${fieldKey}" title="Clear ${fieldKey} filter">×</button>`;
  }

  /**
   * Render selected values as chips with remove buttons
   */
  renderSelectedChips(fieldKey, values, displayNames = null) {
    if (!Array.isArray(values) || values.length === 0) return '';

    const names = displayNames || values;
    return `
      <div class="selected-chips" data-field="${fieldKey}">
        ${values.map((value, index) => `
          <span class="chip">
            ${this.escapeHtml(names[index] || value)}
            <button class="chip-remove" data-field="${fieldKey}" data-value="${this.escapeHtml(value)}" title="Remove">×</button>
          </span>
        `).join('')}
      </div>
    `;
  }

  renderSearchFilter() {
    const hasValue = this.filters.searchQuery;
    return `
      <div class="filter-group full-width">
        <label for="search-filter">
          Search
          ${hasValue ? this.renderClearButton('searchQuery') : ''}
        </label>
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

  renderProjectFilter() {
    const projects = this.availableFilters.projects || [];
    const selected = this.filters.projectKey || '';
    const hasValue = selected && selected !== '';

    return `
      <div class="filter-group">
        <label for="project-filter">
          Project
          ${hasValue ? this.renderClearButton('projectKey') : ''}
        </label>
        <select id="project-filter" class="filter-select">
          <option value="">All Projects</option>
          ${projects.map(p => `
            <option value="${this.escapeHtml(p.key)}" ${selected === p.key ? 'selected' : ''}>
              ${this.escapeHtml(p.name)} (${p.key})
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderStatusFilter() {
    const statuses = this.availableFilters.status || [];
    const selectedStatuses = this.filters.status || [];
    const hasValue = Array.isArray(selectedStatuses) && selectedStatuses.length > 0;

    return `
      <div class="filter-group">
        <label for="status-filter">
          Status
          ${hasValue ? this.renderClearButton('status') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('status', selectedStatuses) : ''}
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
    const selected = this.filters.fixVersion || [];
    const hasValue = Array.isArray(selected) && selected.length > 0;

    return `
      <div class="filter-group">
        <label for="fixversion-filter">
          Fix Version
          ${hasValue ? this.renderClearButton('fixVersion') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('fixVersion', selected) : ''}
        <select id="fixversion-filter" class="filter-select" multiple>
          ${versions.map(v => `
            <option value="${this.escapeHtml(v)}" ${Array.isArray(selected) && selected.includes(v) ? 'selected' : ''}>
              ${this.escapeHtml(v)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderIssueTypeFilter() {
    const issueTypes = this.availableFilters.issueType || [];
    const selected = this.filters.issueType || [];
    const hasValue = Array.isArray(selected) && selected.length > 0;

    return `
      <div class="filter-group">
        <label for="issue-type-filter">
          Card Type
          ${hasValue ? this.renderClearButton('issueType') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('issueType', selected) : ''}
        <select id="issue-type-filter" class="filter-select" multiple>
          ${issueTypes.map(t => `
            <option value="${this.escapeHtml(t)}" ${Array.isArray(selected) && selected.includes(t) ? 'selected' : ''}>
              ${this.escapeHtml(t)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderCustomerFilter() {
    const customers = this.availableFilters.customer || [];
    const selected = this.filters.customer || [];
    const hasValue = Array.isArray(selected) && selected.length > 0;

    return `
      <div class="filter-group">
        <label for="customer-filter">
          Customer
          ${hasValue ? this.renderClearButton('customer') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('customer', selected) : ''}
        <select id="customer-filter" class="filter-select" multiple>
          ${customers.map(c => `
            <option value="${this.escapeHtml(c)}" ${Array.isArray(selected) && selected.includes(c) ? 'selected' : ''}>
              ${this.escapeHtml(c)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderProductFilter() {
    const products = this.availableFilters.product || [];
    const selected = this.filters.product || [];
    const hasValue = Array.isArray(selected) && selected.length > 0;

    return `
      <div class="filter-group">
        <label for="product-filter">
          Product
          ${hasValue ? this.renderClearButton('product') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('product', selected) : ''}
        <select id="product-filter" class="filter-select" multiple>
          ${products.map(p => `
            <option value="${this.escapeHtml(p)}" ${Array.isArray(selected) && selected.includes(p) ? 'selected' : ''}>
              ${this.escapeHtml(p)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderPeopleFilters() {
    const assignees = this.availableFilters.assignee || [];
    const reporters = this.availableFilters.reporter || [];
    const qaTesters = this.availableFilters.qaTester || [];
    const codeReviewers1 = this.availableFilters.codeReviewer1 || [];
    const codeReviewers2 = this.availableFilters.codeReviewer2 || [];

    const selectedAssignees = this.filters.assigneeId || [];
    const selectedReporters = this.filters.reporterId || [];
    const selectedQaTesters = this.filters.qaTesterId || [];
    const selectedCodeReviewers1 = this.filters.codeReviewer1Id || [];
    const selectedCodeReviewers2 = this.filters.codeReviewer2Id || [];

    // Build name maps for display
    const assigneeMap = new Map(assignees.map(a => [a.account_id || a.accountId, a.display_name || a.displayName]));
    const reporterMap = new Map(reporters.map(r => [r.account_id || r.accountId, r.display_name || r.displayName]));
    const qaTesterMap = new Map(qaTesters.map(q => [q.account_id || q.accountId, q.display_name || q.displayName]));
    const codeReviewer1Map = new Map(codeReviewers1.map(r => [r.account_id || r.accountId, r.display_name || r.displayName]));
    const codeReviewer2Map = new Map(codeReviewers2.map(r => [r.account_id || r.accountId, r.display_name || r.displayName]));

    // Get display names for selected values
    const getDisplayNames = (ids, map) => ids.map(id => map.get(id) || id);

    return `
      <div class="filter-group">
        <label for="assignee-filter">
          Assignee
          ${Array.isArray(selectedAssignees) && selectedAssignees.length > 0 ? this.renderClearButton('assigneeId') : ''}
        </label>
        ${Array.isArray(selectedAssignees) && selectedAssignees.length > 0 ? this.renderSelectedChips('assigneeId', selectedAssignees, getDisplayNames(selectedAssignees, assigneeMap)) : ''}
        <select id="assignee-filter" class="filter-select" multiple>
          ${assignees.map(a => `
            <option value="${this.escapeHtml(a.account_id || a.accountId)}" ${Array.isArray(selectedAssignees) && selectedAssignees.includes(a.account_id || a.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(a.display_name || a.displayName)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>

      <div class="filter-group">
        <label for="reporter-filter">
          Reporter
          ${Array.isArray(selectedReporters) && selectedReporters.length > 0 ? this.renderClearButton('reporterId') : ''}
        </label>
        ${Array.isArray(selectedReporters) && selectedReporters.length > 0 ? this.renderSelectedChips('reporterId', selectedReporters, getDisplayNames(selectedReporters, reporterMap)) : ''}
        <select id="reporter-filter" class="filter-select" multiple>
          ${reporters.map(r => `
            <option value="${this.escapeHtml(r.account_id || r.accountId)}" ${Array.isArray(selectedReporters) && selectedReporters.includes(r.account_id || r.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(r.display_name || r.displayName)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>

      <div class="filter-group">
        <label for="qa-tester-filter">
          QA Tester
          ${Array.isArray(selectedQaTesters) && selectedQaTesters.length > 0 ? this.renderClearButton('qaTesterId') : ''}
        </label>
        ${Array.isArray(selectedQaTesters) && selectedQaTesters.length > 0 ? this.renderSelectedChips('qaTesterId', selectedQaTesters, getDisplayNames(selectedQaTesters, qaTesterMap)) : ''}
        <select id="qa-tester-filter" class="filter-select" multiple>
          ${qaTesters.map(q => `
            <option value="${this.escapeHtml(q.account_id || q.accountId)}" ${Array.isArray(selectedQaTesters) && selectedQaTesters.includes(q.account_id || q.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(q.display_name || q.displayName)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>

      <div class="filter-group">
        <label for="code-reviewer-1-filter">
          Code Reviewer #1
          ${Array.isArray(selectedCodeReviewers1) && selectedCodeReviewers1.length > 0 ? this.renderClearButton('codeReviewer1Id') : ''}
        </label>
        ${Array.isArray(selectedCodeReviewers1) && selectedCodeReviewers1.length > 0 ? this.renderSelectedChips('codeReviewer1Id', selectedCodeReviewers1, getDisplayNames(selectedCodeReviewers1, codeReviewer1Map)) : ''}
        <select id="code-reviewer-1-filter" class="filter-select" multiple>
          ${codeReviewers1.map(r => `
            <option value="${this.escapeHtml(r.account_id || r.accountId)}" ${Array.isArray(selectedCodeReviewers1) && selectedCodeReviewers1.includes(r.account_id || r.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(r.display_name || r.displayName)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>

      <div class="filter-group">
        <label for="code-reviewer-2-filter">
          Code Reviewer #2
          ${Array.isArray(selectedCodeReviewers2) && selectedCodeReviewers2.length > 0 ? this.renderClearButton('codeReviewer2Id') : ''}
        </label>
        ${Array.isArray(selectedCodeReviewers2) && selectedCodeReviewers2.length > 0 ? this.renderSelectedChips('codeReviewer2Id', selectedCodeReviewers2, getDisplayNames(selectedCodeReviewers2, codeReviewer2Map)) : ''}
        <select id="code-reviewer-2-filter" class="filter-select" multiple>
          ${codeReviewers2.map(r => `
            <option value="${this.escapeHtml(r.account_id || r.accountId)}" ${Array.isArray(selectedCodeReviewers2) && selectedCodeReviewers2.includes(r.account_id || r.accountId) ? 'selected' : ''}>
              ${this.escapeHtml(r.display_name || r.displayName)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  renderDateFilter() {
    const hasUpdatedAfter = this.filters.updatedAfter;
    const hasToBeTested = this.filters.toBeTestedByDate;

    return `
      <div class="filter-group">
        <label for="date-filter">
          Updated After
          ${hasUpdatedAfter ? this.renderClearButton('updatedAfter') : ''}
        </label>
        <input
          type="date"
          id="date-filter"
          class="filter-input"
          value="${this.filters.updatedAfter || ''}"
        />
      </div>
      <div class="filter-group">
        <label for="to-be-tested-filter">
          To Be Tested By
          ${hasToBeTested ? this.renderClearButton('toBeTestedByDate') : ''}
        </label>
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
    const selected = this.filters.tag || [];
    const hasValue = Array.isArray(selected) && selected.length > 0;

    return `
      <div class="filter-group">
        <label for="tag-filter">
          Tags
          ${hasValue ? this.renderClearButton('tag') : ''}
        </label>
        ${hasValue ? this.renderSelectedChips('tag', selected) : ''}
        <select id="tag-filter" class="filter-select" multiple>
          ${tags.map(t => `
            <option value="${this.escapeHtml(t)}" ${Array.isArray(selected) && selected.includes(t) ? 'selected' : ''}>
              ${this.escapeHtml(t)}
            </option>
          `).join('')}
        </select>
        <small>Hold Ctrl/Cmd to select multiple</small>
      </div>
    `;
  }

  /**
   * Refresh the component in the DOM
   * Preserves multi-select selections by reading from this.filters
   */
  refresh() {
    const container = document.getElementById('filter-panel');
    if (container) {
      // Sync DOM multi-select state with this.filters before re-render
      const multiSelectFields = ['status', 'fixVersion', 'issueType', 'customer', 'product', 'assigneeId', 'reporterId', 'qaTesterId', 'codeReviewer1Id', 'codeReviewer2Id', 'tag'];
      multiSelectFields.forEach(field => {
        const value = this.filters[field];
        if (Array.isArray(value) && value.length > 0) {
          // Ensure filters are up to date
          this.filters[field] = [...value];
        } else if (!value) {
          delete this.filters[field];
        }
      });

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

    // Project filter
    const projectSelect = document.getElementById('project-filter');
    projectSelect?.addEventListener('change', (e) => {
      this.filters.projectKey = e.target.value || null;
      this.emitChange();
    });

    // Clear all filters button
    const clearAllBtn = document.getElementById('clear-filters-btn');
    clearAllBtn?.addEventListener('click', () => this.clearAll());

    // Per-field clear buttons
    document.querySelectorAll('.clear-field-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const field = btn.getAttribute('data-field');
        this.clearField(field);
      });
    });

    // Chip remove buttons (remove single value from multi-select)
    document.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const field = btn.getAttribute('data-field');
        const value = btn.getAttribute('data-value');
        this.removeValue(field, value);
      });
    });

    // Status filter (multi-select)
    const statusSelect = document.getElementById('status-filter');
    statusSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.status = selected.length > 0 ? selected : null;
      this.emitChange();
      // Don't update chips here - let parent component handle re-render after load
    });

    // Fix version filter (multi-select)
    const fixVersionSelect = document.getElementById('fixversion-filter');
    fixVersionSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.fixVersion = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Issue Type (Card Type) filter (multi-select)
    const issueTypeSelect = document.getElementById('issue-type-filter');
    issueTypeSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.issueType = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Customer filter (multi-select)
    const customerSelect = document.getElementById('customer-filter');
    customerSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.customer = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Product filter (multi-select)
    const productSelect = document.getElementById('product-filter');
    productSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.product = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Assignee filter
    const assigneeSelect = document.getElementById('assignee-filter');
    assigneeSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.assigneeId = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Reporter filter
    const reporterSelect = document.getElementById('reporter-filter');
    reporterSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.reporterId = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // QA Tester filter
    const qaTesterSelect = document.getElementById('qa-tester-filter');
    qaTesterSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.qaTesterId = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Code Reviewer #1 filter
    const codeReviewer1Select = document.getElementById('code-reviewer-1-filter');
    codeReviewer1Select?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.codeReviewer1Id = selected.length > 0 ? selected : null;
      this.emitChange();
    });

    // Code Reviewer #2 filter
    const codeReviewer2Select = document.getElementById('code-reviewer-2-filter');
    codeReviewer2Select?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.codeReviewer2Id = selected.length > 0 ? selected : null;
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

    // Tag filter (multi-select)
    const tagSelect = document.getElementById('tag-filter');
    tagSelect?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      this.filters.tag = selected.length > 0 ? selected : null;
      this.emitChange();
    });
  }

  /**
   * Emit filter change event
   * Does NOT trigger a re-render - parent component handles that
   * Does NOT update URL - parent component handles that via renderTableView()
   */
  emitChange() {
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
    // Note: We don't update URL here - the parent component's renderTableView()
    // calls updateUrlFilters() after the debounced load completes
    // This prevents double URL updates and hashchange-triggered re-renders
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
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .clear-field-btn {
    padding: 2px 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    transition: all 0.2s ease;
  }

  .clear-field-btn:hover {
    background: var(--hover);
    color: var(--text);
    border-color: var(--accent);
  }

  .selected-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--hover);
    border-radius: 4px;
    font-size: 12px;
    color: var(--text);
  }

  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    transition: all 0.2s ease;
  }

  .chip-remove:hover {
    background: var(--text-secondary);
    color: var(--background);
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
