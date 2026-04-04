/**
 * Roadmap View Component
 * Main container for roadmap timeline view with filters
 */

import { RoadmapToolbar, RoadmapToolbarStyles } from './RoadmapToolbar.js';
import { RoadmapTimeline, RoadmapTimelineStyles } from './RoadmapTimeline.js';
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
      zoomLevel: 'week'
    };
    this.isLoading = false;
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

      // Store reference globally for router
      window.currentRoadmapView = this;
    } catch (error) {
      console.error('[RoadmapView] Failed to load roadmap:', error);
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
   * Open issue in Jira
   */
  openIssue(issueKey) {
    const url = this.jiraDomain
      ? `https://${this.jiraDomain.replace(/^https?:\/\//, '')}/browse/${issueKey}`
      : `/browse/${issueKey}`;
    window.open(url, '_blank');
  }

  /**
   * Render the view
   */
  render() {
    return `
      <div class="roadmap-view" id="roadmap-view">
        <div class="view-header">
          <div class="view-header-left">
            <button class="back-btn" id="back-btn" title="Back to board">
              ← Back to Board
            </button>
            <h2>Roadmap</h2>
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
        (issueKey) => this.openIssue(issueKey)
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
  }
}

/**
 * Roadmap View Styles
 */
export const RoadmapViewStyles = `
  .roadmap-view {
    padding: 20px;
    max-width: 100%;
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

  ${RoadmapToolbarStyles}
  ${RoadmapTimelineStyles}
`;
