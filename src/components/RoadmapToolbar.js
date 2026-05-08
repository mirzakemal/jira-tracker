/**
 * Roadmap Toolbar Component
 * Provides date range selection, grouping options, and zoom controls
 */

import { escapeHtml } from '../utils/html.js';

export class RoadmapToolbar {
  constructor(filters, onFilterChange, projects = []) {
    this.filters = filters || {
      startDate: this.getDefaultStartDate(),
      endDate: this.getDefaultEndDate(),
      groupBy: 'epic',
      zoomLevel: 'week'
    };
    this.onFilterChange = onFilterChange;
    this.projects = projects || [];
    this._moreOpen = false;
  }

  getDefaultStartDate() {
    return new Date().toISOString().split('T')[0];
  }

  getDefaultEndDate() {
    const today = new Date();
    return new Date(new Date(today).setMonth(today.getMonth() + 3)).toISOString().split('T')[0];
  }

  render() {
    const hasProjectFilter = this.filters.projectKey;
    const hasGroupBy = this.filters.groupBy && this.filters.groupBy !== 'epic';
    const hasColorMode = this.filters.colorMode && this.filters.colorMode !== 'epic';
    const hasCompact = this.filters.compact;
    const activeFilters = [hasProjectFilter, hasGroupBy, hasColorMode, hasCompact].filter(Boolean).length;
    const filterBadge = activeFilters > 0 ? `<span class="filter-badge">${activeFilters}</span>` : '';

    return `
      <div class="roadmap-toolbar" id="roadmap-toolbar" role="toolbar" aria-label="Roadmap filters">
        <div class="toolbar-primary">
          <div class="toolbar-dates">
            <input type="date" id="roadmap-start-date" class="toolbar-input" value="${this.filters.startDate || ''}" aria-label="Start date" />
            <span class="toolbar-date-sep">→</span>
            <input type="date" id="roadmap-end-date" class="toolbar-input" value="${this.filters.endDate || ''}" aria-label="End date" />
          </div>

          <div class="toolbar-presets">
            <button class="preset-btn" id="roadmap-preset-today" title="Center on today">Today</button>
            <button class="preset-btn" id="roadmap-preset-1m">1M</button>
            <button class="preset-btn" id="roadmap-preset-3m">3M</button>
            <button class="preset-btn" id="roadmap-preset-6m">6M</button>
            <button class="preset-btn" id="roadmap-preset-1y">1Y</button>
          </div>

          <div class="toolbar-actions">
            <button class="toolbar-btn toolbar-btn-ghost" id="roadmap-more-filters" aria-expanded="${this._moreOpen}" title="More filters">
              ⚙ Filters ${filterBadge}
            </button>
            <button class="toolbar-btn toolbar-btn-ghost" id="roadmap-export-btn" title="Print roadmap">
              🖨️ Print
            </button>
          </div>
        </div>

        ${this._moreOpen ? `
          <div class="toolbar-secondary">
            <div class="toolbar-group">
              <label for="roadmap-project">Project</label>
              <select id="roadmap-project" class="toolbar-select">
                <option value="">All Projects</option>
                ${this.projects.map(p => `
                  <option value="${escapeHtml(p.key)}" ${this.filters.projectKey === p.key ? 'selected' : ''}>
                    ${escapeHtml(p.key)}
                  </option>
                `).join('')}
              </select>
            </div>
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
              <label for="roadmap-zoom">Zoom</label>
              <select id="roadmap-zoom" class="toolbar-select">
                <option value="week" ${this.filters.zoomLevel === 'week' ? 'selected' : ''}>Weeks</option>
                <option value="month" ${this.filters.zoomLevel === 'month' ? 'selected' : ''}>Months</option>
                <option value="quarter" ${this.filters.zoomLevel === 'quarter' ? 'selected' : ''}>Quarters</option>
              </select>
            </div>
            <div class="toolbar-group">
              <label for="roadmap-color-mode">Color</label>
              <select id="roadmap-color-mode" class="toolbar-select">
                <option value="epic" ${(this.filters.colorMode || 'epic') === 'epic' ? 'selected' : ''}>By Epic</option>
                <option value="status" ${this.filters.colorMode === 'status' ? 'selected' : ''}>By Status</option>
                <option value="priority" ${this.filters.colorMode === 'priority' ? 'selected' : ''}>By Priority</option>
                <option value="assignee" ${this.filters.colorMode === 'assignee' ? 'selected' : ''}>By Assignee</option>
              </select>
            </div>
            <div class="toolbar-group">
              <label>View</label>
              <button class="toolbar-btn ${this.filters.compact ? 'active' : ''}" id="roadmap-compact-toggle" aria-pressed="${!!this.filters.compact}">
                ${this.filters.compact ? '◐ Compact' : '○ Normal'}
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  refresh() {
    const container = document.getElementById('roadmap-toolbar');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  bindEvents() {
    // More filters toggle
    document.getElementById('roadmap-more-filters')?.addEventListener('click', () => {
      this._moreOpen = !this._moreOpen;
      this.refresh();
      this.bindEvents();
    });

    // Date inputs
    document.getElementById('roadmap-start-date')?.addEventListener('change', (e) => {
      this.filters.startDate = e.target.value;
      this.emitChange();
    });
    document.getElementById('roadmap-end-date')?.addEventListener('change', (e) => {
      this.filters.endDate = e.target.value;
      this.emitChange();
    });

    // Project select
    document.getElementById('roadmap-project')?.addEventListener('change', (e) => {
      this.filters.projectKey = e.target.value;
      this.emitChange();
    });

    // Group by select
    document.getElementById('roadmap-group-by')?.addEventListener('change', (e) => {
      this.filters.groupBy = e.target.value;
      this.emitChange();
    });

    // Zoom level select
    document.getElementById('roadmap-zoom')?.addEventListener('change', (e) => {
      this.filters.zoomLevel = e.target.value;
      this.emitChange();
    });

    // Color mode select
    document.getElementById('roadmap-color-mode')?.addEventListener('change', (e) => {
      this.filters.colorMode = e.target.value;
      this.emitChange();
    });

    // Compact mode toggle
    document.getElementById('roadmap-compact-toggle')?.addEventListener('click', () => {
      this.filters.compact = !this.filters.compact;
      this.refresh();
      this.emitChange();
    });

    // Export button
    document.getElementById('roadmap-export-btn')?.addEventListener('click', () => {
      window.print();
    });

    // Preset buttons
    document.getElementById('roadmap-preset-today')?.addEventListener('click', () => {
      const today = new Date();
      this.filters.startDate = new Date(new Date(today).setDate(today.getDate() - 14)).toISOString().split('T')[0];
      this.filters.endDate = new Date(new Date(today).setDate(today.getDate() + 14)).toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    document.getElementById('roadmap-preset-1m')?.addEventListener('click', () => {
      const today = new Date();
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = new Date(new Date(today).setMonth(today.getMonth() + 1)).toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    document.getElementById('roadmap-preset-3m')?.addEventListener('click', () => {
      const today = new Date();
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = new Date(new Date(today).setMonth(today.getMonth() + 3)).toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    document.getElementById('roadmap-preset-6m')?.addEventListener('click', () => {
      const today = new Date();
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = new Date(new Date(today).setMonth(today.getMonth() + 6)).toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });

    document.getElementById('roadmap-preset-1y')?.addEventListener('click', () => {
      const today = new Date();
      this.filters.startDate = this.getDefaultStartDate();
      this.filters.endDate = new Date(new Date(today).setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];
      this.refresh();
      this.emitChange();
    });
  }

  emitChange() {
    if (this.onFilterChange) {
      this.onFilterChange({ ...this.filters });
    }
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
    background: var(--surface, #1e1e36);
    border-bottom: 1px solid var(--border, #333);
    padding: 0;
  }

  /* Primary row: always visible */
  .toolbar-primary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    flex-wrap: wrap;
  }

  .toolbar-dates {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toolbar-date-sep {
    color: var(--text-secondary, #888);
    font-size: 13px;
  }
  .toolbar-input {
    padding: 6px 10px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: var(--bg, #1a1a2e);
    color: var(--text, #e0e0e0);
    font-size: 13px;
    font-family: inherit;
  }
  .toolbar-input:focus {
    outline: none;
    border-color: var(--accent, #4f8cff);
  }

  .toolbar-presets {
    display: flex;
    gap: 4px;
  }
  .preset-btn {
    padding: 5px 10px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: var(--bg, #1a1a2e);
    color: var(--text-secondary, #888);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .preset-btn:hover {
    background: var(--hover, #2a2a44);
    color: var(--text, #e0e0e0);
    border-color: var(--accent, #4f8cff);
  }

  .toolbar-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .toolbar-btn {
    padding: 6px 12px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: var(--bg, #1a1a2e);
    color: var(--text, #e0e0e0);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .toolbar-btn:hover {
    background: var(--hover, #2a2a44);
  }
  .toolbar-btn.active {
    background: var(--accent, #4f8cff);
    color: white;
    border-color: var(--accent, #4f8cff);
  }
  .toolbar-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-secondary, #888);
  }
  .toolbar-btn-ghost:hover {
    background: var(--hover, #2a2a44);
    color: var(--text, #e0e0e0);
  }

  .filter-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent, #4f8cff);
    color: white;
    font-size: 10px;
    font-weight: 700;
    margin-left: 2px;
  }

  /* Secondary row: collapsible */
  .toolbar-secondary {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    padding: 12px 20px;
    border-top: 1px solid var(--border, #333);
    background: var(--bg, #1a1a2e);
    flex-wrap: wrap;
  }
  .toolbar-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .toolbar-group label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .toolbar-select {
    padding: 6px 10px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: var(--surface, #1e1e36);
    color: var(--text, #e0e0e0);
    font-size: 13px;
    font-family: inherit;
    min-width: 120px;
  }
  .toolbar-select:focus {
    outline: none;
    border-color: var(--accent, #4f8cff);
  }

  @media (max-width: 768px) {
    .toolbar-primary {
      flex-direction: column;
      align-items: stretch;
    }
    .toolbar-dates {
      width: 100%;
    }
    .toolbar-input {
      flex: 1;
    }
    .toolbar-presets {
      width: 100%;
      justify-content: center;
    }
    .toolbar-actions {
      margin-left: 0;
      width: 100%;
      justify-content: center;
    }
    .toolbar-secondary {
      flex-direction: column;
      align-items: stretch;
    }
    .toolbar-select {
      width: 100%;
    }
  }
`;
