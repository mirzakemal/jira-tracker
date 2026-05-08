/**
 * All Issues View Component
 * Main container for viewing all issues with filters and table view
 */

import { FilterPanel, FilterPanelStyles } from './FilterPanel.js';
import { TableView, TableViewStyles } from './TableView.js';
import { SavedViewsMenu, SavedViewsMenuStyles } from './SavedViewsMenu.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';
import logger from '../utils/logger.js';
import { debounce } from '../utils/debounce.js';
import {
  getAllIssues,
  getFixVersions,
  getCustomers,
  getProducts,
  getAllUsers,
  getStatuses,
  getIssueTypes,
  getAllTags,
  getPriorities,
  getTagsForIssues,
  getAllProjects,
  getAllBoards,
  getAllSprints
} from '../db/queries.js';

export class AllIssuesView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.issues = [];
    this.filters = {};
    this.viewOptions = {
      columns: ['key', 'issue_type', 'tags', 'summary', 'status', 'priority', 'assignee_name', 'code_reviewer_1_name', 'code_reviewer_2_name', 'fix_version'],
      sortField: 'updated_at',
      sortDirection: 'desc'
    };
    this.availableFilterOptions = {};
    this.isLoading = false;
    this.filterOptionsLoaded = false;
    this.userCache = null;

    // Bind handler methods
    this.boundHandleFilterChange = this.handleFilterChange.bind(this);
    this.boundHandleViewLoad = this.handleViewLoad.bind(this);
    this.boundHandleViewSave = this.handleViewSave.bind(this);
    this.boundHandleViewDelete = this.handleViewDelete.bind(this);

    // Create debounced version of filter change handler (300ms delay)
    this.debouncedLoadIssues = debounce((filters) => {
      this._loadIssuesInternal(filters);
    }, 300);
  }

  /**
   * Clean up the view instance: cancel pending debounced calls and mark as destroyed
   */
  destroy() {
    this._destroyed = true;
    if (this.debouncedLoadIssues && this.debouncedLoadIssues.cancel) {
      this.debouncedLoadIssues.cancel();
    }
  }

  /**
   * Load issues from database
   */
  async loadIssues(filters = null, options = {}) {
    const skipLoadingIndicator = options.skipLoadingIndicator === true;

    // Use provided filters or current filters
    if (filters !== null) {
      this.filters = filters;
    }

    // Skip loading indicator for quick filter changes
    if (!skipLoadingIndicator) {
      this.isLoading = true;
      this.refresh();
    }

    try {
      this.issues = await getAllIssues(this.filters);

      // Guard against stale view after async gap
      if (this._destroyed) return;

      // Load tags for all issues in a single batch query
      const issueKeys = this.issues.map(i => i.key);
      this.issueTags = await getTagsForIssues(issueKeys);

      // Load filter options only once (they're cached after first load)
      if (!this.filterOptionsLoaded) {
        await this.loadFilterOptions();
        this.filterOptionsLoaded = true;
      }

      if (this._destroyed) return;

      this.isLoading = false;
      this.refresh();

      // Update URL with current filters
      this.updateUrlFilters();

      // Store reference globally for router
      window.currentAllIssuesView = this;
    } catch (error) {
      logger.error('[AllIssuesView] Failed to load issues:', error);
      if (this._destroyed) return;
      this.isLoading = false;
      this.refresh();
    }
  }

  /**
   * Internal method to load issues (for debounced calls)
   */
  async _loadIssuesInternal(filters) {
    this.filters = filters;

    try {
      this.issues = await getAllIssues(this.filters);

      // Load tags for all issues in a single batch query
      const issueKeys = this.issues.map(i => i.key);
      this.issueTags = await getTagsForIssues(issueKeys);

      // Re-render only the table view, not the entire component
      this.renderTableView();

      // Update URL with current filters
      this.updateUrlFilters();
    } catch (error) {
      logger.error('[AllIssuesView] Failed to load issues:', error);
      this.error = error.message;
      this.isLoading = false;
      this.refresh();
    }
  }

  /**
   * Update URL with current filters
   */
  updateUrlFilters() {
    if (!window.updateQueryParams || !window.filtersToParams) return;

    const params = window.filtersToParams(this.filters);
    params.allIssues = 'true';
    window.updateQueryParams(params, false);
  }

  /**
   * Load available filter options
   */
  async loadFilterOptions() {
    this.availableFilterOptions = {
      projects: await getAllProjects(),
      boards: await getAllBoards(),
      sprints: await getAllSprints(),
      status: await getStatuses(),
      fixVersion: await getFixVersions(),
      customer: await getCustomers(),
      product: await getProducts(),
      assignee: await getAllUsers(),
      reporter: await getAllUsers(),
      qaTester: await getAllUsers(),
      codeReviewer1: await getAllUsers(),
      codeReviewer2: await getAllUsers(),
      issueType: await getIssueTypes(),
      priority: await getPriorities(),
      tags: await getAllTags()
    };
  }

  /**
   * Handle filter change - uses debouncing for better performance
   */
  handleFilterChange(newFilters) {
    // For quick filter changes, use debounced loading without full re-render
    // This prevents API flooding and makes filtering feel instant
    this.debouncedLoadIssues(newFilters);
  }

  /**
   * Handle saved view load
   */
  handleViewLoad(view) {
    this.filters = view.filters || {};
    this.viewOptions.columns = view.columns || this.viewOptions.columns;
    this.loadIssues();
  }

  /**
   * Handle saved view save
   */
  handleViewSave(name) {
    return {
      columns: this.viewOptions.columns,
      filters: this.filters
    };
  }

  /**
   * Handle saved view delete
   */
  handleViewDelete(viewId) {
    // This is handled by SavedViewsMenu
  }

  /**
   * Render the view
   */
  render() {
    if (this.error) return this.renderError();

    const hasActiveFilters = Object.keys(this.filters || {}).length > 0;

    return `
      <div class="all-issues-view" id="all-issues-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">
              ← Back to Board
            </button>
            <h2>All Issues</h2>
          </div>
          <div class="view-header-right">
            <button class="btn btn-secondary export-btn" id="export-csv-btn" title="Export filtered issues as CSV">
              Export CSV
            </button>
            ${hasActiveFilters ? `
              <button class="clear-filters-btn" id="clear-filters-btn" title="Clear all filters">
                Clear Filters
              </button>
            ` : ''}
            <div id="saved-views-menu-container"></div>
          </div>
        </div>

        ${this.isLoading ? `
          <div class="loading-container">
            <div class="spinner"></div>
            <p>Loading issues...</p>
          </div>
        ` : ''}

        ${!this.isLoading ? `
          <div id="filter-panel-container"></div>
          <div id="table-view-container"></div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Refresh the view
   */
  refresh() {
    const container = document.getElementById('all-issues-view');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
      this.renderSubComponents();
    }
  }

  /**
   * Render only the table view (for filter changes without full re-render)
   */
  renderTableView() {
    const tableViewContainer = document.getElementById('table-view-container');
    if (tableViewContainer) {
      const tableView = new TableView(
        this.issues,
        (issueKey) => this.openIssue(issueKey),
        {
          columns: this.viewOptions.columns,
          sortField: this.viewOptions.sortField,
          sortDirection: this.viewOptions.sortDirection,
          jiraDomain: this.jiraDomain,
          issueTags: this.issueTags,
          onTagsChange: (issueKey, tags) => {
            this.issueTags[issueKey] = tags;
          }
        }
      );
      tableViewContainer.innerHTML = tableView.render();
      tableView.bindEvents();
    }

    // Update the issue count in the filter panel header
    const filterCount = document.querySelector('#filter-panel-container .filter-issue-count');
    if (filterCount) {
      filterCount.textContent = `${this.issues.length} issues`;
    }

    // Update URL with current filters
    this.updateUrlFilters();
  }

  /**
   * Render sub-components
   */
  renderSubComponents() {
    if (this.isLoading) return;

    // Render Saved Views Menu
    const savedViewsContainer = document.getElementById('saved-views-menu-container');
    if (savedViewsContainer) {
      const savedViewsMenu = new SavedViewsMenu(
        this.boundHandleViewLoad,
        this.boundHandleViewSave,
        this.boundHandleViewDelete
      );
      savedViewsContainer.innerHTML = savedViewsMenu.render();
      savedViewsMenu.bindEvents();
    }

    // Render Filter Panel
    const filterPanelContainer = document.getElementById('filter-panel-container');
    if (filterPanelContainer) {
      const filterPanel = new FilterPanel(this.filters, this.boundHandleFilterChange);
      filterPanel.setAvailableOptions(this.availableFilterOptions);
      filterPanelContainer.innerHTML = filterPanel.render(this.issues.length);
      filterPanel.bindEvents();
    }

    // Render Table View
    const tableViewContainer = document.getElementById('table-view-container');
    if (tableViewContainer) {
      const tableView = new TableView(
        this.issues,
        (issueKey) => this.openIssue(issueKey),
        {
          columns: this.viewOptions.columns,
          sortField: this.viewOptions.sortField,
          sortDirection: this.viewOptions.sortDirection,
          jiraDomain: this.jiraDomain,
          issueTags: this.issueTags,
          onTagsChange: (issueKey, tags) => {
            this.issueTags[issueKey] = tags;
          }
        }
      );
      tableViewContainer.innerHTML = tableView.render();
      tableView.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const backBtn = document.getElementById('back-btn');
    backBtn?.addEventListener('click', () => {
      if (this.onBack) {
        this.onBack();
      }
    });

    document.getElementById('retry-load-btn')?.addEventListener('click', () => {
      this.error = null;
      this.loadIssues(this.filters);
    });

    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    clearFiltersBtn?.addEventListener('click', () => {
      this.handleClearFilters();
    });

    const exportCsvBtn = document.getElementById('export-csv-btn');
    exportCsvBtn?.addEventListener('click', () => {
      this.exportCSV();
    });
  }

  /**
   * Handle clear all filters
   */
  handleClearFilters() {
    this.filters = {};
    this.loadIssues();
  }

  /**
   * Open issue detail drawer
   */
  openIssue(issueKey) {
    openIssueDrawer(issueKey, this.jiraDomain, () => {
      // clean up - overlay auto-removes in drawer close handler
    });
  }

  exportCSV() {
    if (!this.issues || this.issues.length === 0) return;
    const quote = (str) => `"${(str ?? '').replace(/"/g, '""')}"`;
    const headers = ['Key', 'Summary', 'Issue Type', 'Status', 'Priority', 'Assignee', 'Reporter', 'Fix Version', 'Created', 'Updated'];
    const rows = this.issues.map(i => [
      i.key,
      quote(i.summary),
      quote(i.issue_type),
      quote(i.status),
      quote(i.priority),
      quote(i.assignee_name || 'Unassigned'),
      quote(i.reporter_name),
      quote(i.fix_version),
      i.created_at || '',
      i.updated_at || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jira-issues-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  renderError() {
    return `
      <div class="all-issues-view">
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load issues</h3>
          <p>${this.error || 'Unknown error'}</p>
          <button class="btn btn-primary retry-btn" id="retry-load-btn">Retry</button>
        </div>
      </div>
    `;
  }
}

/**
 * All Issues View Styles
 */
export const AllIssuesViewStyles = `
  .all-issues-view {
    max-width: 1600px;
    margin: 0 auto;
  }

  .clear-filters-btn {
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .clear-filters-btn:hover {
    background: var(--hover);
    color: var(--text);
    border-color: var(--accent);
  }
`;
