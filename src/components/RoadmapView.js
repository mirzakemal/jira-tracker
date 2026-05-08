/**
 * Roadmap View Component
 * Main container for roadmap timeline view with filters
 */

import logger from '../utils/logger.js';
import { RoadmapToolbar, RoadmapToolbarStyles } from './RoadmapToolbar.js';
import { RoadmapTimeline, RoadmapTimelineStyles } from './RoadmapTimeline.js';
import { openIssueDrawer } from './IssueDetailDrawer.js';
import { FilterPanelStyles } from './FilterPanel.js';
import { TagsManagerStyles } from './TagsManager.js';
import { SavedViewsMenuStyles } from './SavedViewsMenu.js';
import { getRoadmapData, getEpicsOrThemes, getSprintsInDateRange, getAllProjects } from '../db/queries.js';

export class RoadmapView {
  constructor(client, jiraDomain, onBack) {
    this.client = client;
    this.jiraDomain = jiraDomain;
    this.onBack = onBack;
    this.roadmapData = null;
    this.projects = [];
    this.filters = {
      startDate: this.getDefaultStartDate(),
      endDate: this.getDefaultEndDate(),
      groupBy: 'epic',
      zoomLevel: 'week',
      colorMode: 'epic',
      compact: false
    };
    this.isLoading = false;
    this.error = null;
  }

  /**
   * Get default start date (today)
   */
  getDefaultStartDate() {
    return new Date().toISOString().split('T')[0];
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
   * Load roadmap data from database
   */
  async loadRoadmap(filters = null) {
    if (filters) {
      this.filters = { ...this.filters, ...filters };
    }

    this.isLoading = true;
    this.refresh();

    try {
      // Load projects and roadmap data in parallel
      const [roadmapData, projects] = await Promise.all([
        getRoadmapData(this.filters),
        getAllProjects()
      ]);

      this.roadmapData = roadmapData;
      this.projects = projects;
      this.isLoading = false;
      this.refresh();

      // Update URL with current filters
      this.updateUrlFilters();
    } catch (error) {
      logger.error('[RoadmapView] Failed to load roadmap:', error);
      this.error = error.message || 'Failed to load roadmap';
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
    params.roadmap = 'true';
    window.updateQueryParams(params, false);
  }

  /**
   * Handle filter change from toolbar
   */
  handleFilterChange(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.loadRoadmap();
  }

  /**
   * Open issue detail drawer
   */
  openIssue(issueKey) {
    openIssueDrawer(issueKey, this.jiraDomain, () => {
      // clean up
    });
  }

  /**
   * Get summary stats for the stats bar
   */
  getStats() {
    if (!this.roadmapData) return null;
    const { groupedData, sprints, issues, unscheduled } = this.roadmapData;
    const totalIssues = issues.length;
    const totalSprints = sprints.length;
    const totalGroups = groupedData.length;
    const unscheduledCount = unscheduled?.length || 0;
    const doneCount = issues.filter(i => {
      const s = (i.status || '').toLowerCase();
      return s.includes('done') || s.includes('closed') || s.includes('resolved');
    }).length;
    const progressPct = totalIssues > 0 ? Math.round((doneCount / totalIssues) * 100) : 0;
    return { totalIssues, totalSprints, totalGroups, unscheduledCount, doneCount, progressPct };
  }

  /**
   * Render the view
   */
  render() {
    if (this.error) return this.renderError();

    const stats = this.getStats();
    const dateRangeLabel = this.filters.startDate && this.filters.endDate
      ? `${this.filters.startDate} → ${this.filters.endDate}`
      : '';

    return `
      <div class="roadmap-view" id="roadmap-view">
        <div class="roadmap-header">
          <div class="roadmap-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">← Back</button>
            <h2 class="roadmap-title">Roadmap</h2>
            ${dateRangeLabel ? `<span class="roadmap-date-range">${dateRangeLabel}</span>` : ''}
          </div>
          <div class="roadmap-header-right">
            ${stats ? `
              <div class="roadmap-stats">
                <div class="stat-pill">
                  <span class="stat-pill-value">${stats.totalIssues}</span>
                  <span class="stat-pill-label">Issues</span>
                </div>
                <div class="stat-pill">
                  <span class="stat-pill-value">${stats.doneCount}</span>
                  <span class="stat-pill-label">Done</span>
                </div>
                <div class="stat-pill stat-pill-progress">
                  <span class="stat-pill-value">${stats.progressPct}%</span>
                  <span class="stat-pill-label">Progress</span>
                </div>
                <div class="stat-pill">
                  <span class="stat-pill-value">${stats.totalSprints}</span>
                  <span class="stat-pill-label">Sprints</span>
                </div>
                ${stats.unscheduledCount > 0 ? `
                  <div class="stat-pill stat-pill-warn">
                    <span class="stat-pill-value">${stats.unscheduledCount}</span>
                    <span class="stat-pill-label">Unscheduled</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        ${this.isLoading ? `
          <div class="loading-container">
            <div class="spinner"></div>
            <p>Loading roadmap...</p>
          </div>
        ` : ''}

        ${!this.isLoading ? `
          <div id="roadmap-toolbar-container"></div>
          <div id="roadmap-timeline-container"></div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Refresh the view
   */
  refresh() {
    const container = document.getElementById('roadmap-view');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
      this.renderSubComponents();
    }
  }

  /**
   * Render sub-components
   */
  renderSubComponents() {
    if (this.isLoading || !this.roadmapData) return;

    // Render Toolbar
    const toolbarContainer = document.getElementById('roadmap-toolbar-container');
    if (toolbarContainer) {
      const toolbar = new RoadmapToolbar(this.filters, (newFilters) => this.handleFilterChange(newFilters), this.projects);
      toolbarContainer.innerHTML = toolbar.render();
      toolbar.bindEvents();
    }

    // Render Timeline
    const timelineContainer = document.getElementById('roadmap-timeline-container');
    if (timelineContainer) {
      const timeline = new RoadmapTimeline(
        this.roadmapData,
        this.filters,
        (issueKey) => this.openIssue(issueKey),
        (newFilters) => this.handleFilterChange(newFilters)
      );
      timelineContainer.innerHTML = timeline.render();
      timeline.bindEvents();
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
    const retryBtn = document.getElementById('retry-load-btn');
    retryBtn?.addEventListener('click', () => this.loadRoadmap());
  }

  renderError() {
    return `
      <div class="error-state">
        <div class="error-icon">⚠</div>
        <h3>Failed to load roadmap</h3>
        <p>${this.error || 'An unexpected error occurred'}</p>
        <button class="retry-btn" id="retry-load-btn">Retry</button>
      </div>
    `;
  }
}

/**
 * Roadmap View Styles
 */
export const RoadmapViewStyles = `
  .roadmap-view {
    max-width: 100%;
    margin: 0 auto;
  }

  /* Compact header */
  .roadmap-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--surface, #1e1e36);
    border-bottom: 1px solid var(--border, #333);
    gap: 16px;
    flex-wrap: wrap;
  }
  .roadmap-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .roadmap-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--text, #e0e0e0);
    white-space: nowrap;
  }
  .roadmap-date-range {
    font-size: 12px;
    color: var(--text-secondary, #888);
    background: var(--hover, #2a2a44);
    padding: 3px 10px;
    border-radius: 12px;
    white-space: nowrap;
  }
  .roadmap-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Stats pills */
  .roadmap-stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--hover, #2a2a44);
    border-radius: 16px;
    font-size: 12px;
    color: var(--text-secondary, #888);
  }
  .stat-pill-value {
    font-weight: 700;
    color: var(--text, #e0e0e0);
  }
  .stat-pill-label {
    font-size: 11px;
  }
  .stat-pill-progress .stat-pill-value {
    color: var(--accent, #4f8cff);
  }
  .stat-pill-warn {
    background: rgba(251, 191, 36, 0.15);
  }
  .stat-pill-warn .stat-pill-value {
    color: #fbbf24;
  }

  ${RoadmapToolbarStyles}
  ${RoadmapTimelineStyles}
`;
