/**
 * Issue Card Component
 * Displays a single Jira issue
 */

import { escapeHtml } from '../utils/html.js';

export class IssueCard {
  constructor(issue) {
    this.issue = issue;
  }

  render() {
    const { key, fields } = this.issue;
    const priority = fields.priority?.name || 'None';
    const priorityIcon = this.getPriorityIcon(priority);
    const issueTypeIcon = this.getIssueTypeIcon(fields.issuetype?.name);
    const priorityClass = IssueCard.getPriorityClass(priority);

    return `
      <div class="issue-card" draggable="true" data-issue-key="${key}">
        <div class="issue-card-header">
          <span class="issue-type-icon" title="${escapeHtml(fields.issuetype?.name || 'Issue')}">
            ${issueTypeIcon}
          </span>
          <a href="https://${(window.jiraDomain || '').replace(/^https?:\/\//, '')}/browse/${key}" target="_blank" class="issue-key" onclick="event.stopPropagation()">
            ${key}
          </a>
        </div>
        <div class="issue-summary" title="${escapeHtml(fields.summary)}">
          ${escapeHtml(fields.summary)}
        </div>
        <div class="issue-card-footer">
          <span class="issue-priority ${priorityClass}" title="Priority: ${escapeHtml(priority)}">
            ${priorityIcon} ${escapeHtml(priority)}
          </span>
          ${fields.assignee ? `
            <img
              src="${escapeHtml(fields.assignee.avatarUrls['24x24'])}"
              class="issue-assignee"
              title="${escapeHtml(fields.assignee.displayName)}"
              alt="${escapeHtml(fields.assignee.displayName)}"
            />
          ` : '<span class="issue-unassigned" title="Unassigned">👤</span>'}
        </div>
      </div>
    `;
  }

  getPriorityIcon(priority) {
    const priorities = {
      'Highest': '🔴',
      'High': '🟠',
      'Medium': '🟡',
      'Low': '🟢',
      'Lowest': '⚪'
    };
    return priorities[priority] || '⚪';
  }

  getIssueTypeIcon(type) {
    const icons = {
      'Story': '📖',
      'Bug': '🐛',
      'Task': '✅',
      'Epic': '📚',
      'Subtask': '📝'
    };
    return icons[type] || '📄';
  }

  static getPriorityClass(priority) {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('highest')) return 'highest';
    if (priorityLower.includes('high')) return 'high';
    if (priorityLower.includes('medium')) return 'medium';
    if (priorityLower.includes('low')) return 'low';
    return '';
  }

  static bindDragEvents(card, issue) {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', issue.key);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      const issueKey = card.dataset.issueKey;
      if (issueKey) {
        import('./IssueDetailDrawer.js').then(({ openIssueDrawer }) => {
          openIssueDrawer(issueKey, window.jiraDomain || '', () => {});
        });
      }
    });
  }
}
