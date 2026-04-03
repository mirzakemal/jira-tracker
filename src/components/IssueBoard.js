/**
 * Issue Board Component (Kanban-style)
 * Displays issues grouped by status - READ ONLY
 */

import { IssueCard } from './IssueCard.js';

export class IssueBoard {
  constructor(client, onIssueUpdate) {
    this.client = client;
    this.onIssueUpdate = onIssueUpdate;
    this.columns = new Map(); // status -> issues
    this.isLoading = false;
  }

  async loadIssues(board, sprint, options = {}) {
    this.isLoading = true;

    try {
      // When fetching from a specific board, we only need to filter by sprint
      let jql = null;

      // If "All Sprints" is selected or no sprint, fetch all issues from the board
      if (sprint && sprint.id !== 'all') {
        jql = `sprint = ${sprint.id}`;
      }

      const result = await this.client.getBoardIssues(board.id, jql, 0, 100, options);
      this.groupByStatus(result.issues || []);

      return result;
    } catch (error) {
      console.error('Failed to load issues:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  groupByStatus(issues) {
    this.columns.clear();

    issues.forEach(issue => {
      const status = issue.fields.status?.name || 'Unknown';
      if (!this.columns.has(status)) {
        this.columns.set(status, []);
      }
      this.columns.set(status, [...this.columns.get(status), issue]);
    });
  }

  render() {
    if (this.isLoading) {
      return `
        <div class="issue-board">
          <div class="loading-board">
            <div class="spinner"></div>
            <p>Loading issues...</p>
          </div>
        </div>
      `;
    }

    if (this.columns.size === 0) {
      return `
        <div class="issue-board">
          <div class="empty-board">
            <p>No issues found in this sprint</p>
          </div>
        </div>
      `;
    }

    const statusOrder = ['To Do', 'In Progress', 'In Review', 'Done'];

    const sortedColumns = [...this.columns.entries()].sort((a, b) => {
      const aIndex = statusOrder.findIndex(s => s.toLowerCase().includes(a[0].toLowerCase()));
      const bIndex = statusOrder.findIndex(s => s.toLowerCase().includes(b[0].toLowerCase()));

      if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return `
      <div class="issue-board">
        <div class="board-columns">
          ${sortedColumns.map(([status, issues]) => `
            <div class="board-column" data-status="${this.escapeHtml(status)}">
              <div class="column-header">
                <span class="column-title">${this.escapeHtml(status)}</span>
                <span class="column-count">${issues.length}</span>
              </div>
              <div class="column-content" data-status="${this.escapeHtml(status)}">
                ${issues.map(issue => new IssueCard(issue).render()).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Read-only board - no drag and drop events
    // Just bind card click events to open in Jira
    document.querySelectorAll('.issue-card').forEach(card => {
      const issueKey = card.dataset.issueKey;
      const issue = window.currentIssues?.find(i => i.key === issueKey);
      if (issue) {
        IssueCard.bindDragEvents(card, issue);
      }
    });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
