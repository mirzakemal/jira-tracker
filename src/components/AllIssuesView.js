/**
 * All Issues View Component
 * Main container for viewing all issues with filters and table view
 */

import { FilterPanel, FilterPanelStyles } from './FilterPanel.js';
import { TableView, TableViewStyles } from './TableView.js';
import { SavedViewsMenu, SavedViewsMenuStyles } from './SavedViewsMenu.js';
import { TagsManagerStyles } from './TagsManager.js';
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
  getTagsForIssues,
  invalidateFilterCache,
  getAllProjects
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

      // Load tags for all issues in a single batch query
      const issueKeys = this.issues.map(i => i.key);
      this.issueTags = await getTagsForIssues(issueKeys);

      // Load filter options only once (they're cached after first load)
      if (!this.filterOptionsLoaded) {
        await this.loadFilterOptions();
        this.filterOptionsLoaded = true;
      }

      this.isLoading = false;
      this.refresh();

      // Update URL with current filters
      this.updateUrlFilters();

      // Store reference globally for router
      window.currentAllIssuesView = this;
    } catch (error) {
      console.error('[AllIssuesView] Failed to load issues:', error);
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
      console.error('[AllIssuesView] Failed to load issues:', error);
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
    const filterPanelHeader = document.querySelector('#filter-panel-container .filter-header h3');
    if (filterPanelHeader) {
      filterPanelHeader.textContent = `Filters (${this.issues.length} issues)`;
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
  }

  /**
   * Open issue in Jira
   */
  openIssue(issueKey) {
    const url = this.jiraDomain
      ? `https://${this.jiraDomain.replace(/^https?:\/\//, '')}/browse/${issueKey}`
      : `/browse/${issueKey}`;
    window.open(url, '_blank');
  }
}

/**
 * All Issues View Styles
 */
export const AllIssuesViewStyles = `
  .all-issues-view {
    padding: 20px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .view-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .view-header-left h2 {
    margin: 0;
    color: var(--text);
    font-size: 24px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: var(--hover);
  }

  .view-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 16px;
  }

  .loading-container p {
    color: var(--text-secondary);
  }
`;
