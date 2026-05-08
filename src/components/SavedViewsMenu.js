/**
 * Saved Views Menu Component
 * Allows saving, loading, and deleting custom views
 */

import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { getSavedViews, saveView, deleteView } from '../db/queries.js';

export class SavedViewsMenu {
  constructor(onLoad, onSave, onDelete) {
    this.onLoad = onLoad;
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.views = [];
    this.isLoading = false;
    this.isSaving = false;
    this._boundDocClick = null;
  }

  /**
   * Load saved views from database
   */
  async loadViews() {
    try {
      this.views = await getSavedViews();
      this.refresh();
    } catch (error) {
      logger.error('[SavedViewsMenu] Failed to load views:', error);
    }
  }

  /**
   * Render the menu
   */
  render() {
    if (this.isLoading) {
      return `
        <div class="saved-views-menu">
          <span class="loading">Loading...</span>
        </div>
      `;
    }

    return `
      <div class="saved-views-menu" id="saved-views-menu">
        <button class="saved-views-dropdown" id="saved-views-dropdown">
          💾 Saved Views
          <span class="dropdown-arrow">▼</span>
        </button>
        <div class="saved-views-dropdown-content" id="saved-views-dropdown-content" style="display: none;">
          <div class="saved-views-header">
            <span>Load View</span>
          </div>
          <div class="saved-views-list">
            ${this.views.length === 0
              ? '<div class="saved-views-empty">No saved views yet</div>'
              : this.views.map(view => `
                  <div class="saved-view-item" data-view-id="${view.id}">
                    <span class="view-name">${escapeHtml(view.name)}</span>
                    <button class="delete-view-btn" data-view-id="${view.id}" title="Delete view">✕</button>
                  </div>
                `).join('')
            }
          </div>
          <div class="saved-views-footer">
            <button class="btn btn-primary btn-sm" id="save-new-view-btn">
              + Save Current View
            </button>
          </div>
        </div>
        <div class="save-view-dialog" id="save-view-dialog" style="display: none;">
          <div class="save-view-dialog-content">
            <h4>Save View</h4>
            <input
              type="text"
              id="view-name-input"
              class="view-name-input"
              placeholder="Enter view name..."
              autofocus
            />
            <div class="save-view-actions">
              <button class="btn btn-secondary" id="cancel-save-view-btn">Cancel</button>
              <button class="btn btn-primary" id="confirm-save-view-btn">
                ${this.isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Refresh the component
   */
  refresh() {
    const container = document.getElementById('saved-views-menu');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Dropdown toggle
    const dropdownBtn = document.getElementById('saved-views-dropdown');
    const dropdownContent = document.getElementById('saved-views-dropdown-content');

    dropdownBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdownContent) {
        const isVisible = dropdownContent.style.display !== 'none';
        dropdownContent.style.display = isVisible ? 'none' : 'block';
      }
    });

    // Close dropdown when clicking outside
    if (this._boundDocClick) {
      document.removeEventListener('click', this._boundDocClick);
    }
    this._boundDocClick = (e) => {
      const content = document.getElementById('saved-views-dropdown-content');
      if (content && !content.contains(e.target) && e.target !== document.getElementById('saved-views-dropdown')) {
        content.style.display = 'none';
      }
    };
    document.addEventListener('click', this._boundDocClick);

    // Load view
    const viewItems = document.querySelectorAll('.saved-view-item');
    viewItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-view-btn')) return;

        const viewId = parseInt(item.dataset.viewId);
        const view = this.views.find(v => v.id === viewId);
        if (view && this.onLoad) {
          this.onLoad(view);
          dropdownContent.style.display = 'none';
        }
      });
    });

    // Delete view
    const deleteBtns = document.querySelectorAll('.delete-view-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const viewId = parseInt(btn.dataset.viewId);
        if (this.onDelete) {
          await deleteView(viewId);
          this.loadViews();
          this.onDelete(viewId);
        }
      });
    });

    // Save new view dialog
    const saveNewBtn = document.getElementById('save-new-view-btn');
    const saveDialog = document.getElementById('save-view-dialog');
    const cancelSaveBtn = document.getElementById('cancel-save-view-btn');
    const confirmSaveBtn = document.getElementById('confirm-save-view-btn');
    const viewNameInput = document.getElementById('view-name-input');

    saveNewBtn?.addEventListener('click', () => {
      if (saveDialog) {
        saveDialog.style.display = 'flex';
      }
      if (viewNameInput) {
        viewNameInput.focus();
      }
    });

    cancelSaveBtn?.addEventListener('click', () => {
      if (saveDialog) saveDialog.style.display = 'none';
      if (viewNameInput) viewNameInput.value = '';
    });

    confirmSaveBtn?.addEventListener('click', async () => {
      const name = viewNameInput?.value?.trim();
      if (!name) {
        viewNameInput.focus();
        return;
      }

      this.isSaving = true;
      this.refresh();

      try {
        const viewData = this.onSave?.(name);
        if (viewData) {
          await saveView(name, viewData.columns, viewData.filters);
          this.loadViews();
          if (saveDialog) saveDialog.style.display = 'none';
          if (viewNameInput) viewNameInput.value = '';
        }
      } catch (error) {
        logger.error('[SavedViewsMenu] Failed to save view:', error);
      } finally {
        this.isSaving = false;
        this.refresh();
      }
    });

    // Handle enter key in input
    viewNameInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmSaveBtn?.click();
      }
    });
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    if (this._boundDocClick) {
      document.removeEventListener('click', this._boundDocClick);
      this._boundDocClick = null;
    }
  }
}

/**
 * Saved Views Menu Styles
 */
export const SavedViewsMenuStyles = `
  .saved-views-menu {
    position: relative;
  }

  .dropdown-arrow {
    font-size: 10px;
    transition: transform 0.2s ease;
  }

  .saved-views-dropdown[aria-expanded="true"] .dropdown-arrow {
    transform: rotate(180deg);
  }

  .saved-views-dropdown-content {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    min-width: 250px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    z-index: 100;
  }

  .saved-views-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .saved-views-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .saved-view-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .saved-view-item:hover {
    background: var(--hover);
  }

  .view-name {
    font-size: 14px;
    color: var(--text);
  }

  .delete-view-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .delete-view-btn:hover {
    background: #ffebee;
    color: #c62828;
  }

  .saved-views-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
`;
