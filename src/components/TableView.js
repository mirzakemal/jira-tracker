/**
 * Table View Component
 * Displays issues in a customizable table format
 */

import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class TableView {
  constructor(issues, onIssueClick, options = {}) {
    this.issues = issues || [];
    this.onIssueClick = onIssueClick;
    this.columns = options.columns || this.loadSavedColumns() || this.getDefaultColumns();
    this.sortField = options.sortField || 'updated_at';
    this.sortDirection = options.sortDirection || 'desc';
    this.jiraDomain = options.jiraDomain || '';
    this.issueTags = options.issueTags || {};
    this.onTagsChange = options.onTagsChange || null;
    this.page = 0;
    this.pageSize = 50;
    this._sortedCache = null;
    this._sortedCacheKey = '';
  }

  /**
   * Get default columns
   */
  getDefaultColumns() {
    return ['key', 'issue_type', 'tags', 'summary', 'status', 'priority', 'assignee_name', 'code_reviewer_1_name', 'code_reviewer_2_name', 'fix_version'];
  }

  loadSavedColumns() {
    try {
      const saved = localStorage.getItem('jira-planner-columns');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  saveColumns(columns) {
    try {
      localStorage.setItem('jira-planner-columns', JSON.stringify(columns));
    } catch {
      // localStorage might be full or unavailable
    }
  }

  /**
   * Get available columns
   */
  getAvailableColumns() {
    return [
      { id: 'key', label: 'Key' },
      { id: 'summary', label: 'Summary' },
      { id: 'status', label: 'Status' },
      { id: 'priority', label: 'Priority' },
      { id: 'issue_type', label: 'Type' },
      { id: 'reporter_name', label: 'Reporter' },
      { id: 'assignee_name', label: 'Assignee' },
      { id: 'code_reviewer_1_name', label: 'Code Reviewer #1' },
      { id: 'code_reviewer_2_name', label: 'Code Reviewer #2' },
      { id: 'reviewers', label: 'Reviewers' },
      { id: 'qa_tester_name', label: 'QA Tester' },
      { id: 'fix_version', label: 'Fix Version' },
      { id: 'customer', label: 'Customer' },
      { id: 'product', label: 'Product' },
      { id: 'tags', label: 'Tags' },
      { id: 'sprint_name', label: 'Sprint' },
      { id: 'board_name', label: 'Board' },
      { id: 'project_name', label: 'Project' },
      { id: 'created_at', label: 'Created' },
      { id: 'updated_at', label: 'Updated' },
      { id: 'resolved_at', label: 'Resolved' }
    ];
  }

  /**
   * Update columns
   */
  setColumns(columns) {
    this.columns = columns;
  }

  /**
   * Update issues (invalidates cache)
   */
  setIssues(issues) {
    this.issues = issues || [];
    this._sortedCache = null;
    this.page = 0;
  }

  /**
   * Update sort (invalidates cache and resets page)
   */
  setSort(field, direction) {
    this.sortField = field;
    this.sortDirection = direction;
    this._sortedCache = null;
    this.page = 0;
    this.refresh();
  }

  /**
   * Go to a specific page
   */
  setPage(page) {
    this.page = Math.max(0, page);
    this.refresh();
  }

  /**
   * Get sorted issues
   */
  getSortedIssues() {
    if (!this.sortField) return this.issues;

    // Cache key based on issue count + sort params
    const cacheKey = `${this.issues.length}|${this.sortField}|${this.sortDirection}`;
    if (this._sortedCache && this._sortedCacheKey === cacheKey) {
      return this._sortedCache;
    }

    const sorted = [...this.issues].sort((a, b) => {
      let aVal = a[this.sortField];
      let bVal = b[this.sortField];

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Handle date fields
      if (['created_at', 'updated_at', 'resolved_at'].includes(this.sortField)) {
        aVal = new Date(aVal || 0);
        bVal = new Date(bVal || 0);
      }

      // Handle numeric comparison for priority (order: Highest > High > Medium > Low)
      if (this.sortField === 'priority') {
        const priorityOrder = { 'Highest': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        aVal = priorityOrder[aVal] || 0;
        bVal = priorityOrder[bVal] || 0;
      }

      // Handle issue key sorting (e.g., "PROJ-123" vs "PROJ-89" or "TSM2-6964" vs "TSM2-81")
      if (this.sortField === 'key') {
        const parseKey = (key) => {
          // Match alphanumeric prefix (e.g., PROJ, TSM2) followed by hyphen and number
          const match = key?.match(/([A-Z0-9]+)-(\d+)/i);
          if (match) {
            return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10) };
          }
          return { prefix: key?.toUpperCase() || '', num: 0 };
        };
        const aKey = parseKey(aVal);
        const bKey = parseKey(bVal);

        // Compare prefix first, then numeric part
        let comparison = aKey.prefix.localeCompare(bKey.prefix);
        if (comparison === 0) {
          comparison = aKey.num - bKey.num;
        }
        const result = this.sortDirection === 'asc' ? comparison : -comparison;
        return result;
      }

      // Handle fix_version field (extract numeric part for sorting, e.g., "v1.2" or "1.0.0")
      if (this.sortField === 'fix_version') {
        const parseVersion = (ver) => {
          const nums = String(ver).match(/\d+/g);
          if (nums) {
            return nums.map(n => parseInt(n, 10));
          }
          return [0];
        };
        const aVer = parseVersion(aVal);
        const bVer = parseVersion(bVal);

        // Compare version parts
        const maxLen = Math.max(aVer.length, bVer.length);
        for (let i = 0; i < maxLen; i++) {
          const aPart = aVer[i] || 0;
          const bPart = bVer[i] || 0;
          if (aPart !== bPart) {
            const comparison = aPart - bPart;
            return this.sortDirection === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      }

      // Handle customer field (comma-separated values) - use first customer for sorting
      if (this.sortField === 'customer' && typeof aVal === 'string') {
        aVal = aVal.split(',')[0]?.trim() || '';
        bVal = bVal.split(',')[0]?.trim() || '';
      }

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      } else if (aVal < bVal) {
        comparison = -1;
      } else if (aVal > bVal) {
        comparison = 1;
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this._sortedCache = sorted;
    this._sortedCacheKey = cacheKey;
    return sorted;
  }

  /**
   * Render the table
   */
  render() {
    if (!this.issues || this.issues.length === 0) {
      return this.renderEmpty();
    }

    const sortedIssues = this.getSortedIssues();
    const totalPages = Math.ceil(sortedIssues.length / this.pageSize);
    const safePage = Math.min(this.page, totalPages - 1);
    const start = safePage * this.pageSize;
    const paginatedIssues = sortedIssues.slice(start, start + this.pageSize);
    const availableColumns = this.getAvailableColumns();

    // Column labels for header mapping
    const colLabels = {};
    for (const c of availableColumns) {
      colLabels[c.id] = c.label;
    }

    return `
      <div class="table-view" id="table-view">
        <div class="table-header">
          <div class="table-title">
            Showing ${start + 1}–${Math.min(start + this.pageSize, sortedIssues.length)} of ${sortedIssues.length} issue${sortedIssues.length !== 1 ? 's' : ''}
          </div>
          <button class="customize-columns-btn" id="customize-columns-btn">
            Customize Columns
          </button>
        </div>

        <div class="table-container">
          <table class="issues-table">
            <thead>
              <tr>
                ${this.columns.map(col => {
                  const colDef = availableColumns.find(c => c.id === col);
                  const isSortable = ['key', 'summary', 'status', 'priority', 'issue_type', 'assignee_name', 'reporter_name', 'qa_tester_name', 'fix_version', 'customer', 'product', 'created_at', 'updated_at', 'resolved_at'].includes(col);
                  const sortIcon = this.sortField === col
                    ? (this.sortDirection === 'asc' ? '↑' : '↓')
                    : '';

                  return `
                    <th
                      class="table-col ${col} ${isSortable ? 'sortable' : ''}"
                      data-column="${col}"
                      ${isSortable ? `data-sort="${this.sortField === col ? this.sortDirection : ''}"` : ''}
                    >
                      ${colDef?.label || col}
                      ${sortIcon ? `<span class="sort-icon">${sortIcon}</span>` : ''}
                    </th>
                  `;
                }).join('')}
                <th class="table-col actions">Link</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedIssues.map(issue => this.renderRow(issue)).join('')}
            </tbody>
          </table>
        </div>

        ${totalPages > 1 ? `
        <div class="table-pagination">
          <button class="pagination-btn" id="page-first" ${safePage === 0 ? 'disabled' : ''} title="First page">⏮</button>
          <button class="pagination-btn" id="page-prev" ${safePage === 0 ? 'disabled' : ''} title="Previous page">◀</button>
          <span class="pagination-info">Page ${safePage + 1} of ${totalPages}</span>
          <button class="pagination-btn" id="page-next" ${safePage >= totalPages - 1 ? 'disabled' : ''} title="Next page">▶</button>
          <button class="pagination-btn" id="page-last" ${safePage >= totalPages - 1 ? 'disabled' : ''} title="Last page">⏭</button>
        </div>
        ` : ''}

        <div class="column-customizer" id="column-customizer" style="display: none;">
          <div class="column-customizer-content">
            <h4>Customize Columns</h4>
            <p class="customizer-note">Key, Type, Tags, and Code Reviewer columns are always shown</p>
            <div class="column-options">
              ${availableColumns.map(col => {
                const isPermanent = col.id === 'key' || col.id === 'issue_type' || col.id === 'tags' || col.id === 'code_reviewer_1_name' || col.id === 'code_reviewer_2_name';
                return `
                  <label class="column-option ${isPermanent ? 'disabled' : ''}">
                    <input
                      type="checkbox"
                      value="${col.id}"
                      ${this.columns.includes(col.id) ? 'checked' : ''}
                      ${isPermanent ? 'checked disabled' : ''}
                    />
                    ${col.label}
                    ${isPermanent ? '<span class="permanent-badge">(Always shown)</span>' : ''}
                  </label>
                `;
              }).join('')}
            </div>
            <div class="column-customizer-actions">
              <button class="btn btn-secondary" id="close-column-customizer">Close</button>
              <button class="btn btn-primary" id="apply-columns">Apply</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a table row
   */
  renderRow(issue) {
    return `
      <tr class="table-row" data-issue-key="${issue.key}">
        ${this.columns.map(col => `
          <td class="table-cell ${col}">
            ${this.renderCell(issue, col)}
          </td>
        `).join('')}
        <td class="table-cell actions">
          <a
            href="${this.jiraDomain ? `https://${this.jiraDomain.replace(/^https?:\/\//, '')}` : ''}${issue.jira_url || `/browse/${issue.key}`}"
            target="_blank"
            rel="noopener"
            class="issue-link"
            title="Open in Jira"
          >
            🔗 Open
          </a>
        </td>
      </tr>
    `;
  }

  /**
   * Render cell content
   */
  renderCell(issue, column) {
    const value = issue[column];

    if (value === null || value === undefined || value === '') {
      return '<span class="empty-value">-</span>';
    }

    // Special rendering for tags column
    if (column === 'tags') {
      const tags = this.issueTags[issue.key] || [];
      return `<div class="tags-cell" data-issue-key="${issue.key}">${this.renderTags(issue.key, tags)}</div>`;
    }

    // Special rendering for certain columns
    switch (column) {
      case 'key':
        return `<span class="issue-key">${escapeHtml(value)}</span>`;

      case 'summary':
        return `<span class="issue-summary" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;

      case 'priority':
        return `<span class="priority-badge ${this.getPriorityClass(value)}">${escapeHtml(value)}</span>`;

      case 'status':
        return `<span class="status-badge">${escapeHtml(value)}</span>`;

      case 'created_at':
      case 'updated_at':
      case 'resolved_at':
        return `<span class="date-value" title="${value}">${formatDate(value)}</span>`;

      case 'assignee_name':
      case 'reporter_name':
      case 'qa_tester_name':
      case 'code_reviewer_1_name':
      case 'code_reviewer_2_name':
        return `<span class="user-badge">👤 ${escapeHtml(value)}</span>`;

      case 'issue_type':
        return `<span class="issue-type-badge">${escapeHtml(value)}</span>`;

      case 'reviewers':
        // Reviewers are stored as comma-separated account IDs
        // For now, show the raw IDs or a count
        if (!value) return '<span class="empty-value">-</span>';
        const reviewerList = value.split(',').filter(r => r);
        return `<span class="reviewers-badge" title="Reviewers: ${reviewerList.length}">👁 ${reviewerList.length}</span>`;

      default:
        return `<span>${escapeHtml(value)}</span>`;
    }
  }

  /**
   * Render tags for an issue
   */
  renderTags(issueKey, tags) {
    if (!tags || tags.length === 0) {
      return '<span class="no-tags">No tags</span>';
    }

    return tags.map(tag => `
      <span class="tag-badge" data-tag="${escapeHtml(tag)}">
        ${escapeHtml(tag)}
      </span>
    `).join('');
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    return `
      <div class="table-view-empty">
        <p>No issues found</p>
        <p class="empty-hint">Try adjusting your filters or sync more data</p>
      </div>
    `;
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Column customization
    const customizeBtn = document.getElementById('customize-columns-btn');
    const customizer = document.getElementById('column-customizer');
    const closeBtn = document.getElementById('close-column-customizer');
    const applyBtn = document.getElementById('apply-columns');

    customizeBtn?.addEventListener('click', () => {
      if (customizer) customizer.style.display = 'block';
    });

    closeBtn?.addEventListener('click', () => {
      if (customizer) customizer.style.display = 'none';
    });

    applyBtn?.addEventListener('click', () => {
      const checkboxes = customizer?.querySelectorAll('input[type="checkbox"]');
      if (checkboxes) {
        const selectedColumns = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);

        // Ensure permanent columns are always included
        const permanentColumns = ['key', 'issue_type', 'tags', 'code_reviewer_1_name', 'code_reviewer_2_name'];
        for (const col of permanentColumns) {
          if (!selectedColumns.includes(col)) {
            selectedColumns.unshift(col);
          }
        }

        if (selectedColumns.length > 0) {
          this.setColumns(selectedColumns);
          this.saveColumns(selectedColumns);
          this.refresh();
        }
      }
      if (customizer) customizer.style.display = 'none';
    });

    // Sort handling
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.column;
        const currentDirection = header.dataset.sort;

        // Toggle: none -> asc -> desc -> asc (cycle)
        let newDirection = 'asc';
        if (currentDirection === 'asc') {
          newDirection = 'desc';
        } else if (currentDirection === 'desc') {
          newDirection = 'asc';
        }

        logger.debug('[TableView] Sorting by', column, newDirection);
        this.setSort(column, newDirection);
      });
    });

    // Row click handling
    const rows = document.querySelectorAll('.table-row');
    rows.forEach(row => {
      row.addEventListener('click', (e) => {
        // Don't trigger if clicking on link or tags
        if (e.target.closest('.issue-link') || e.target.closest('.tags-cell')) return;

        const issueKey = row.dataset.issueKey;
        if (this.onIssueClick && issueKey) {
          this.onIssueClick(issueKey);
        }
      });
    });

    // Pagination controls
    document.getElementById('page-first')?.addEventListener('click', () => this.setPage(0));
    document.getElementById('page-prev')?.addEventListener('click', () => this.setPage(this.page - 1));
    document.getElementById('page-next')?.addEventListener('click', () => this.setPage(this.page + 1));
    document.getElementById('page-last')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.getSortedIssues().length / this.pageSize);
      this.setPage(totalPages - 1);
    });

    // Tags cell click handling - open tags editor modal
    const tagsCells = document.querySelectorAll('.tags-cell');
    tagsCells.forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const issueKey = cell.dataset.issueKey;
        this.openTagsEditor(issueKey);
      });
    });
  }

  /**
   * Open tags editor modal
   */
  async openTagsEditor(issueKey) {
    const issue = this.issues.find(i => i.key === issueKey);
    if (!issue) return;

    // Guard against duplicate modals
    const existingModal = document.getElementById('tags-editor-modal');
    if (existingModal) existingModal.remove();

    const tags = this.issueTags[issueKey] || [];
    const knownTags = await this.getAllKnownTags();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'tags-editor-modal';
    modal.className = 'tags-editor-modal';
    modal.innerHTML = `
      <div class="tags-editor-content">
        <div class="tags-editor-header">
          <h4>Manage Tags for ${issue.key}</h4>
          <button class="modal-close" id="tags-modal-close">&times;</button>
        </div>
        <div class="tags-editor-body">
          <p class="tags-editor-summary">${escapeHtml(issue.summary)}</p>
          <div class="tags-editor-existing" id="tags-editor-existing">
            ${tags.length === 0
              ? '<p class="no-tags">No tags yet</p>'
              : tags.map(tag => `
                  <span class="tag-badge" data-tag="${escapeHtml(tag)}">
                    ${escapeHtml(tag)}
                    <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
                  </span>
                `).join('')
            }
          </div>
          <div class="tags-editor-add">
            <input
              type="text"
              id="new-tag-input"
              class="tag-input"
              placeholder="Enter tag name..."
              list="tags-datalist"
            />
            <datalist id="tags-datalist">
              ${knownTags.map(tag => `<option value="${escapeHtml(tag)}">`).join('')}
            </datalist>
            <button class="btn btn-primary" id="add-tag-btn">Add Tag</button>
          </div>
        </div>
        <div class="tags-editor-footer">
          <button class="btn btn-secondary" id="tags-modal-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.bindTagsEditorEvents(issueKey);
  }

  /**
   * Get all known tags for suggestions
   */
  async getAllKnownTags() {
    try {
      const { getAllTags } = await import('../db/queries.js');
      return getAllTags();
    } catch (e) {
      return [];
    }
  }

  /**
   * Bind tags editor events
   */
  bindTagsEditorEvents(issueKey) {
    const closeBtn = document.getElementById('tags-modal-close');
    const doneBtn = document.getElementById('tags-modal-done');
    const addBtn = document.getElementById('add-tag-btn');
    const input = document.getElementById('new-tag-input');
    const existingContainer = document.getElementById('tags-editor-existing');

    const closeModal = () => {
      const modal = document.getElementById('tags-editor-modal');
      if (modal) {
        modal.remove();
        // Refresh table after modal is closed to reflect tag changes
        this.refresh();
      }
    };

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);

    addBtn?.addEventListener('click', async () => {
      const tagName = input?.value?.trim();
      if (!tagName) return;

      try {
        const { addTag, getTags } = await import('../db/queries.js');

        await addTag(issueKey, tagName);
        const newTags = await getTags(issueKey);
        this.issueTags[issueKey] = newTags;

        if (existingContainer) {
          existingContainer.innerHTML = newTags.length === 0
            ? '<p class="no-tags">No tags yet</p>'
            : newTags.map(tag => `
                <span class="tag-badge" data-tag="${escapeHtml(tag)}">
                  ${escapeHtml(tag)}
                  <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
                </span>
              `).join('');
        }

        if (input) input.value = '';
      } catch (error) {
        logger.error('[TableView] Failed to add tag:', error);
      }
    });

    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addBtn?.click();
      }
    });

    // Use event delegation for tag-remove buttons (survives innerHTML changes)
    existingContainer?.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('.tag-remove');
      if (!removeBtn) return;

      const tag = removeBtn.dataset.tag;
      const { removeTag, getTags } = await import('../db/queries.js');

      try {
        await removeTag(issueKey, tag);
        const updatedTags = await getTags(issueKey);
        this.issueTags[issueKey] = updatedTags;

        existingContainer.innerHTML = updatedTags.length === 0
          ? '<p class="no-tags">No tags yet</p>'
          : updatedTags.map(t => `
              <span class="tag-badge" data-tag="${escapeHtml(t)}">
                ${escapeHtml(t)}
                <button class="tag-remove" data-tag="${escapeHtml(t)}">&times;</button>
              </span>
            `).join('');
      } catch (error) {
        logger.error('[TableView] Failed to remove tag:', error);
      }
    });
  }

  /**
   * Refresh the component in the DOM
   */
  refresh() {
    const container = document.getElementById('table-view');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Get priority class for styling
   */
  getPriorityClass(priority) {
    if (!priority) return '';
    const p = priority.toLowerCase();
    if (p.includes('highest')) return 'priority-highest';
    if (p.includes('high')) return 'priority-high';
    if (p.includes('medium')) return 'priority-medium';
    if (p.includes('low')) return 'priority-low';
    return '';
  }

}

/**
 * Table View Styles
 */
export const TableViewStyles = `
  .table-view {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  .table-title {
    font-weight: 600;
    color: var(--text);
  }

  .table-container {
    overflow-x: auto;
    max-height: 70vh;
    overflow-y: auto;
  }

  .issues-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .issues-table thead {
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 10;
  }

  .issues-table th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
    cursor: default;
  }

  .issues-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .issues-table th.sortable:hover {
    background: var(--hover);
  }

  .issues-table th .sort-icon {
    margin-left: 4px;
    opacity: 0.6;
  }

  .issues-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .issues-table tbody tr {
    transition: background 0.2s ease;
  }

  .issues-table tbody tr:hover {
    background: var(--hover);
    cursor: pointer;
  }

  .table-cell {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-cell.summary {
    max-width: 250px;
  }

  .table-cell.actions {
    width: 80px;
    text-align: center;
  }

  .issue-key {
    font-weight: 600;
    color: var(--primary);
    white-space: nowrap;
  }

  .issue-summary {
    color: var(--text);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    cursor: help;
  }


  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .priority-highest { background: #ffebee; color: #c62828; }
  .priority-high { background: #fff3e0; color: #e65100; }
  .priority-medium { background: #fff8e1; color: #f9a825; }
  .priority-low { background: #e8f5e9; color: #2e7d32; }

  .user-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .issue-type-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--hover);
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
  }

  .tags-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .tags-cell:hover {
    background: var(--hover);
  }

  .tags-cell .tag-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--primary-bg);
    color: var(--primary);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .tags-cell .no-tags {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .date-value {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .empty-value {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .customizer-note {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;
    font-style: italic;
  }

  .column-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .column-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .column-option:hover {
    background: var(--hover);
  }

  .column-option.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .column-option .permanent-badge {
    font-size: 11px;
    color: var(--text-secondary);
    font-style: italic;
    margin-left: auto;
  }

  .table-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .pagination-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s ease;
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--hover);
  }

  .pagination-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .pagination-info {
    font-size: 13px;
    color: var(--text-secondary);
    min-width: 100px;
    text-align: center;
  }
`;
