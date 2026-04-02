/**
 * Issue Board Component (Kanban-style)
 * Displays issues grouped by status
 */

import { IssueCard } from './IssueCard.js';

export class IssueBoard {
  constructor(client, onIssueUpdate) {
    this.client = client;
    this.onIssueUpdate = onIssueUpdate;
    this.columns = new Map(); // status -> issues
    this.isLoading = false;
    
    // Bind handler methods for event delegation (prevents memory leaks)
    this.boundHandleDragOver = this.handleDragOver.bind(this);
    this.boundHandleDragLeave = this.handleDragLeave.bind(this);
    this.boundHandleDrop = this.handleDrop.bind(this);
  }

  async loadIssues(board, sprint, options = {}) {
    this.isLoading = true;

    try {
      let jql = `board = ${board.id}`;

      if (sprint) {
        jql += ` AND sprint = ${sprint.id}`;
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

  async transitionIssue(issueKey, toStatus) {
    try {
      const transitions = await this.client.getTransitions(issueKey);

      // Find transition that matches the target status
      const transition = transitions.find(t =>
        t.to?.name === toStatus || t.to?.id === toStatus
      );

      if (transition) {
        await this.client.transitionIssue(issueKey, transition.id);
        return true;
      }

      throw new Error(`No valid transition to "${toStatus}"`);
    } catch (error) {
      console.error('Failed to transition issue:', error);
      throw error;
    }
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
    // Use event delegation on the board container to prevent memory leaks
    const board = document.querySelector('.board-columns');
    if (!board) return;

    // Remove old listeners if they exist (clean up before re-binding)
    board.removeEventListener('dragover', this.boundHandleDragOver);
    board.removeEventListener('dragleave', this.boundHandleDragLeave);
    board.removeEventListener('drop', this.boundHandleDrop);

    // Bind handlers
    board.addEventListener('dragover', this.boundHandleDragOver);
    board.addEventListener('dragleave', this.boundHandleDragLeave);
    board.addEventListener('drop', this.boundHandleDrop);

    // Bind card drag events
    document.querySelectorAll('.issue-card').forEach(card => {
      const issueKey = card.dataset.issueKey;
      const issue = window.currentIssues?.find(i => i.key === issueKey);
      if (issue) {
        IssueCard.bindDragEvents(card, issue);
      }
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const column = e.target.closest('.column-content');
    if (column) {
      column.classList.add('drag-over');
    }
  }

  handleDragLeave(e) {
    const column = e.target.closest('.column-content');
    if (column && !column.contains(e.relatedTarget)) {
      column.classList.remove('drag-over');
    }
  }

  async handleDrop(e) {
    e.preventDefault();
    const column = e.target.closest('.column-content');
    if (column) {
      column.classList.remove('drag-over');

      const issueKey = e.dataTransfer.getData('text/plain');
      const toStatus = column.dataset.status;

      if (issueKey && toStatus) {
        try {
          await this.transitionIssue(issueKey, toStatus);
          if (this.onIssueUpdate) {
            this.onIssueUpdate();
          }
        } catch (error) {
          alert(`Failed to move issue: ${error.message}`);
        }
      }
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
