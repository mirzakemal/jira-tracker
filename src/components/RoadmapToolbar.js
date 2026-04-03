/**
 * Roadmap Toolbar Component
 * Provides date range selection, grouping options, and zoom controls
 */

export class RoadmapToolbar {
  constructor(filters, onFilterChange) {
    this.filters = filters || {
      startDate: this.getDefaultStartDate(),
      endDate: this.getDefaultEndDate(),
      groupBy: 'epic',
      zoomLevel: 'month'
    };
    this.onFilterChange = onFilterChange;
  }

  /**
   * Get default start date (today)
   */
  getDefaultStartDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * Get default end date (3 months from today)
   */
  getDefaultEndDate() {
    const today = new Date();
    const threeMonths = new Date(today.setMonth(today.getMonth() + 3));
    return threeMonths.toISOString().split('T')[0];
  }

  /**
   * Render the toolbar
   */
  render() {
    return `
      <div class="roadmap-toolbar" id="roadmap-toolbar">
        <div class="toolbar-section">
          <div class="toolbar-group">
            <label for="roadmap-start-date">Start Date</label>
            <input
              type="date"
              id="roadmap-start-date"
              class="toolbar-input"
              value="${this.filters.startDate || ''}"
            />
          </div>
          <div class="toolbar-group">
            <label for="roadmap-end-date">End Date</label>
            <input
              type="date"
              id="roadmap-end-date"
              class="toolbar-input"
              value="${this.filters.endDate || ''}"
            />
          </div>
        </div>

        <div class="toolbar-section">
          <div class="toolbar-group">
            <label for="roadmap-group-by">Group By</label>
            <select id="roadmap-group-by" class="toolbar-select">
              <option value="epic" ${this.filters.groupBy === 'epic' ? 'selected' : ''}>Epic/Theme</option>
              <option value="issue_type" ${this.filters.groupBy === 'issue_type' ? 'selected' : ''}>Issue Type</option>
              <option value="fix_version" ${this.filters.groupBy === 'fix_version' ? 'selected' : ''}>Fix Version</option>
              <option value="status" ${this.filters.groupBy === 'status' ? 'selected' : ''}>Status</option>
              <option value="assignee" ${this.filters.groupBy === 'assignee' ? 'selected' : ''}>Assignee</option>
            </select>
          </div>
          <div class="toolbar-group">
            <label for="roadmap-zoom">Zoom Level</label>
            <select id="roadmap-zoom" class="toolbar-select">
              <option value="week" ${this.filters.zoomLevel === 'week' ? 'selected' : ''}>Weeks</option>
              <option value="month" ${this.filters.zoomLevel === 'month' ? 'selected' : ''}>Months</option>
              <option value="quarter" ${this.filters.zoomLevel === 'quarter' ? 'selected' : ''}>Quarters</option>
            </select>
          </div>
        </div>

        <div class="toolbar-section">
          <div class="toolbar-group">
            <button class="toolbar-btn" id="roadmap-preset-today" title="Show today">
              Today
            </button>
            <button class="toolbar-btn" id="roadmap-preset-3m" title="Next 3 months">
              3 Months
            </button>
            <button class="toolbar-btn" id="roadmap-preset-6m" title="Next 6 months">
              6 Months
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Refresh the component
   */
  refresh() {
    const container = document.getElementById('roadmap-toolbar');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Date inputs
    const startDateInput = document.getElementById('roadmap-start-date');
    const endDateInput = document.getElementById('roadmap-end-date');

    startDateInput?.addEventListener('change', (e) => {
      this.filters.startDate = e.target.value;
      this.emitChange();
    });

    endDateInput?.addEventListener('change', (e) => {
      this.filters.endDate = e.target.value;
      this.emitChange();
    });

    // Group by select
    const groupBySelect = document.getElementById('roadmap-group-by');
    groupBySelect?.addEventListener('change', (e) => {
      this.filters.groupBy = e.target.value;
      this.emitChange();
    });

    // Zoom level select
    const zoomSelect = document.getElementById('roadmap-zoom');
    zoomSelect?.addEventListener('change', (e) => {
      this.filters.zoomLevel = e.target.value;
      this.emitChange();
    });

    // Preset buttons
    const presetToday = document.getElementById('roadmap-preset-today');
    const preset3m = document.getElementById('roadmap-preset-3m');
    const preset6m = document.getElementById('roadmap-preset-6m');

    presetToday?.addEventListener('click', () => {
      const today = new Date();
      const oneMonth = new Date(today.setMonth(today.getMonth() + 1));
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = oneMonth.toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    preset3m?.addEventListener('click', () => {
      const today = new Date();
      const threeMonths = new Date(today.setMonth(today.getMonth() + 3));
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = threeMonths.toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    preset6m?.addEventListener('click', () => {
      const today = new Date();
      const sixMonths = new Date(today.setMonth(today.getMonth() + 6));
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = sixMonths.toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });
  }

  /**
   * Emit filter change
   */
  emitChange() {
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }

    // Update URL with filters
    if (window.updateQueryParams && window.filtersToParams) {
      const params = window.filtersToParams(this.filters);
      params.roadmap = 'true';
      window.updateQueryParams(params, false);
    }
  }
}

/**
 * Roadmap Toolbar Styles
 */
export const RoadmapToolbarStyles = `
  .roadmap-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 16px;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow);
    margin-bottom: 16px;
    align-items: flex-end;
  }

  .toolbar-section {
    display: flex;
    gap: 12px;
    align-items: flex-end;
  }

  .toolbar-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toolbar-group label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toolbar-input,
  .toolbar-select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 14px;
    background: var(--background);
    color: var(--text);
    min-width: 140px;
  }

  .toolbar-input:focus,
  .toolbar-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .toolbar-btn {
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s ease;
    height: 36px;
  }

  .toolbar-btn:hover {
    background: var(--hover);
    border-color: var(--accent);
  }

  @media (max-width: 768px) {
    .roadmap-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar-section {
      flex-direction: column;
      width: 100%;
    }

    .toolbar-group {
      width: 100%;
    }

    .toolbar-input,
    .toolbar-select,
    .toolbar-btn {
      width: 100%;
    }
  }
`;
