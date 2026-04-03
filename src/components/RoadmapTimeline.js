/**
 * Roadmap Timeline Component
 * Renders issues as horizontal bars on a timeline with swimlanes
 */

export class RoadmapTimeline {
  constructor(roadmapData, filters, onIssueClick) {
    this.roadmapData = roadmapData || { epics: [], sprints: [], issues: [], groupedData: [] };
    this.filters = filters || {};
    this.onIssueClick = onIssueClick;
    this.zoomLevel = filters.zoomLevel || 'month';
  }

  /**
   * Calculate timeline date range
   */
  getDateRange() {
    const startDate = this.filters.startDate ? new Date(this.filters.startDate) : new Date();
    const endDate = this.filters.endDate ? new Date(this.filters.endDate) : new Date(startDate.setMonth(startDate.getMonth() + 3));
    return { startDate, endDate };
  }

  /**
   * Calculate total days in range
   */
  getTotalDays() {
    const { startDate, endDate } = this.getDateRange();
    return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get position percentage for a date
   */
  getDatePosition(date) {
    const { startDate, endDate } = this.getDateRange();
    const targetDate = new Date(date);
    const totalDays = this.getTotalDays();
    const daysFromStart = (targetDate - startDate) / (1000 * 60 * 60 * 24);
    return (daysFromStart / totalDays) * 100;
  }

  /**
   * Get bar width percentage for a date range
   */
  getBarWidth(startDate, endDate) {
    const totalDays = this.getTotalDays();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = (end - start) / (1000 * 60 * 60 * 24);
    return (durationDays / totalDays) * 100;
  }

  /**
   * Generate timeline header periods based on zoom level
   */
  generateTimelineHeader() {
    const { startDate, endDate } = this.getDateRange();
    const periods = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      let periodEnd = new Date(current);
      let label = '';

      if (this.zoomLevel === 'week') {
        periodEnd.setDate(current.getDate() + 7);
        label = `Week ${this.getWeekNumber(current)}`;
      } else if (this.zoomLevel === 'quarter') {
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        label = `Q${quarter} ${current.getFullYear()}`;
        periodEnd.setMonth(current.getMonth() + 3);
        periodEnd.setDate(1);
      } else {
        // month
        label = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        periodEnd.setMonth(current.getMonth() + 1);
      }

      if (periodEnd > endDate) periodEnd = new Date(endDate);

      const position = this.getDatePosition(current);
      const width = this.getDatePosition(periodEnd) - position;

      periods.push({
        label,
        position,
        width: Math.max(width, 5) // Minimum width for visibility
      });

      if (this.zoomLevel === 'week') {
        current.setDate(current.getDate() + 7);
      } else if (this.zoomLevel === 'quarter') {
        current.setMonth(current.getMonth() + 3);
      } else {
        current.setMonth(current.getMonth() + 1);
      }
    }

    return periods;
  }

  /**
   * Get week number for a date
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Get issue start date (with fallbacks)
   */
  getIssueStartDate(issue) {
    // Priority 1: Use explicit start_date
    if (issue.start_date) return new Date(issue.start_date);

    // Priority 2: Estimate from due_date (30 days before)
    if (issue.due_date) {
      const due = new Date(issue.due_date);
      return new Date(due.setDate(due.getDate() - 30));
    }

    // Priority 3: Use sprint start date if available
    if (issue.sprint_id && this.roadmapData.sprints) {
      // Try matching by sprint_id (could be number or string)
      const sprint = this.roadmapData.sprints.find(s => {
        const sprintId = String(s.id);
        const issueSprintId = String(issue.sprint_id);
        return sprintId === issueSprintId;
      });
      if (sprint && sprint.start_date) {
        console.log(`[RoadmapTimeline] Using sprint start date for ${issue.key}: ${sprint.start_date}`);
        return new Date(sprint.start_date);
      }
    }

    // Priority 4: Use created_at as a fallback
    if (issue.created_at) return new Date(issue.created_at);

    // Priority 5: Use timeline start date as absolute fallback
    const { startDate } = this.getDateRange();
    return new Date(startDate);
  }

  /**
   * Get issue end date (with fallbacks)
   */
  getIssueEndDate(issue) {
    // Priority 1: Use explicit due_date
    if (issue.due_date) return new Date(issue.due_date);

    // Priority 2: Use resolved_at if issue is done
    if (issue.resolved_at) return new Date(issue.resolved_at);

    // Priority 3: Use sprint end date if available
    if (issue.sprint_id && this.roadmapData.sprints) {
      // Try matching by sprint_id (could be number or string)
      const sprint = this.roadmapData.sprints.find(s => {
        const sprintId = String(s.id);
        const issueSprintId = String(issue.sprint_id);
        return sprintId === issueSprintId;
      });
      if (sprint && sprint.end_date) {
        console.log(`[RoadmapTimeline] Using sprint end date for ${issue.key}: ${sprint.end_date}`);
        return new Date(sprint.end_date);
      }
    }

    // Priority 4: Estimate from start_date (30 days after)
    if (issue.start_date) {
      const start = new Date(issue.start_date);
      return new Date(start.setDate(start.getDate() + 30));
    }

    // Priority 5: Use updated_at as fallback
    if (issue.updated_at) return new Date(issue.updated_at);

    // Priority 6: Use timeline end date as absolute fallback
    const { endDate } = this.getDateRange();
    return new Date(endDate);
  }

  /**
   * Get status color class
   */
  getStatusColor(status) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('done') || statusLower.includes('closed') || statusLower.includes('resolved')) {
      return 'status-done';
    } else if (statusLower.includes('progress') || statusLower.includes('review')) {
      return 'status-inprogress';
    } else if (statusLower.includes('todo') || statusLower.includes('backlog')) {
      return 'status-todo';
    }
    return 'status-default';
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /**
   * Render the timeline
   */
  render() {
    const { groupedData, sprints } = this.roadmapData;
    const periods = this.generateTimelineHeader();

    if (!groupedData || groupedData.length === 0) {
      return `
        <div class="roadmap-timeline">
          <div class="roadmap-empty">
            <p>No issues found in the selected date range</p>
            <p class="empty-hint">Try adjusting the date range or filters</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="roadmap-timeline" id="roadmap-timeline">
        <div class="timeline-container">
          <div class="timeline-header">
            <div class="timeline-gantt-header">
              ${periods.map(period => `
                <div class="timeline-period" style="left: ${period.position}%; width: ${period.width}%;">
                  ${this.escapeHtml(period.label)}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="timeline-body">
            ${groupedData.map(group => this.renderSwimlane(group, periods)).join('')}
          </div>

          ${sprints.length > 0 ? `
            <div class="sprint-footer">
              ${this.renderSprintMarkers(sprints)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render a swimlane for an epic/group
   */
  renderSwimlane(group, periods) {
    const { epic, issues } = group;

    // Calculate vertical positions for overlapping issues
    const issuesWithPositions = this.calculateIssuePositions(issues);

    // Use issue count for height calculation, including all issues
    const visibleIssueCount = issuesWithPositions.filter(i => !i.outsideRange).length;
    const minHeight = Math.max(60, visibleIssueCount * 32);

    return `
      <div class="timeline-swimlane" data-epic-key="${this.escapeHtml(epic.key)}">
        <div class="swimlane-header">
          <span class="swimlane-title" title="${this.escapeHtml(epic.name)}">
            ${this.escapeHtml(epic.key !== 'no-epic' ? epic.key : epic.name)}
          </span>
          <span class="swimlane-count">${issues.length} issue${issues.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="swimlane-gantt" style="min-height: ${minHeight}px;">
          ${periods.map(period => `
            <div class="timeline-period-grid" style="left: ${period.position}%; width: ${period.width}%;"></div>
          `).join('')}
          ${issuesWithPositions.map(item => this.renderIssueBar(item.issue, item.row, item.outsideRange)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Calculate vertical row positions for overlapping issues
   */
  calculateIssuePositions(issues) {
    const rows = []; // Array of end percentages for each row
    const issuesWithPositions = [];

    const { startDate, endDate } = this.getDateRange();
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    issues.forEach(issue => {
      const issueStart = this.getIssueStartDate(issue);
      const issueEnd = this.getIssueEndDate(issue);

      // We now always have dates due to fallbacks
      const startPercent = this.getDatePosition(issueStart);
      const endPercent = this.getDatePosition(issueEnd);

      // Clip to timeline range (0-100%)
      const clippedStart = Math.max(0, startPercent);
      const clippedEnd = Math.min(100, endPercent);

      // Skip issues completely outside the timeline
      if (clippedEnd < 0 || clippedStart > 100) {
        // Issue is outside visible range - still add it at position 0 for visibility
        issuesWithPositions.push({
          issue,
          row: 0,
          outsideRange: true
        });
        return;
      }

      // Find first row where this issue fits (doesn't overlap)
      let rowNum = 0;
      let placed = false;
      for (let i = 0; i < rows.length; i++) {
        if (clippedStart > rows[i]) {
          rowNum = i;
          placed = true;
          break;
        }
        rowNum = i + 1;
      }

      // Update row end position
      rows[rowNum] = clippedEnd;

      issuesWithPositions.push({
        issue,
        row: rowNum,
        outsideRange: false
      });
    });

    return issuesWithPositions;
  }

  /**
   * Render an issue bar
   */
  renderIssueBar(issue, row = 0, outsideRange = false) {
    const startDate = this.getIssueStartDate(issue);
    const endDate = this.getIssueEndDate(issue);

    // Calculate position and width with timeline bounds checking
    const position = Math.max(0, this.getDatePosition(startDate));
    const endDateForWidth = endDate > startDate ? endDate : new Date(startDate.getTime() + (14 * 24 * 60 * 60 * 1000)); // Minimum 14 days
    let width = this.getBarWidth(startDate, endDateForWidth);

    // Ensure minimum width for visibility
    width = Math.max(width, 2); // Minimum 2% width

    const statusColor = this.getStatusColor(issue.status);
    const topPosition = row * 32; // 28px height + 4px gap

    // Add class for bars extending beyond timeline
    const extendsClass = position < 0 || (position + width) > 100 ? 'extends-beyond' : '';

    // Format tooltip
    const tooltipLines = [
      `${issue.key}: ${issue.summary || ''}`,
      `Status: ${issue.status || 'Unknown'}`,
      issue.assignee_name ? `Assignee: ${issue.assignee_name}` : null,
      issue.start_date ? `Start: ${this.formatDate(issue.start_date)}` : null,
      issue.due_date ? `Due: ${this.formatDate(issue.due_date)}` : null,
      issue.fix_version ? `Version: ${issue.fix_version}` : null
    ].filter(Boolean);

    const tooltip = tooltipLines.join('\n');

    return `
      <div class="issue-bar ${statusColor} ${extendsClass}"
           data-issue-key="${this.escapeHtml(issue.key)}"
           style="left: ${position}%; width: ${width}%; top: ${topPosition}px;"
           title="${this.escapeHtml(tooltip)}">
        <span class="issue-bar-key">${this.escapeHtml(issue.key)}</span>
        <span class="issue-bar-summary">${this.escapeHtml(issue.summary || '')}</span>
      </div>
    `;
  }

  /**
   * Render sprint markers
   */
  renderSprintMarkers(sprints) {
    return `
      <div class="sprint-markers">
        ${sprints.map(sprint => {
          const position = sprint.start_date ? this.getDatePosition(sprint.start_date) : 0;
          const width = sprint.start_date && sprint.end_date
            ? this.getBarWidth(sprint.start_date, sprint.end_date)
            : 2;
          return `
            <div class="sprint-marker"
                 style="left: ${position}%; width: ${width}%;"
                 title="${this.escapeHtml(sprint.name)}
                        ${sprint.start_date ? '\nStart: ' + this.formatDate(sprint.start_date) : ''}
                        ${sprint.end_date ? '\nEnd: ' + this.formatDate(sprint.end_date) : ''}">
              <span class="sprint-label">${this.escapeHtml(sprint.name)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Issue bar click - open issue
    const issueBars = document.querySelectorAll('.issue-bar, .issue-milestone');
    issueBars.forEach(bar => {
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        const issueKey = bar.dataset.issueKey;
        if (issueKey && this.onIssueClick) {
          this.onIssueClick(issueKey);
        }
      });
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
 * Roadmap Timeline Styles
 */
export const RoadmapTimelineStyles = `
  .roadmap-timeline {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .timeline-container {
    display: flex;
    flex-direction: column;
    min-width: 100%;
  }

  .timeline-header {
    border-bottom: 1px solid var(--border);
    background: var(--background);
    flex-shrink: 0;
  }

  .timeline-gantt-header {
    display: flex;
    height: 40px;
    position: relative;
    margin-left: 220px;
  }

  .timeline-period {
    position: absolute;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-secondary);
    border-right: 1px solid var(--border);
    background: var(--surface);
    box-sizing: border-box;
  }

  .timeline-body {
    overflow-x: auto;
    max-height: calc(100vh - 250px);
  }

  .timeline-swimlane {
    display: flex;
    border-bottom: 1px solid var(--border);
    min-height: 70px;
    position: relative;
  }

  .timeline-swimlane:hover {
    background: var(--hover);
  }

  .swimlane-header {
    width: 220px;
    min-width: 220px;
    max-width: 220px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 2px solid var(--border);
    background: var(--background);
    position: sticky;
    left: 0;
    z-index: 5;
  }

  .swimlane-title {
    font-weight: 600;
    color: var(--text);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .swimlane-count {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .swimlane-gantt {
    flex: 1;
    position: relative;
    min-height: 60px;
    padding: 8px 10px;
    overflow: visible;
  }

  .timeline-period-grid {
    position: absolute;
    height: 100%;
    border-right: 1px dashed var(--border);
    pointer-events: none;
    box-sizing: border-box;
  }

  .issue-bar {
    position: absolute;
    height: 28px;
    border-radius: 4px;
    padding: 2px 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    font-size: 11px;
    line-height: 1.2;
    gap: 1px;
  }

  .issue-bar:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  .issue-bar-key {
    font-weight: 600;
    font-size: 11px;
    opacity: 1;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }

  .issue-bar-summary {
    font-size: 10px;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }

  .issue-bar.status-done {
    background: #22c55e;
    color: white;
  }

  .issue-bar.status-inprogress {
    background: #3b82f6;
    color: white;
  }

  .issue-bar.status-todo {
    background: #f59e0b;
    color: white;
  }

  .issue-bar.status-default {
    background: #6b7280;
    color: white;
  }

  .issue-bar.extends-beyond {
    opacity: 0.85;
  }

  .issue-bar.extends-beyond::after {
    content: '›';
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    font-weight: bold;
    animation: pulse 2s infinite;
  }

  .issue-bar.extends-beyond.start-overflow::before {
    content: '‹';
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    font-weight: bold;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .issue-milestone {
    position: absolute;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 10px solid;
    cursor: pointer;
    transform: translateX(-50%);
    z-index: 3;
  }

  .issue-milestone.status-done {
    border-top-color: #22c55e;
  }

  .issue-milestone.status-inprogress {
    border-top-color: #3b82f6;
  }

  .issue-milestone.status-todo {
    border-top-color: #f59e0b;
  }

  .issue-milestone.status-default {
    border-top-color: #6b7280;
  }

  .milestone-label {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    white-space: nowrap;
    color: var(--text);
    font-weight: 500;
  }

  .sprint-footer {
    border-top: 1px solid var(--border);
    background: var(--background);
    flex-shrink: 0;
  }

  .sprint-markers {
    position: relative;
    height: 24px;
    margin-left: 220px;
    display: flex;
  }

  .sprint-marker {
    position: absolute;
    height: 100%;
    background: rgba(99, 102, 241, 0.08);
    border-left: 2px solid #6366f1;
    border-right: 2px solid #6366f1;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .sprint-marker:hover {
    background: rgba(99, 102, 241, 0.2);
  }

  .sprint-label {
    font-size: 10px;
    color: #6366f1;
    padding: 2px 6px;
    white-space: nowrap;
    font-weight: 500;
  }

  .roadmap-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
  }

  .roadmap-empty .empty-hint {
    font-size: 13px;
    margin-top: 8px;
    opacity: 0.8;
  }
`;
