/**
 * Table View Component
 * Displays issues in a customizable table format
 */

export class TableView {
  constructor(issues, onIssueClick, options = {}) {
    this.issues = issues || [];
    this.onIssueClick = onIssueClick;
    this.columns = options.columns || this.getDefaultColumns();
    this.sortField = options.sortField || 'updated_at';
    this.sortDirection = options.sortDirection || 'desc';
    this.jiraDomain = options.jiraDomain || '';
    this.issueTags = options.issueTags || {};
    this.onTagsChange = options.onTagsChange || null;
  }

  /**
   * Get default columns
   */
  getDefaultColumns() {
    return ['key', 'tags', 'summary', 'status', 'priority', 'assignee_name', 'fix_version'];
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
   * Update sort
   */
  setSort(field, direction) {
    this.sortField = field;
    this.sortDirection = direction;
  }

  /**
   * Render the table
   */
  render() {
    if (!this.issues || this.issues.length === 0) {
      return this.renderEmpty();
    }

    const availableColumns = this.getAvailableColumns();

    return `
      <div class="table-view" id="table-view">
        <div class="table-header">
          <div class="table-title">
            ${this.issues.length} issue${this.issues.length !== 1 ? 's' : ''}
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
                  const isSortable = ['key', 'summary', 'status', 'priority', 'created_at', 'updated_at', 'resolved_at'].includes(col);
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
              ${this.issues.map(issue => this.renderRow(issue)).join('')}
            </tbody>
          </table>
        </div>

        <div class="column-customizer" id="column-customizer" style="display: none;">
          <div class="column-customizer-content">
            <h4>Customize Columns</h4>
            <p class="customizer-note">Key and Tags columns are always shown</p>
            <div class="column-options">
              ${availableColumns.map(col => {
                const isPermanent = col.id === 'key' || col.id === 'tags';
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
            href="${this.jiraDomain ? `https://${this.jiraDomain}` : ''}${issue.jira_url || `/browse/${issue.key}`}"
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
        return `<span class="issue-key">${this.escapeHtml(value)}</span>`;

      case 'summary':
        return `<span class="issue-summary">${this.escapeHtml(value)}</span>`;

      case 'priority':
        return `<span class="priority-badge ${this.getPriorityClass(value)}">${this.escapeHtml(value)}</span>`;

      case 'status':
        return `<span class="status-badge">${this.escapeHtml(value)}</span>`;

      case 'created_at':
      case 'updated_at':
      case 'resolved_at':
        return `<span class="date-value" title="${value}">${this.formatDate(value)}</span>`;

      case 'assignee_name':
      case 'reporter_name':
      case 'qa_tester_name':
        return `<span class="user-badge">👤 ${this.escapeHtml(value)}</span>`;

      case 'reviewers':
        // Reviewers are stored as comma-separated account IDs
        // For now, show the raw IDs or a count
        if (!value) return '<span class="empty-value">-</span>';
        const reviewerList = value.split(',').filter(r => r);
        return `<span class="reviewers-badge" title="Reviewers: ${reviewerList.length}">👁 ${reviewerList.length}</span>`;

      default:
        return `<span>${this.escapeHtml(value)}</span>`;
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
      <span class="tag-badge" data-tag="${this.escapeHtml(tag)}">
        ${this.escapeHtml(tag)}
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
        const permanentColumns = ['key', 'tags'];
        for (const col of permanentColumns) {
          if (!selectedColumns.includes(col)) {
            selectedColumns.unshift(col);
          }
        }

        if (selectedColumns.length > 0) {
          this.setColumns(selectedColumns);
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

        let newDirection = 'asc';
        if (currentDirection === 'asc') {
          newDirection = 'desc';
        }

        if (this.onSort) {
          this.onSort(column, newDirection);
        }
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
          <p class="tags-editor-summary">${this.escapeHtml(issue.summary)}</p>
          <div class="tags-editor-existing" id="tags-editor-existing">
            ${tags.length === 0
              ? '<p class="no-tags">No tags yet</p>'
              : tags.map(tag => `
                  <span class="tag-badge" data-tag="${this.escapeHtml(tag)}">
                    ${this.escapeHtml(tag)}
                    <button class="tag-remove" data-tag="${this.escapeHtml(tag)}">&times;</button>
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
              ${knownTags.map(tag => `<option value="${this.escapeHtml(tag)}">`).join('')}
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
      if (modal) modal.remove();
    };

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);

    addBtn?.addEventListener('click', async () => {
      const tagName = input?.value?.trim();
      if (!tagName) return;

      const { addTag, getTagsForIssues } = await import('../db/queries.js');

      try {
        addTag(issueKey, tagName);
        // Refresh tags
        const newTags = getTagsForIssues([issueKey]);
        this.issueTags = { ...this.issueTags, ...newTags };
        this.refresh();

        // Update the modal
        const tags = this.issueTags[issueKey] || [];
        if (existingContainer) {
          existingContainer.innerHTML = tags.map(tag => `
            <span class="tag-badge" data-tag="${this.escapeHtml(tag)}">
              ${this.escapeHtml(tag)}
              <button class="tag-remove" data-tag="${this.escapeHtml(tag)}">&times;</button>
            </span>
          `).join('');

          // Bind remove events
          existingContainer.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const tag = btn.dataset.tag;
              const { removeTag } = await import('../db/queries.js');
              removeTag(issueKey, tag);

              // Refresh
              const { getTagsForIssues } = await import('../db/queries.js');
              const newTags = getTagsForIssues([issueKey]);
              this.issueTags = { ...this.issueTags, ...newTags };
              this.refresh();

              // Update modal
              const updatedTags = this.issueTags[issueKey] || [];
              existingContainer.innerHTML = updatedTags.length === 0
                ? '<p class="no-tags">No tags yet</p>'
                : updatedTags.map(t => `
                    <span class="tag-badge" data-tag="${this.escapeHtml(t)}">
                      ${this.escapeHtml(t)}
                      <button class="tag-remove" data-tag="${this.escapeHtml(t)}">&times;</button>
                    </span>
                  `).join('');
            });
          });
        }

        if (input) input.value = '';
      } catch (error) {
        console.error('[TableView] Failed to add tag:', error);
      }
    });

    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addBtn?.click();
      }
    });

    // Bind remove events for existing tags
    existingContainer?.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tag = btn.dataset.tag;
        const { removeTag, getTagsForIssues } = await import('../db/queries.js');

        try {
          removeTag(issueKey, tag);
          // Refresh
          const newTags = getTagsForIssues([issueKey]);
          this.issueTags = { ...this.issueTags, ...newTags };
          this.refresh();

          // Update modal
          const updatedTags = this.issueTags[issueKey] || [];
          existingContainer.innerHTML = updatedTags.length === 0
            ? '<p class="no-tags">No tags yet</p>'
            : updatedTags.map(t => `
                <span class="tag-badge" data-tag="${this.escapeHtml(t)}">
                  ${this.escapeHtml(t)}
                  <button class="tag-remove" data-tag="${this.escapeHtml(t)}">&times;</button>
                </span>
              `).join('');
        } catch (error) {
          console.error('[TableView] Failed to remove tag:', error);
        }
      });
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

  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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

  .customize-columns-btn {
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .customize-columns-btn:hover {
    background: var(--hover);
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
    max-width: 500px;
  }

  .table-cell.actions {
    width: 80px;
    text-align: center;
  }

  .issue-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 13px;
  }

  .issue-link:hover {
    text-decoration: underline;
  }

  .issue-key {
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
  }

  .issue-summary {
    color: var(--text);
  }

  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--hover);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
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
    background: var(--accent-bg);
    color: var(--accent);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .tags-cell .no-tags {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .tags-editor-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .tags-editor-content {
    background: var(--surface);
    border-radius: 12px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  .tags-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .tags-editor-header h4 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close:hover {
    color: var(--text);
  }

  .tags-editor-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tags-editor-summary {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .tags-editor-existing {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 32px;
  }

  .tags-editor-existing .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--accent-bg);
    color: var(--accent);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .tags-editor-existing .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    transition: all 0.2s ease;
  }

  .tags-editor-existing .tag-remove:hover {
    background: var(--accent);
    color: white;
  }

  .tags-editor-add {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .tags-editor-add .tag-input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--background);
    color: var(--text);
  }

  .tags-editor-add .tag-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .tags-editor-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .date-value {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .empty-value {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .column-customizer {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .column-customizer-content {
    background: var(--surface);
    padding: 24px;
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .column-customizer h4 {
    margin: 0 0 16px 0;
    color: var(--text);
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

  .column-customizer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .table-view-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
  }

  .table-view-empty .empty-hint {
    font-size: 14px;
    margin-top: 8px;
    opacity: 0.8;
  }
`;
