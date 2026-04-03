/**
 * Board Selector Component
 * Allows selecting project, board, and sprint
 */

export class BoardSelector {
  constructor(onSelectionChange) {
    this.onSelectionChange = onSelectionChange;
    this.projects = [];
    this.boards = [];
    this.sprints = [];
    this.selectedProject = null;
    this.selectedBoard = null;
    this.selectedSprint = null;
  }

  async load(client) {
    try {
      const projectsData = await client.getProjects();
      this.projects = projectsData.values || projectsData || [];

      if (this.projects.length > 0 && !this.selectedProject) {
        this.selectedProject = this.projects[0].key;
      }

      await this.loadBoards(client);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  async loadBoards(client, projectKey = null) {
    try {
      const key = projectKey || this.selectedProject;
      if (!key) {
        this.boards = [];
        return;
      }

      this.boards = await client.getBoards(key);

      if (this.boards.length > 0 && !this.selectedBoard) {
        this.selectedBoard = this.boards[0].id;
      }

      await this.loadSprints(client);
    } catch (error) {
      console.error('Failed to load boards:', error);
      this.boards = [];
    }
  }

  async loadSprints(client, boardId = null) {
    const id = boardId || this.selectedBoard;
    if (!id) {
      this.sprints = [];
      this.selectedSprint = null;
      if (this.onSelectionChange) {
        this.onSelectionChange(this.getSelection());
      }
      return;
    }

    this.sprints = [];

    // Try to load sprints - some board types don't support sprints
    try {
      // First try to get active sprints
      this.sprints = await client.getSprints(id, 'active');

      // If no active sprints, get future sprints
      if (this.sprints.length === 0) {
        this.sprints = await client.getSprints(id, 'future');
      }

      // If still no sprints, get all
      if (this.sprints.length === 0) {
        this.sprints = await client.getSprints(id);
      }
    } catch (error) {
      // Board doesn't support sprints (e.g., Kanban board without sprints)
      console.log(`[BoardSelector] Board ${id} does not support sprints, using "All Sprints" view`);
      this.sprints = [];
    }

    // Select first sprint if available, otherwise default to "All Sprints"
    if (this.sprints.length > 0 && !this.selectedSprint) {
      this.selectedSprint = this.sprints[0].id;
    } else {
      // No sprints available, default to "All Sprints" view
      this.selectedSprint = 'all';
    }

    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelection());
    }
  }

  getSelection() {
    return {
      project: this.projects.find(p => p.key === this.selectedProject),
      board: this.boards.find(b => b.id === this.selectedBoard),
      sprint: this.selectedSprint === 'all'
        ? { id: 'all', name: 'All Sprints (Past, Current & Future)', hasSprints: this.sprints.length > 0 }
        : (this.selectedSprint ? this.sprints.find(s => s.id === this.selectedSprint) : null),
      hasSprints: this.sprints.length > 0
    };
  }

  render() {
    if (this.projects.length === 0) {
      return `
        <div class="board-selector">
          <div class="loading">Loading projects...</div>
        </div>
      `;
    }

    return `
      <div class="board-selector">
        <div class="selector-row">
          <div class="select-group">
            <label for="project-select">Project</label>
            <select id="project-select">
              ${this.projects.map(p => `
                <option value="${p.key}" ${p.key === this.selectedProject ? 'selected' : ''}>
                  ${p.name} (${p.key})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="select-group">
            <label for="board-select">Board</label>
            <select id="board-select" ${this.boards.length === 0 ? 'disabled' : ''}>
              ${this.boards.length === 0
                ? '<option value="">No boards found</option>'
                : this.boards.map(b => `
                    <option value="${b.id}" ${b.id === this.selectedBoard ? 'selected' : ''}>
                      ${b.name}
                    </option>
                  `).join('')
              }
            </select>
          </div>

          <div class="select-group">
            <label for="sprint-select">Sprint</label>
            <select id="sprint-select" ${this.sprints.length === 0 && this.selectedSprint !== 'all' ? 'disabled' : ''} class="${this.selectedSprint === 'all' ? 'all-sprints-selected' : ''}">
              ${this.sprints.length === 0
                ? `<option value="all" ${!this.selectedSprint || this.selectedSprint === 'all' ? 'selected' : ''} class="all-sprints-option">
                    📊 All Sprints (Past, Current & Future) - No sprints found
                   </option>`
                : `
                    <option value="all" ${!this.selectedSprint ? 'selected' : ''} class="all-sprints-option">
                      📊 All Sprints (Past, Current & Future)
                    </option>
                  ` +
                  this.sprints.map(s => `
                    <option value="${s.id}" ${s.id === this.selectedSprint ? 'selected' : ''}>
                      ${s.name}
                    </option>
                  `).join('')
              }
            </select>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents(client) {
    const projectSelect = document.getElementById('project-select');
    const boardSelect = document.getElementById('board-select');
    const sprintSelect = document.getElementById('sprint-select');

    projectSelect?.addEventListener('change', async (e) => {
      this.selectedProject = e.target.value;
      this.selectedBoard = null;
      this.selectedSprint = null;
      await this.loadBoards(client);
      this.refresh(client);
    });

    boardSelect?.addEventListener('change', async (e) => {
      this.selectedBoard = e.target.value ? parseInt(e.target.value) : null;
      this.selectedSprint = null;
      await this.loadSprints(client);
      this.refresh(client);
    });

    sprintSelect?.addEventListener('change', (e) => {
      const value = e.target.value;
      this.selectedSprint = value === 'all' ? 'all' : (value ? parseInt(value) : null);
      if (this.onSelectionChange) {
        this.onSelectionChange(this.getSelection());
      }
    });
  }

  refresh(client) {
    const container = document.querySelector('.board-selector');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents(client);
    }
  }
}
