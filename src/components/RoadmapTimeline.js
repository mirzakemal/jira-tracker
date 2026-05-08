/**
 * Roadmap Timeline Component
 * Renders issues as horizontal bars on a timeline with swimlanes
 */

import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class RoadmapTimeline {
  constructor(roadmapData, filters, onIssueClick, onFilterChange) {
    this.roadmapData = roadmapData || { epics: [], sprints: [], issues: [], groupedData: [] };
    this.filters = filters || {};
    this.onIssueClick = onIssueClick;
    this.onFilterChange = onFilterChange;
    this.zoomLevel = filters.zoomLevel || 'month';
    this.colorMode = filters.colorMode || 'epic';
    this.compact = filters.compact || false;
    this.tooltipEl = null;
    this.tooltipTimer = null;
    this._hoveredIssue = null;
    this._unscheduledOpen = false;

    // Performance: build lookup maps once
    this._sprintMap = new Map(
      (this.roadmapData.sprints || []).map(s => [String(s.id), s])
    );
    this._sprintIssuesMap = new Map();
    for (const issue of this.roadmapData.issues || []) {
      const sid = String(issue.sprint_id);
      if (!this._sprintIssuesMap.has(sid)) this._sprintIssuesMap.set(sid, []);
      this._sprintIssuesMap.get(sid).push(issue);
    }
  }

  /**
   * Calculate timeline date range
   */
  getDateRange() {
    const startDate = this.filters.startDate ? new Date(this.filters.startDate) : new Date();
    const endDate = this.filters.endDate
      ? new Date(this.filters.endDate)
      : new Date(new Date(startDate).setMonth(startDate.getMonth() + 3));
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
      return new Date(new Date(due).setDate(due.getDate() - 30));
    }

    // Priority 3: Use sprint start date if available
    if (issue.sprint_id) {
      const sprint = this._sprintMap.get(String(issue.sprint_id));
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
    if (issue.sprint_id) {
      const sprint = this._sprintMap.get(String(issue.sprint_id));
      if (sprint && sprint.end_date) {
        return new Date(sprint.end_date);
      }
    }

    // Priority 4: Estimate from start_date (30 days after)
    if (issue.start_date) {
      const start = new Date(issue.start_date);
      return new Date(new Date(start).setDate(start.getDate() + 30));
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
   * Get CSS class for issue bar based on color mode
   */
  getIssueBarColor(issue) {
    switch (this.colorMode) {
      case 'epic': {
        // Generate consistent color per epic key
        const epicKey = issue.epic_key || issue.key || 'unknown';
        const hash = epicKey.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
        return `epic-${hash % 12}`;
      }
      case 'status':
        return this.getStatusColor(issue.status);
      case 'priority': {
        const prio = (issue.priority || '').toLowerCase();
        if (prio.includes('highest') || prio.includes('high') || prio.includes('critical')) return 'prio-high';
        if (prio.includes('medium')) return 'prio-medium';
        if (prio.includes('low') || prio.includes('lowest')) return 'prio-low';
        return 'prio-default';
      }
      case 'assignee': {
        if (!issue.assignee_id) return 'assignee-default';
        const hash = issue.assignee_id.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
        return `assignee-${hash % 8}`;
      }
      default:
        return this.getStatusColor(issue.status);
    }
  }

  /**
   * Get fill percentage based on status for progress shading
   */
  getStatusFillPercent(status) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('done') || statusLower.includes('closed') || statusLower.includes('resolved')) return 100;
    if (statusLower.includes('review')) return 75;
    if (statusLower.includes('progress')) return 50;
    if (statusLower.includes('selected') || statusLower.includes('development')) return 25;
    return 0;
  }

  /**
   * Render milestone markers
   */
  renderMilestoneMarkers() {
    const milestones = this.roadmapData.milestones || [];
    if (!milestones.length) return '';

    return milestones.map(m => {
      const pos = this.getDatePosition(new Date(m.date));
      if (pos < 0 || pos > 100) return '';
      return `
        <div class="milestone-marker" style="left: ${pos}%;" title="${escapeHtml(m.name)} — ${formatDate(m.date)}">
          <div class="milestone-flag">${escapeHtml(m.name)}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render the timeline
   */
  render() {
    const { groupedData, sprints } = this.roadmapData;
    const sortedGroups = [...groupedData].sort((a, b) => b.issues.length - a.issues.length);
    const periods = this.generateTimelineHeader();

    const today = new Date();
    const todayPosition = this.getDatePosition(today);
    const hasUnscheduled = this.roadmapData.unscheduled && this.roadmapData.unscheduled.length > 0;

    if (!sortedGroups || sortedGroups.length === 0) {
      const emptyHint = hasUnscheduled
        ? `<p class="empty-hint">Issues without dates are in the Unscheduled section below</p>`
        : `<p class="empty-hint">Try adjusting the date range or filters</p>`;
      return `
        <div class="roadmap-timeline">
          <div class="roadmap-empty">
            <p>No issues found in the selected date range</p>
            ${emptyHint}
          </div>
          ${this.renderUnscheduledBucket()}
        </div>
      `;
    }

    const compactClass = this.compact ? 'compact' : '';
    return `
      <div class="roadmap-timeline ${compactClass}" id="roadmap-timeline">
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
              <div class="today-marker" style="left: ${todayPosition}%;" title="Today"></div>
              ${this.renderMilestoneMarkers()}
            </div>
          </div>

          <div class="timeline-body">
            ${sortedGroups.map(group => this.renderSwimlane(group, periods)).join('')}
            <div class="today-marker" style="position: absolute; left: ${todayPosition}%; top: 0; bottom: 0; pointer-events: none;"></div>
            ${this.renderMilestoneMarkers()}
          </div>
        </div>
        ${this.renderUnscheduledBucket()}
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

    const colorClass = this.getIssueBarColor(issue);
    const topPosition = row * 32;

    const extendsClass = startsBeforeTimeline || endsAfterTimeline ? 'extends-beyond' : '';
    const startOverflowClass = startsBeforeTimeline ? 'start-overflow' : '';
    const narrowClass = width < 5 ? 'bar-narrow' : '';
    const tinyClass = width < 2 ? 'bar-tiny' : '';

    const fillPct = this.getStatusFillPercent(issue.status);

    const tooltipLines = [
      `${issue.key}: ${issue.summary || ''}`,
      `Status: ${issue.status || 'Unknown'}`,
      issue.assignee_name ? `Assignee: ${issue.assignee_name}` : null,
      issue.start_date ? `Start: ${formatDate(issue.start_date)}` : null,
      issue.due_date ? `Due: ${formatDate(issue.due_date)}` : null,
      issue.fix_version ? `Version: ${issue.fix_version}` : null
    ].filter(Boolean);

    return `
      <div class="issue-bar ${colorClass} ${extendsClass} ${startOverflowClass} ${narrowClass} ${tinyClass}"
           role="button"
           aria-label="${escapeHtml(issue.key)}: ${escapeHtml(issue.summary || '')}"
           tabindex="0"
           data-issue-key="${escapeHtml(issue.key)}"
           data-issue-summary="${escapeHtml(issue.summary || '')}"
           data-issue-status="${escapeHtml(issue.status || '')}"
           data-issue-assignee="${escapeHtml(issue.assignee_name || '')}"
           data-issue-start="${escapeHtml(issue.start_date || '')}"
           data-issue-due="${escapeHtml(issue.due_date || '')}"
           data-swimlane="${escapeHtml(issue.parent_key || issue.epic_key || 'no-epic')}"
           style="left: ${position}%; width: ${width}%; top: ${topPosition}px; z-index: ${5 + row};">
        <div class="issue-bar-fill" style="width: ${fillPct}%;"></div>
        <span class="issue-bar-key">${escapeHtml(issue.key)}</span>
        <span class="issue-bar-summary">${escapeHtml(issue.summary || '')}</span>
      </div>
    `;
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

      // Calculate sprint capacity (issue count / max capacity)
      const sprintIssues = this._sprintIssuesMap.get(String(sprint.id)) || [];
      const capacity = sprint.capacity || 10; // default capacity if not set
      const fillPct = Math.min(100, Math.round((sprintIssues.length / capacity) * 100));

      return { ...sprint, row: rowNum, position, width, startsBeforeTimeline, fillPct, issueCount: sprintIssues.length };
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
                 role="button"
                 aria-label="${escapeHtml(sprint.name)}: ${sprint.issueCount} issues"
                 style="left: ${sprint.position}%; width: ${sprint.width}%; top: ${topPosition}px;"
                 title="${escapeHtml(sprint.name)}
                        ${sprint.start_date ? '\nStart: ' + formatDate(sprint.start_date) : ''}
                        ${sprint.end_date ? '\nEnd: ' + formatDate(sprint.end_date) : ''}
                        \nIssues: ${sprint.issueCount} / ${sprint.capacity}">
              <span class="sprint-overlay-label">${escapeHtml(sprint.name)}</span>
              <div class="sprint-capacity-bar">
                <div class="sprint-capacity-fill" style="width: ${sprint.fillPct}%;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Render unscheduled issues bucket (collapsible)
   */
  renderUnscheduledBucket() {
    const unscheduled = this.roadmapData.unscheduled || [];
    if (!unscheduled.length) return '';

    const count = unscheduled.length;
    const label = `📥 Unscheduled (${count} issue${count !== 1 ? 's' : ''})`;

    return `
      <div class="unscheduled-bucket" id="unscheduled-bucket">
        <button class="unscheduled-toggle" id="unscheduled-toggle" aria-expanded="${this._unscheduledOpen}">
          <span>${label}</span>
          <span class="toggle-arrow ${this._unscheduledOpen ? 'open' : ''}" aria-hidden="true">▸</span>
        </button>
        ${this._unscheduledOpen ? `
          <div class="unscheduled-list">
            ${unscheduled.map(issue => `
              <div class="unscheduled-item" data-issue-key="${escapeHtml(issue.key)}">
                <span class="unscheduled-key">${escapeHtml(issue.key)}</span>
                <span class="unscheduled-summary" title="${escapeHtml(issue.summary || '')}">${escapeHtml(issue.summary || '')}</span>
                <span class="unscheduled-status">${escapeHtml(issue.status || 'No status')}</span>
                ${issue.assignee_name ? `<span class="unscheduled-assignee">${escapeHtml(issue.assignee_name)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Create and show hover tooltip for an issue bar
   */
  showTooltip(bar, e) {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'issue-tooltip';
      document.body.appendChild(this.tooltipEl);
    }

    const key = bar.dataset.issueKey || '';
    const summary = bar.dataset.issueSummary || '';
    const status = bar.dataset.issueStatus || 'Unknown';
    const assignee = bar.dataset.issueAssignee || '';
    const startDate = bar.dataset.issueStart || '';
    const dueDate = bar.dataset.issueDue || '';

    const startStr = startDate ? formatDate(startDate) : '';
    const dueStr = dueDate ? formatDate(dueDate) : '';

    this.tooltipEl.innerHTML = `
      <div class="tooltip-key">${escapeHtml(key)}</div>
      <div class="tooltip-summary">${escapeHtml(summary)}</div>
      <div class="tooltip-meta">
        ${status ? `<span>Status: ${escapeHtml(status)}</span>` : ''}
        ${assignee ? `<span>Assignee: ${escapeHtml(assignee)}</span>` : ''}
      </div>
      <div class="tooltip-dates">
        ${startStr ? `<span>Start: ${startStr}</span>` : ''}
        ${dueStr ? `<span>Due: ${dueStr}</span>` : ''}
      </div>
    `;

    const rect = bar.getBoundingClientRect();
    const tooltipWidth = 260;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    let top = rect.top - 10;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;

    this.tooltipEl.style.left = left + 'px';
    this.tooltipEl.style.top = top + 'px';
    this.tooltipEl.style.transform = 'translateY(-100%)';
    this.tooltipEl.classList.add('visible');
  }

  _hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.classList.remove('visible');
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const timeline = document.getElementById('roadmap-timeline');
    if (!timeline) return;

    // Event delegation for issue bars — single listener instead of N listeners
    timeline.addEventListener('click', (e) => {
      const bar = e.target.closest('.issue-bar, .issue-milestone, .unscheduled-item');
      if (!bar) return;
      e.stopPropagation();
      const issueKey = bar.dataset.issueKey;
      if (issueKey && this.onIssueClick) this.onIssueClick(issueKey);
    });

    timeline.addEventListener('mouseover', (e) => {
      const bar = e.target.closest('.issue-bar, .issue-milestone');
      if (bar) this.showTooltip(bar, e);
    });

    timeline.addEventListener('mouseout', (e) => {
      const bar = e.target.closest('.issue-bar, .issue-milestone');
      if (!bar) this._hideTooltip();
    });

    timeline.addEventListener('mousemove', (e) => {
      const bar = e.target.closest('.issue-bar, .issue-milestone');
      if (bar && this.tooltipEl?.classList.contains('visible')) {
        this.showTooltip(bar, e);
      }
    });

    // Unscheduled bucket toggle
    document.getElementById('unscheduled-toggle')?.addEventListener('click', () => {
      this._unscheduledOpen = !this._unscheduledOpen;
      const bucket = document.getElementById('unscheduled-bucket');
      if (bucket) {
        bucket.outerHTML = this.renderUnscheduledBucket();
        this.bindEvents();
      }
    });

    // Sync header horizontal scroll with timeline body
    const body = document.querySelector('.timeline-body');
    const headerScroll = document.querySelector('.timeline-header-scroll');
    if (body && headerScroll) {
      body.addEventListener('scroll', () => {
        headerScroll.scrollLeft = body.scrollLeft;
      });
    }

    // Keyboard navigation
    this._bindKeyboardNav();

    // Drag to pan
    this._bindDragPan();

    // Mouse wheel zoom
    this._bindWheelZoom();
  }

  _bindKeyboardNav() {
    const timeline = document.getElementById('roadmap-timeline');
    if (!timeline) return;

    timeline.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      const isBar = active?.classList.contains('issue-bar') || active?.classList.contains('issue-milestone');
      if (!isBar) return;

      const allBars = Array.from(timeline.querySelectorAll('.issue-bar[tabindex], .issue-milestone[tabindex]'));
      const idx = allBars.indexOf(active);
      if (idx < 0) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const key = active.dataset.issueKey;
        if (key && this.onIssueClick) this.onIssueClick(key);
        return;
      }

      if (e.key === 'Escape') {
        active.blur();
        return;
      }

      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();

      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = Math.min(allBars.length - 1, idx + 1);
      if (e.key === 'ArrowLeft') nextIdx = Math.max(0, idx - 1);

      // Up/Down: navigate between swimlanes
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const currentSwimlane = active.dataset.swimlane;
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        // Find next bar with a different swimlane
        for (let i = idx + direction; i >= 0 && i < allBars.length; i += direction) {
          if (allBars[i].dataset.swimlane !== currentSwimlane) {
            nextIdx = i;
            break;
          }
        }
      }

      if (nextIdx !== idx && allBars[nextIdx]) {
        allBars[nextIdx].focus();
        allBars[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
  }

  _bindDragPan() {
    const body = document.querySelector('.timeline-body');
    if (!body) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    body.addEventListener('mousedown', (e) => {
      // Only drag on empty space, not on bars
      if (e.target.closest('.issue-bar, .issue-milestone, .unscheduled-item')) return;
      isDown = true;
      body.classList.add('dragging');
      startX = e.pageX - body.offsetLeft;
      scrollLeft = body.scrollLeft;
    });

    body.addEventListener('mouseleave', () => {
      isDown = false;
      body.classList.remove('dragging');
    });

    body.addEventListener('mouseup', () => {
      isDown = false;
      body.classList.remove('dragging');
    });

    body.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - body.offsetLeft;
      const walk = (x - startX) * 1.5;
      body.scrollLeft = scrollLeft - walk;
      // Sync header
      const headerScroll = document.querySelector('.timeline-header-scroll');
      if (headerScroll) headerScroll.scrollLeft = body.scrollLeft;
    });
  }

  _bindWheelZoom() {
    const timeline = document.getElementById('roadmap-timeline');
    if (!timeline) return;

    timeline.addEventListener('wheel', (e) => {
      if (!e.shiftKey && !e.ctrlKey) return;
      e.preventDefault();

      if (e.ctrlKey) {
        // Zoom: change zoom level
        const levels = ['week', 'month', 'quarter'];
        const current = this.zoomLevel;
        let idx = levels.indexOf(current);
        if (e.deltaY < 0) idx = Math.max(0, idx - 1);
        else idx = Math.min(levels.length - 1, idx + 1);
        if (levels[idx] !== current) {
          this.filters.zoomLevel = levels[idx];
          if (this.onFilterChange) this.onFilterChange({ ...this.filters });
        }
      } else if (e.shiftKey) {
        // Pan: horizontal scroll
        const body = document.querySelector('.timeline-body');
        if (body) {
          body.scrollLeft += e.deltaY;
          const headerScroll = document.querySelector('.timeline-header-scroll');
          if (headerScroll) headerScroll.scrollLeft = body.scrollLeft;
        }
      }
    }, { passive: false });
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
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface, #1e1e36);
  }

  .timeline-header {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--bg, #1a1a2e);
    flex-shrink: 0;
    position: relative;
  }

  .timeline-header-left {
    width: 220px;
    min-width: 220px;
    flex-shrink: 0;
    display: flex;
    align-items: flex-end;
    padding: 10px 16px;
    border-right: 1px solid var(--border);
    background: var(--surface, #1e1e36);
  }

  .timeline-column-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.8px;
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
    background: rgba(79, 140, 255, 0.04);
  }

  .sprint-overlay-bar {
    position: absolute;
    height: 36px;
    background: rgba(79, 140, 255, 0.12);
    border-left: 2px solid var(--accent, #4f8cff);
    border-right: 2px solid var(--accent, #4f8cff);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(79, 140, 255, 0.15);
  }

  .sprint-overlay-bar:hover {
    background: rgba(79, 140, 255, 0.22);
    box-shadow: 0 2px 8px rgba(79, 140, 255, 0.25);
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
    color: var(--accent, #4f8cff);
    animation: pulse 2s infinite;
  }

  .sprint-overlay-label {
    font-size: 12px;
    color: var(--accent, #4f8cff);
    padding: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    max-width: 100%;
  }

  .timeline-period {
    position: absolute;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #888);
    border-right: 1px solid var(--border, #333);
    background: var(--surface, #1e1e36);
    box-sizing: border-box;
  }

  .timeline-body {
    position: relative;
    overflow-x: auto;
    max-height: calc(100vh - 250px);
  }

  .timeline-swimlane {
    display: flex;
    border-bottom: 1px solid var(--border);
    min-height: 70px;
    position: relative;
    transition: background 0.15s;
  }

  .timeline-swimlane:hover {
    background: rgba(79, 140, 255, 0.03);
  }

  .swimlane-header {
    width: 220px;
    min-width: 220px;
    max-width: 220px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid var(--border);
    background: var(--surface, #1e1e36);
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
    margin-top: 3px;
    font-weight: 500;
  }

  .swimlane-gantt {
    flex: 1;
    position: relative;
    min-height: 60px;
    padding: 10px 12px;
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
    border-radius: 6px;
    padding: 2px 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    overflow: hidden;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    font-size: 11px;
    line-height: 1.2;
    gap: 1px;
    box-sizing: border-box;
  }

  .issue-bar:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    z-index: 100 !important;
    filter: brightness(1.1);
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

  /* Today marker */
  .today-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 2px dashed var(--danger, #ef4444);
    pointer-events: none;
    z-index: 50;
    opacity: 0.7;
  }
  .today-marker::after {
    content: 'Today';
    position: absolute;
    top: 2px;
    left: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--danger, #ef4444);
    white-space: nowrap;
    pointer-events: none;
  }

  /* Progress fill on issue bars */
  .issue-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 4px 0 0 4px;
    opacity: 0.25;
    pointer-events: none;
    z-index: 0;
    background: currentColor;
  }

  .issue-bar.status-done .issue-bar-fill { background: var(--success, #22c55e); opacity: 0.3; }
  .issue-bar.status-inprogress .issue-bar-fill { background: #f59e0b; opacity: 0.3; }
  .issue-bar.status-todo .issue-bar-fill { background: var(--text-secondary); opacity: 0.15; }

  /* Hover tooltip */
  .issue-tooltip {
    position: fixed;
    z-index: 1000;
    background: var(--bg, #1a1a2e);
    border: 1px solid var(--border, #333);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    max-width: 280px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    font-size: 12px;
    backdrop-filter: blur(8px);
  }

  .issue-tooltip.visible {
    opacity: 1;
  }

  .issue-tooltip .tooltip-key {
    font-weight: 700;
    font-size: 13px;
    color: var(--text);
    margin-bottom: 4px;
  }

  .issue-tooltip .tooltip-summary {
    color: var(--text-secondary);
    margin-bottom: 6px;
    line-height: 1.3;
  }

  .issue-tooltip .tooltip-meta {
    display: flex;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 11px;
    margin-bottom: 4px;
  }

  .issue-tooltip .tooltip-dates {
    color: var(--text-secondary);
    font-size: 11px;
  }

  /* Unscheduled bucket */
  .unscheduled-bucket {
    margin: 12px 0;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    background: var(--surface, #1e1e36);
    overflow: hidden;
  }

  .unscheduled-toggle {
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    font-family: inherit;
  }

  .unscheduled-toggle:hover {
    background: var(--hover);
    border-radius: 8px;
  }

  .unscheduled-toggle .toggle-arrow {
    font-size: 12px;
    transition: transform 0.2s;
    color: var(--text-secondary);
  }

  .unscheduled-toggle .toggle-arrow.open {
    transform: rotate(90deg);
  }

  .unscheduled-list {
    border-top: 1px solid var(--border);
  }

  .unscheduled-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    transition: background 0.15s;
  }

  .unscheduled-item:last-child {
    border-bottom: none;
  }

  .unscheduled-item:hover {
    background: var(--hover);
  }

  .unscheduled-key {
    font-weight: 600;
    color: var(--primary);
    min-width: 90px;
  }

  .unscheduled-summary {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .unscheduled-status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--hover);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .unscheduled-assignee {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  /* Issue bar animation on render */
  .issue-bar {
    animation: barFadeIn 0.3s ease-out;
  }

  @keyframes barFadeIn {
    from {
      opacity: 0;
      width: 0 !important;
    }
    to {
      opacity: 1;
    }
  }

  /* Swimlane fade in */
  .timeline-swimlane {
    animation: swimlaneFadeIn 0.25s ease-out;
  }

  @keyframes swimlaneFadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Epic colors */
  .issue-bar.epic-0  { background: #ef4444; color: white; }
  .issue-bar.epic-1  { background: #f97316; color: white; }
  .issue-bar.epic-2  { background: #f59e0b; color: white; }
  .issue-bar.epic-3  { background: #84cc16; color: white; }
  .issue-bar.epic-4  { background: #22c55e; color: white; }
  .issue-bar.epic-5  { background: #14b8a6; color: white; }
  .issue-bar.epic-6  { background: #06b6d4; color: white; }
  .issue-bar.epic-7  { background: #3b82f6; color: white; }
  .issue-bar.epic-8  { background: #6366f1; color: white; }
  .issue-bar.epic-9  { background: #a855f7; color: white; }
  .issue-bar.epic-10 { background: #d946ef; color: white; }
  .issue-bar.epic-11 { background: #f43f5e; color: white; }

  /* Priority colors */
  .issue-bar.prio-high    { background: #dc2626; color: white; }
  .issue-bar.prio-medium  { background: #d97706; color: white; }
  .issue-bar.prio-low     { background: #059669; color: white; }
  .issue-bar.prio-default { background: #6b7280; color: white; }

  /* Assignee colors */
  .issue-bar.assignee-0  { background: #ef4444; color: white; }
  .issue-bar.assignee-1  { background: #f97316; color: white; }
  .issue-bar.assignee-2  { background: #f59e0b; color: white; }
  .issue-bar.assignee-3  { background: #84cc16; color: white; }
  .issue-bar.assignee-4  { background: #22c55e; color: white; }
  .issue-bar.assignee-5  { background: #06b6d4; color: white; }
  .issue-bar.assignee-6  { background: #3b82f6; color: white; }
  .issue-bar.assignee-7  { background: #a855f7; color: white; }
  .issue-bar.assignee-default { background: #6b7280; color: white; }

  /* Compact mode */
  .roadmap-timeline.compact .timeline-swimlane {
    min-height: 40px;
  }
  .roadmap-timeline.compact .swimlane-header {
    padding: 6px 12px;
  }
  .roadmap-timeline.compact .swimlane-gantt {
    padding: 4px 6px;
    min-height: 36px;
  }
  .roadmap-timeline.compact .issue-bar {
    height: 20px;
    font-size: 9px;
    padding: 1px 4px;
  }
  .roadmap-timeline.compact .issue-bar .issue-bar-summary {
    display: none;
  }
  .roadmap-timeline.compact .issue-milestone {
    width: 8px;
    height: 8px;
  }

  /* Keyboard focus */
  .issue-bar:focus-visible,
  .issue-milestone:focus-visible {
    outline: 2px solid var(--primary, #6366f1);
    outline-offset: 2px;
  }

  /* Drag to pan cursor */
  .timeline-body.dragging {
    cursor: grabbing;
    user-select: none;
  }
  .timeline-body {
    cursor: grab;
  }

  /* Milestone markers */
  .milestone-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 2px dashed var(--primary, #6366f1);
    pointer-events: none;
    z-index: 40;
  }
  .milestone-flag {
    position: absolute;
    top: 4px;
    left: 6px;
    background: var(--primary, #6366f1);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  }

  /* Sprint capacity indicator */
  .sprint-capacity-bar {
    position: absolute;
    bottom: 2px;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
    overflow: hidden;
  }
  .sprint-capacity-fill {
    height: 100%;
    background: rgba(255,255,255,0.8);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* Print styles */
  @media print {
    .roadmap-view .view-header,
    .roadmap-view .roadmap-toolbar,
    .roadmap-view .back-btn,
    .roadmap-view .sync-status,
    .roadmap-view .issue-detail-overlay,
    .roadmap-view .changelog-overlay,
    .roadmap-view .quick-search-overlay {
      display: none !important;
    }
    .roadmap-view .timeline-body {
      max-height: none !important;
      overflow: visible !important;
    }
    .roadmap-view .timeline-swimlane {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .roadmap-view {
      background: white !important;
      color: black !important;
    }
    .roadmap-view .issue-bar {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .roadmap-view .today-marker {
      border-left-style: solid !important;
    }
  }
`;