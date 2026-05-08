/**
 * Roadmap Timeline Component
 * Renders issues as horizontal bars on a timeline with swimlanes
 */

import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

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
        label = `W${this.getWeekNumber(current)}`;
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

  _getGroupLabel() {
    const labels = {
      epic: 'Epic',
      issue_type: 'Issue Type',
      fix_version: 'Fix Version',
      status: 'Status',
      assignee: 'Assignee'
    };
    return labels[this.filters.groupBy] || 'Group';
  }

  _hasRealDates(issue) {
    return !!(issue.start_date || issue.due_date || issue.sprint_id);
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
   * Render the timeline
   */
  render() {
    const { groupedData, sprints } = this.roadmapData;
    const sortedGroups = [...groupedData].sort((a, b) => b.issues.length - a.issues.length);
    const periods = this.generateTimelineHeader();

    if (!sortedGroups || sortedGroups.length === 0) {
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
            <div class="timeline-header-left">
              <span class="timeline-column-label">${this._getGroupLabel()}</span>
            </div>
            <div class="timeline-header-scroll">
              <div class="timeline-gantt-header">
                ${periods.map(period => `
                  <div class="timeline-period" style="left: ${period.position}%; width: ${period.width}%;">
                    ${escapeHtml(period.label)}
                  </div>
                `).join('')}
              </div>
              ${sprints.length > 0 ? `
                <div class="sprint-overlay-container">
                  ${this.renderSprintOverlay(sprints)}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="timeline-body">
            ${sortedGroups.map(group => this.renderSwimlane(group, periods)).join('')}
          </div>
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

    // Calculate max row used to determine height
    const maxRow = Math.max(0, ...issuesWithPositions.map(i => i.row));
    const minHeight = Math.max(60, (maxRow + 1) * 32 + 8); // 32px per row + 8px padding

    // Determine what to show in the header - use name for non-epic groupings
    const showName = epic.is_assignee || epic.is_status || epic.is_version || epic.is_type || epic.key === 'no-epic';
    const headerText = showName ? epic.name : epic.key;

    return `
      <div class="timeline-swimlane" data-epic-key="${escapeHtml(epic.key)}">
        <div class="swimlane-header">
          <span class="swimlane-title" title="${escapeHtml(epic.name)}">
            ${escapeHtml(headerText)}
          </span>
          <span class="swimlane-count">${issues.length} issue${issues.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="swimlane-gantt" style="min-height: ${minHeight}px;">
          ${periods.map(period => `
            <div class="timeline-period-grid" style="left: ${period.position}%; width: ${period.width}%;"></div>
          `).join('')}
          ${issuesWithPositions.map(item => this.renderIssueBar(item.issue, item.row, item.outsideRange, item.hasRealDates)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Calculate vertical row positions for overlapping issues
   */
  calculateIssuePositions(issues) {
    const rows = []; // Array where rows[i] = endPercent of last issue in row i
    const issuesWithPositions = [];

    const { startDate, endDate } = this.getDateRange();

    // Sort issues by start date to ensure consistent ordering
    const sortedIssues = [...issues].sort((a, b) => {
      const aStart = this.getIssueStartDate(a).getTime();
      const bStart = this.getIssueStartDate(b).getTime();
      return aStart - bStart;
    });


    sortedIssues.forEach((issue, issueIndex) => {
      const issueStart = this.getIssueStartDate(issue);
      const issueEnd = this.getIssueEndDate(issue);

      const startPercent = this.getDatePosition(issueStart);
      const endPercent = this.getDatePosition(issueEnd);

      // Clip to timeline range (0-100%)
      const clippedStart = Math.max(0, startPercent);
      const clippedEnd = Math.min(100, endPercent);


      // Issues outside visible range - still find a proper row to avoid overlap
      if (clippedEnd < 0 || clippedStart > 100) {
        issuesWithPositions.push({
          issue,
          row: 0,
          outsideRange: true,
          hasRealDates: this._hasRealDates(issue)
        });
        return;
      }

      // Find first row where this issue fits (starts after previous issue ends)
      let rowNum = 0;
      let foundRow = false;

      for (let i = 0; i < rows.length; i++) {
        // Issue can fit in this row if it starts at or after where the row's last issue ends
        if (clippedStart >= rows[i]) {
          rowNum = i;
          foundRow = true;
          break;
        }
      }

      if (!foundRow) {
        rowNum = rows.length;
      }

      // Update row end position (or create new row)
      rows[rowNum] = clippedEnd;

      issuesWithPositions.push({
        issue,
        row: rowNum,
        outsideRange: false,
        hasRealDates: this._hasRealDates(issue)
      });
    });

    return issuesWithPositions;
  }

  /**
   * Render an issue bar
   */
  renderIssueBar(issue, row = 0, outsideRange = false, hasRealDates = true) {
    // Issues completely outside timeline — skip entirely
    if (outsideRange) return '';

    const startDate = this.getIssueStartDate(issue);
    const endDate = this.getIssueEndDate(issue);
    const { startDate: timelineStart, endDate: timelineEnd } = this.getDateRange();

    // No-date issues render as a milestone diamond at created_at position
    if (!hasRealDates) {
      const createdDate = issue.created_at ? new Date(issue.created_at) : timelineStart;
      const pos = this.getDatePosition(createdDate);
      if (pos < 0 || pos > 100) return '';

      const statusColor = this.getStatusColor(issue.status);
      const topPosition = row * 32 + 6;

      return `
        <div class="issue-milestone ${statusColor}"
             data-issue-key="${escapeHtml(issue.key)}"
             style="left: ${pos}%; top: ${topPosition}px; z-index: ${5 + row};"
             title="${escapeHtml(`${issue.key}: ${issue.summary || ''}\nStatus: ${issue.status || 'Unknown'}\nNo date range — estimated from created date`)}">
          <span class="milestone-key">${escapeHtml(issue.key)}</span>
        </div>
      `;
    }

    const startsBeforeTimeline = startDate < timelineStart;
    const endsAfterTimeline = endDate > timelineEnd;

    // Use clipped bounds for rendering (matching row assignment)
    const effectiveStart = startsBeforeTimeline ? timelineStart : startDate;
    const effectiveEnd = endsAfterTimeline ? timelineEnd : endDate;

    let position = this.getDatePosition(effectiveStart);
    let width = this.getBarWidth(effectiveStart, effectiveEnd);

    // Minimum visible width, cap at right edge
    width = Math.max(width, 0.5);
    if (position + width > 100) {
      width = 100 - position;
    }

    const statusColor = this.getStatusColor(issue.status);
    const topPosition = row * 32;

    const extendsClass = startsBeforeTimeline || endsAfterTimeline ? 'extends-beyond' : '';
    const startOverflowClass = startsBeforeTimeline ? 'start-overflow' : '';
    const narrowClass = width < 5 ? 'bar-narrow' : '';
    const tinyClass = width < 2 ? 'bar-tiny' : '';

    const tooltipLines = [
      `${issue.key}: ${issue.summary || ''}`,
      `Status: ${issue.status || 'Unknown'}`,
      issue.assignee_name ? `Assignee: ${issue.assignee_name}` : null,
      issue.start_date ? `Start: ${formatDate(issue.start_date)}` : null,
      issue.due_date ? `Due: ${formatDate(issue.due_date)}` : null,
      issue.fix_version ? `Version: ${issue.fix_version}` : null
    ].filter(Boolean);

    return `
      <div class="issue-bar ${statusColor} ${extendsClass} ${startOverflowClass} ${narrowClass} ${tinyClass}"
           data-issue-key="${escapeHtml(issue.key)}"
           style="left: ${position}%; width: ${width}%; top: ${topPosition}px; z-index: ${5 + row};"
           title="${escapeHtml(tooltipLines.join('\n'))}">
        <span class="issue-bar-key">${escapeHtml(issue.key)}</span>
        <span class="issue-bar-summary">${escapeHtml(issue.summary || '')}</span>
      </div>
    `;
  }

  /**
   * Render sprint markers
   */
  renderSprintMarkers(sprints) {
    // Deprecated: use renderSprintOverlay instead
    return this.renderSprintOverlay(sprints);
  }

  /**
   * Render sprint overlay at top of timeline (below month headers)
   */
  renderSprintOverlay(sprints) {
    const { startDate: timelineStart } = this.getDateRange();

    // Sort sprints by start date
    const sortedSprints = [...sprints].sort((a, b) => {
      const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
      return aStart - bStart;
    });

    // Calculate vertical rows to prevent overlapping
    const rows = []; // Array of {endPercent, sprintIndex}
    const sprintsWithRows = sortedSprints.map(sprint => {
      const startDate = sprint.start_date ? new Date(sprint.start_date) : null;
      const endDate = sprint.end_date ? new Date(sprint.end_date) : null;
      const startsBeforeTimeline = startDate && startDate < timelineStart;
      const position = startsBeforeTimeline ? 0 : (startDate ? Math.max(0, this.getDatePosition(startDate)) : 0);
      let width = 2;
      if (startDate && endDate) {
        const endDateForWidth = endDate > startDate ? endDate : new Date(startDate.getTime() + (14 * 24 * 60 * 60 * 1000));
        width = this.getBarWidth(startDate, endDateForWidth);
        width = Math.max(width, 2);
      }
      const endPercent = position + width;

      // Find first row where this sprint fits
      let rowNum = 0;
      for (let i = 0; i < rows.length; i++) {
        if (position > rows[i].endPercent) {
          rowNum = rows[i].row;
          rows[i] = { endPercent, row: rowNum };
          break;
        }
        rowNum = i + 1;
      }

      // Add new row if needed
      if (rowNum >= rows.length) {
        rows.push({ endPercent, row: rowNum });
      }

      return { ...sprint, row: rowNum, position, width, startsBeforeTimeline };
    });

    // Calculate container height based on number of rows
    const rowCount = Math.max(1, rows.length);
    const containerHeight = rowCount * 40 + (rowCount - 1) * 4 + 8; // 40px per row + 4px gap + 8px padding

    return `
      <div style="position: relative; width: 100%; height: ${containerHeight}px;">
        ${sprintsWithRows.map(sprint => {
          const topPosition = sprint.row * 40 + 4;
          const startOverflowClass = sprint.startsBeforeTimeline ? 'start-overflow' : '';


          return `
            <div class="sprint-overlay-bar ${startOverflowClass}"
                 style="left: ${sprint.position}%; width: ${sprint.width}%; top: ${topPosition}px;"
                 title="${escapeHtml(sprint.name)}
                        ${sprint.start_date ? '\nStart: ' + formatDate(sprint.start_date) : ''}
                        ${sprint.end_date ? '\nEnd: ' + formatDate(sprint.end_date) : ''}">
              <span class="sprint-overlay-label">${escapeHtml(sprint.name)}</span>
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

    // Sync header horizontal scroll with timeline body
    const body = document.querySelector('.timeline-body');
    const headerScroll = document.querySelector('.timeline-header-scroll');
    if (body && headerScroll) {
      body.addEventListener('scroll', () => {
        headerScroll.scrollLeft = body.scrollLeft;
      });
    }
  }
}

/**
 * Roadmap Timeline Styles
 */
export const RoadmapTimelineStyles = `
  .timeline-container {
    display: flex;
    flex-direction: column;
    min-width: 100%;
  }

  .timeline-header {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    flex-shrink: 0;
    position: relative;
  }

  .timeline-header-left {
    width: 220px;
    min-width: 220px;
    flex-shrink: 0;
    display: flex;
    align-items: flex-end;
    padding: 8px 16px;
    border-right: 1px solid var(--border);
  }

  .timeline-column-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .timeline-header-scroll {
    flex: 1;
    overflow-x: hidden;
    min-width: 0;
  }

  .timeline-gantt-header {
    display: flex;
    height: 48px;
    position: relative;
  }

  .sprint-overlay-container {
    position: relative;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
    background: rgba(147, 51, 234, 0.05);
  }

  .sprint-overlay-bar {
    position: absolute;
    height: 36px;
    background: rgba(147, 51, 234, 0.2);
    border-left: 2px solid #9333ea;
    border-right: 2px solid #9333ea;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(147, 51, 234, 0.2);
  }

  .sprint-overlay-bar:hover {
    background: rgba(147, 51, 234, 0.35);
    box-shadow: 0 2px 8px rgba(147, 51, 234, 0.3);
    transform: translateY(-1px);
  }

  .sprint-overlay-bar.start-overflow::before {
    content: '\u2039';
    position: absolute;
    left: 4px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 18px;
    font-weight: bold;
    color: #9333ea;
    animation: pulse 2s infinite;
  }

  .sprint-overlay-label {
    font-size: 13px;
    color: #7e22ce;
    padding: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
    max-width: 100%;
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
    overflow: hidden;
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
    box-sizing: border-box;
  }

  .issue-bar:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 100 !important;
  }

  .issue-bar.bar-narrow .issue-bar-summary {
    display: none;
  }

  .issue-bar.bar-tiny .issue-bar-key {
    display: none;
  }

  .issue-bar.bar-tiny .issue-bar-summary {
    display: none;
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
    display: block;
    max-width: 100%;
  }

  .issue-milestone {
    position: absolute;
    width: 12px;
    height: 12px;
    transform: translateX(-6px) rotate(45deg);
    border-radius: 2px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .issue-milestone:hover {
    transform: translateX(-6px) rotate(45deg) scale(1.3);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
    z-index: 100 !important;
  }

  .milestone-key {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%) rotate(-45deg);
    font-size: 9px;
    font-weight: 600;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s;
    color: var(--text-primary);
  }

  .issue-milestone:hover .milestone-key {
    opacity: 1;
  }

  .issue-bar.extends-beyond {
    opacity: 0.85;
  }

  .issue-bar.extends-beyond::after {
    content: '›';
    position: absolute;
    right: 1px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    font-weight: bold;
    animation: pulse 2s infinite;
    opacity: 0.7;
  }

  .issue-bar.extends-beyond.start-overflow::before {
    content: '‹';
    position: absolute;
    left: 1px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    font-weight: bold;
    animation: pulse 2s infinite;
    opacity: 0.7;
  }

  /* Sprint overlay bar left arrow indicator - remove duplicate definition */

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

`;
