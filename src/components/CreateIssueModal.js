/**
 * Create Issue Modal Component
 */

export class CreateIssueModal {
  constructor(client, project, onClose) {
    this.client = client;
    this.project = project;
    this.onClose = onClose;
    this.issueTypes = [];
    this.assignees = [];
  }

  async load() {
    try {
      this.issueTypes = await this.client.getIssueTypes(this.project.key);
      this.assignees = await this.client.getAssignableUsers(this.project.key);
    } catch (error) {
      console.error('Failed to load issue types/assignees:', error);
      this.issueTypes = [];
      this.assignees = [];
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render() {
    const standardTypes = this.issueTypes.filter(t => !t.subtask);

    return `
      <div class="modal-overlay" id="create-issue-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create Issue</h2>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>

          <form id="create-issue-form" class="create-issue-form">
            <div class="form-row">
              <div class="form-group full-width">
                <label for="issue-summary">Summary *</label>
                <input
                  type="text"
                  id="issue-summary"
                  name="summary"
                  placeholder="Brief summary of the issue"
                  required
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="issue-type">Issue Type *</label>
                <select id="issue-type" name="issueType" required>
                  ${standardTypes.length > 0
                    ? standardTypes.map(t => `<option value="${t.name}">${this.escapeHtml(t.name)}</option>`).join('')
                    : '<option value="Task">Task</option>'
                  }
                </select>
              </div>

              <div class="form-group">
                <label for="issue-priority">Priority</label>
                <select id="issue-priority" name="priority">
                  <option value="Highest">Highest</option>
                  <option value="High">High</option>
                  <option value="Medium" selected>Medium</option>
                  <option value="Low">Low</option>
                  <option value="Lowest">Lowest</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="issue-assignee">Assignee</label>
                <select id="issue-assignee" name="assignee">
                  <option value="">Unassigned</option>
                  ${this.assignees.map(a => `<option value="${this.escapeHtml(a.accountId)}">${this.escapeHtml(a.displayName)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group full-width">
                <label for="issue-description">Description</label>
                <textarea
                  id="issue-description"
                  name="description"
                  rows="5"
                  placeholder="Detailed description (optional)"
                ></textarea>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary" id="btn-create">Create Issue</button>
            </div>

            <div class="error-message" id="create-error" style="display: none;"></div>
          </form>
        </div>
      </div>
    `;
  }

  async submit() {
    const form = document.getElementById('create-issue-form');
    const formData = new FormData(form);

    const summary = formData.get('summary');
    const issueType = formData.get('issueType');
    const priority = formData.get('priority');
    const assignee = formData.get('assignee');
    const description = formData.get('description');

    try {
      const fields = {
        description: description || undefined,
        priority: { name: priority },
        ...(assignee ? { assignee: { accountId: assignee } } : {})
      };

      const result = await this.client.createIssue(
        this.project.key,
        summary,
        issueType,
        fields
      );

      return result;
    } catch (error) {
      throw error;
    }
  }

  showError(message) {
    const errorEl = document.getElementById('create-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  static bindEvents(modal) {
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('btn-cancel');
    const overlay = document.getElementById('create-issue-modal');

    closeBtn?.addEventListener('click', () => modal.onClose?.());
    cancelBtn?.addEventListener('click', () => modal.onClose?.());

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        modal.onClose?.();
      }
    });
  }
}
