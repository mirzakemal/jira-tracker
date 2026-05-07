/**
 * Filter Panel Component
 * Provides filtering controls for issues with collapsible sections
 * and checkbox dropdown multi-selects
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
      projects: [],
      priority: [],
      boards: [],
      sprints: [],
      issueType: [],
      codeReviewer1: [],
      codeReviewer2: []
    };
    this.openDropdown = null;
    this._boundClickOutside = this._handleClickOutside.bind(this);
  }

  setAvailableOptions(options) {
    this.availableFilters = { ...this.availableFilters, ...options };
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
  }

  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
  }

  clearAll() {
    this.filters = {};
    if (this.onFilterChange) {
      this.onFilterChange(this.filters);
    }
  }

  clearField(field) {
    delete this.filters[field];
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
  }

  removeValue(field, value) {
    if (Array.isArray(this.filters[field])) {
      this.filters[field] = this.filters[field].filter(v => v !== value);
      if (this.filters[field].length === 0) {
        delete this.filters[field];
      }
    }
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
    if (document.getElementById('filter-panel')) {
      this.refresh();
    }
  }

  _activeFilterCount() {
    let count = 0;
    const fields = ['projectKey', 'boardId', 'sprintId', 'searchQuery',
      'status', 'priority', 'issueType', 'fixVersion', 'customer', 'product',
      'assigneeId', 'reporterId', 'qaTesterId', 'codeReviewer1Id', 'codeReviewer2Id',
      'tag', 'updatedAfter', 'toBeTestedByDate'];
    for (const f of fields) {
      const v = this.filters[f];
      if (Array.isArray(v) && v.length > 0) count += v.length;
      else if (v !== undefined && v !== null && v !== '') count++;
    }
    return count;
  }

  render(issueCount = null) {
    const activeCount = this._activeFilterCount();
    const countLabel = issueCount !== null
      ? `${issueCount} issues`
      : '';
    return `
      <div class="filter-panel" id="filter-panel">
        <div class="filter-header">
          <div class="filter-header-left">
            <h3>Filters</h3>
            ${activeCount > 0 ? `<span class="filter-active-count">${activeCount}</span>` : ''}
            ${countLabel ? `<span class="filter-issue-count">${countLabel}</span>` : ''}
          </div>
          <button class="clear-filters-btn" id="clear-filters-btn" title="Clear all filters">
            Clear all
          </button>
        </div>

        ${this.renderSearchFilter()}

        <div class="filter-sections">
          ${this.renderSection('context', 'Context', `
            ${this.renderSelect('project', 'Project', 'projectKey',
              (this.availableFilters.projects || []).map(p => ({ value: p.key, label: `${p.name} (${p.key})` })))}
            ${this.renderSelect('board', 'Board', 'boardId',
              (this.availableFilters.boards || []).map(b => ({ value: String(b.id), label: b.name })))}
            ${this.renderSelect('sprint', 'Sprint', 'sprintId',
              (this.availableFilters.sprints || []).map(s => ({ value: String(s.id), label: s.name })))}
          `)}

          ${this.renderSection('workflow', 'Workflow', `
            ${this.renderMultiSelect('status', 'Status',
              this.availableFilters.status || [], this.filters.status || [])}
            ${this.renderMultiSelect('priority', 'Priority',
              this.availableFilters.priority || [], this.filters.priority || [])}
            ${this.renderMultiSelect('issueType', 'Card Type',
              this.availableFilters.issueType || [], this.filters.issueType || [])}
          `)}

          ${this.renderSection('people', 'People', `
            ${this.renderMultiSelect('assigneeId', 'Assignee',
              this.availableFilters.assignee || [], this.filters.assigneeId || [],
              this._userMap(this.availableFilters.assignee))}
            ${this.renderMultiSelect('reporterId', 'Reporter',
              this.availableFilters.reporter || [], this.filters.reporterId || [],
              this._userMap(this.availableFilters.reporter))}
            ${this.renderMultiSelect('qaTesterId', 'QA Tester',
              this.availableFilters.qaTester || [], this.filters.qaTesterId || [],
              this._userMap(this.availableFilters.qaTester))}
            ${this.renderMultiSelect('codeReviewer1Id', 'Code Reviewer #1',
              this.availableFilters.codeReviewer1 || [], this.filters.codeReviewer1Id || [],
              this._userMap(this.availableFilters.codeReviewer1))}
            ${this.renderMultiSelect('codeReviewer2Id', 'Code Reviewer #2',
              this.availableFilters.codeReviewer2 || [], this.filters.codeReviewer2Id || [],
              this._userMap(this.availableFilters.codeReviewer2))}
          `)}

          ${this.renderSection('details', 'Details', `
            ${this.renderMultiSelect('fixVersion', 'Fix Version',
              this.availableFilters.fixVersion || [], this.filters.fixVersion || [])}
            ${this.renderMultiSelect('customer', 'Customer',
              this.availableFilters.customer || [], this.filters.customer || [])}
            ${this.renderMultiSelect('product', 'Product',
              this.availableFilters.product || [], this.filters.product || [])}
            ${this.renderMultiSelect('tag', 'Tags',
              this.availableFilters.tags || [], this.filters.tag || [])}
          `)}

          ${this.renderSection('dates', 'Dates', `
            ${this.renderDateFilter()}
          `)}
        </div>
      </div>
    `;
  }

  renderSearchFilter() {
    const hasValue = this.filters.searchQuery;
    return `
      <div class="filter-search-bar">
        <input
          type="text"
          id="search-filter"
          class="filter-search-input"
          placeholder="Search by key or summary..."
          value="${this.escapeHtml(this.filters.searchQuery || '')}"
        />
        ${hasValue ? `<button class="clear-field-btn" data-field="searchQuery" title="Clear search">×</button>` : ''}
      </div>
    `;
  }

  renderSection(key, title, content) {
    return `
      <div class="filter-section" id="filter-section-${key}">
        <button class="filter-section-header" data-section="${key}" type="button">
          <span class="filter-section-arrow">▾</span>
          <span class="filter-section-title">${title}</span>
        </button>
        <div class="filter-section-body">
          ${content}
        </div>
      </div>
    `;
  }

  renderSelect(id, label, fieldKey, options) {
    const selected = this.filters[fieldKey] || '';
    const hasValue = selected && selected !== '';
    return `
      <div class="filter-field">
        <div class="filter-field-header">
          <label for="${id}-filter">${label}</label>
          ${hasValue ? this.renderClearButton(fieldKey) : ''}
        </div>
        <select id="${id}-filter" class="filter-select">
          <option value="">All ${label}s</option>
          ${options.map(o => `
            <option value="${this.escapeHtml(o.value)}" ${String(selected) === String(o.value) ? 'selected' : ''}>
              ${this.escapeHtml(o.label)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderMultiSelect(id, label, options, selected, displayMap) {
    const hasSelection = Array.isArray(selected) && selected.length > 0;
    const map = displayMap || null;
    const selectedCount = hasSelection ? selected.length : 0;

    return `
      <div class="filter-field">
        <div class="filter-field-header">
          <label>${label}</label>
          ${hasSelection ? this.renderClearButton(id) : ''}
        </div>
        <div class="multi-select" id="multi-${id}">
          <button class="multi-select-trigger" data-field="${id}" type="button">
            <span class="multi-select-label">
              ${selectedCount > 0
                ? `<span class="multi-select-count">${selectedCount}</span> selected`
                : 'All'}
            </span>
            <span class="multi-select-arrow">▾</span>
          </button>
          <div class="multi-select-dropdown" id="dropdown-${id}" data-field="${id}">
            <div class="dropdown-actions">
              <button class="dropdown-action-btn" data-action="all" data-field="${id}">Select all</button>
              <button class="dropdown-action-btn" data-action="none" data-field="${id}">Clear</button>
            </div>
            <div class="dropdown-search">
              <input type="text" class="dropdown-search-input"
                placeholder="Filter..."
                data-dropdown="${id}">
            </div>
            <div class="dropdown-options" data-dropdown="${id}">
              ${options.map(opt => {
                const value = opt.value !== undefined ? opt.value : (opt.account_id || opt);
                const display = map ? (map.get(value) || value) : value;
                const checked = hasSelection && selected.includes(value);
                return `
                  <label class="dropdown-option ${checked ? 'checked' : ''}">
                    <input type="checkbox" value="${this.escapeHtml(String(value))}"
                      data-field="${id}" ${checked ? 'checked' : ''}>
                    <span>${this.escapeHtml(String(display))}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        ${hasSelection ? this._renderSelectedPreview(id, selected, map) : ''}
      </div>
    `;
  }

  _renderSelectedPreview(fieldKey, values, displayMap) {
    if (!Array.isArray(values) || values.length === 0) return '';
    const names = displayMap
      ? values.map(v => displayMap.get(v) || v)
      : values;
    if (values.length <= 3) {
      return `<div class="multi-select-preview">${names.map((n, i) => `
        <span class="chip">
          ${this.escapeHtml(String(n))}
          <button class="chip-remove" data-field="${fieldKey}" data-value="${this.escapeHtml(String(values[i]))}">×</button>
        </span>
      `).join('')}</div>`;
    }
    return `<div class="multi-select-preview">${values.length} selected</div>`;
  }

  renderDateFilter() {
    return `
      <div class="filter-field">
        <div class="filter-field-header">
          <label for="date-filter">Updated After</label>
          ${this.filters.updatedAfter ? this.renderClearButton('updatedAfter') : ''}
        </div>
        <input type="date" id="date-filter" class="filter-input"
          value="${this.filters.updatedAfter || ''}" />
      </div>
      <div class="filter-field">
        <div class="filter-field-header">
          <label for="to-be-tested-filter">To Be Tested By</label>
          ${this.filters.toBeTestedByDate ? this.renderClearButton('toBeTestedByDate') : ''}
        </div>
        <input type="date" id="to-be-tested-filter" class="filter-input"
          value="${this.filters.toBeTestedByDate || ''}"
          title="Show issues that need testing before this date" />
      </div>
    `;
  }

  renderClearButton(fieldKey) {
    return `<button class="clear-field-btn" data-field="${fieldKey}" title="Clear" type="button">×</button>`;
  }

  _userMap(users) {
    if (!users || !users.length) return new Map();
    return new Map(users.map(u => [u.account_id || u.accountId, u.display_name || u.displayName]));
  }

  refresh() {
    const container = document.getElementById('filter-panel');
    if (container) {
      document.removeEventListener('click', this._boundClickOutside);
      this.openDropdown = null;
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  bindEvents() {
    document.addEventListener('click', this._boundClickOutside);

    // Search
    document.getElementById('search-filter')?.addEventListener('input', (e) => {
      this.filters.searchQuery = e.target.value || null;
      this.emitChange();
    });

    // Single selects (Project, Board, Sprint)
    for (const id of ['project', 'board', 'sprint']) {
      document.getElementById(`${id}-filter`)?.addEventListener('change', (e) => {
        const fieldMap = { project: 'projectKey', board: 'boardId', sprint: 'sprintId' };
        const val = e.target.value;
        if (id === 'project') {
          this.filters[fieldMap[id]] = val || null;
        } else {
          this.filters[fieldMap[id]] = val ? Number(val) : null;
        }
        this.emitChange();
      });
    }

    // Clear all
    document.getElementById('clear-filters-btn')?.addEventListener('click', () => this.clearAll());

    // Per-field clear buttons
    document.querySelectorAll('.clear-field-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.clearField(btn.getAttribute('data-field'));
      });
    });

    // Multi-select trigger buttons
    document.querySelectorAll('.multi-select-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = btn.getAttribute('data-field');
        this._toggleDropdown(field);
      });
    });

    // Multi-select checkboxes
    document.querySelectorAll('.multi-select input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const field = cb.getAttribute('data-field');
        const value = cb.value;
        if (!Array.isArray(this.filters[field])) {
          this.filters[field] = [];
        }
        if (cb.checked) {
          if (!this.filters[field].includes(value)) {
            this.filters[field].push(value);
          }
        } else {
          this.filters[field] = this.filters[field].filter(v => v !== value);
        }
        if (this.filters[field].length === 0) {
          delete this.filters[field];
        }
        this.emitChange();
        this.refresh();
      });
    });

    // Dropdown action buttons (Select all / Clear)
    document.querySelectorAll('.dropdown-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const field = btn.getAttribute('data-field');
        const action = btn.getAttribute('data-action');
        if (action === 'all') {
          const checkboxes = document.querySelectorAll(`#dropdown-${field} input[type="checkbox"]`);
          const values = Array.from(checkboxes).map(cb => cb.value);
          this.filters[field] = values.length > 0 ? values : null;
          if (!this.filters[field]) delete this.filters[field];
        } else {
          delete this.filters[field];
        }
        this.emitChange();
        this.refresh();
      });
    });

    // Dropdown search inputs
    document.querySelectorAll('.dropdown-search-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const dropdownId = input.getAttribute('data-dropdown');
        const query = e.target.value.toLowerCase();
        const options = document.querySelectorAll(`#dropdown-${dropdownId} .dropdown-option`);
        options.forEach(opt => {
          const text = opt.querySelector('span').textContent.toLowerCase();
          opt.style.display = !query || text.includes(query) ? '' : 'none';
        });
      });
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => e.stopPropagation());
    });

    // Chip remove buttons
    document.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeValue(btn.getAttribute('data-field'), btn.getAttribute('data-value'));
      });
    });

    // Date inputs
    document.getElementById('date-filter')?.addEventListener('change', (e) => {
      this.filters.updatedAfter = e.target.value || null;
      this.emitChange();
    });
    document.getElementById('to-be-tested-filter')?.addEventListener('change', (e) => {
      this.filters.toBeTestedByDate = e.target.value || null;
      this.emitChange();
    });

    // Section collapse toggle
    document.querySelectorAll('.filter-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.filter-section');
        section.classList.toggle('collapsed');
      });
    });
  }

  _toggleDropdown(field) {
    const dropdown = document.getElementById(`dropdown-${field}`);
    if (!dropdown) return;

    if (this.openDropdown && this.openDropdown !== dropdown) {
      this.openDropdown.classList.remove('open');
    }

    if (this.openDropdown === dropdown) {
      dropdown.classList.remove('open');
      this.openDropdown = null;
    } else {
      dropdown.classList.add('open');
      this.openDropdown = dropdown;
      this._positionDropdown(dropdown);
    }
  }

  _positionDropdown(dropdown) {
    const trigger = dropdown.previousElementSibling;
    if (!trigger) return;

    const tRect = trigger.getBoundingClientRect();
    const dHeight = Math.min(dropdown.scrollHeight, 260);
    const spaceBelow = window.innerHeight - tRect.bottom;
    const spaceAbove = tRect.top;

    dropdown.style.minWidth = `${tRect.width}px`;
    dropdown.style.left = `${tRect.left}px`;

    if (spaceBelow >= dHeight || spaceBelow >= spaceAbove) {
      dropdown.style.top = `${tRect.bottom + 3}px`;
      dropdown.style.bottom = 'auto';
    } else {
      dropdown.style.bottom = `${window.innerHeight - tRect.top + 3}px`;
      dropdown.style.top = 'auto';
    }
  }

  _handleClickOutside(e) {
    if (!this.openDropdown) return;
    if (!this.openDropdown.classList.contains('open')) return;

    const clickedInside = this.openDropdown.contains(e.target) ||
      e.target.closest('.multi-select-trigger');
    if (!clickedInside) {
      this.openDropdown.classList.remove('open');
      this.openDropdown = null;
    }
  }

  emitChange() {
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
  }

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
  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .filter-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--text);
  }

  .filter-active-count {
    background: var(--accent);
    color: #fff;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 600;
    min-width: 18px;
    text-align: center;
  }

  .filter-issue-count {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .filter-search-bar {
    position: relative;
    margin-bottom: 12px;
  }

  .filter-search-input {
    width: 100%;
    padding: 10px 36px 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--bg);
    color: var(--text);
    box-sizing: border-box;
  }

  .filter-search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .filter-search-bar .clear-field-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
  }

  .filter-sections {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .filter-section {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .filter-section.collapsed .filter-section-body {
    display: none;
  }

  .filter-section.collapsed .filter-section-arrow {
    transform: rotate(-90deg);
  }

  .filter-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: var(--code-bg);
    color: var(--text-h);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .filter-section-header:hover {
    background: var(--hover);
  }

  .filter-section-arrow {
    font-size: 10px;
    transition: transform 0.15s ease;
    color: var(--text-secondary);
  }

  .filter-section-title {
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .filter-section-body {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
    padding: 12px;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .filter-field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .filter-field-header label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .filter-select,
  .filter-input {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 13px;
    background: var(--bg);
    color: var(--text);
    width: 100%;
    box-sizing: border-box;
  }

  .filter-select:focus,
  .filter-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .clear-field-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .clear-field-btn:hover {
    color: var(--text);
    background: var(--hover);
  }

  /* Multi-select dropdown */
  .multi-select {
    position: relative;
  }

  .multi-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 13px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    box-sizing: border-box;
    text-align: left;
  }

  .multi-select-trigger:hover {
    border-color: var(--accent);
  }

  .multi-select-count {
    background: var(--accent);
    color: #fff;
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 600;
    margin-right: 2px;
  }

  .multi-select-label {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .multi-select-arrow {
    font-size: 10px;
    color: var(--text-secondary);
    flex-shrink: 0;
    margin-left: 6px;
  }

  .multi-select-dropdown {
    display: none;
    position: fixed;
    z-index: 1000;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    max-height: 260px;
    overflow: hidden;
    min-width: 200px;
  }

  .multi-select-dropdown.open {
    display: flex;
    flex-direction: column;
  }

  .dropdown-actions {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .dropdown-action-btn {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--code-bg);
    color: var(--text-secondary);
    font-size: 11px;
    cursor: pointer;
  }

  .dropdown-action-btn:hover {
    background: var(--hover);
    color: var(--text);
  }

  .dropdown-search {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .dropdown-search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    background: var(--bg);
    color: var(--text);
  }

  .dropdown-search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .dropdown-options {
    overflow-y: auto;
    max-height: 170px;
    padding: 4px 0;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dropdown-option:hover {
    background: var(--hover);
  }

  .dropdown-option.checked {
    background: var(--accent-bg);
  }

  .dropdown-option input[type="checkbox"] {
    accent-color: var(--accent);
    flex-shrink: 0;
  }

  .dropdown-option span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .multi-select-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    background: var(--hover);
    color: var(--text);
  }

  .chip .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 50%;
    font-size: 12px;
    line-height: 1;
    padding: 0;
  }

  .chip .chip-remove:hover {
    background: var(--text-secondary);
    color: var(--background);
  }
`;
