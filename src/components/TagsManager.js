/**
 * Tags Manager Component
 * Allows adding, removing, and filtering issues by personalized tags
 */

import { addTag as addTagToDb, removeTag as removeTagFromDb, getTags, getAllTags, getIssuesByTag } from '../db/queries.js';

export class TagsManager {
  constructor(issueKey, tags = [], onTagsChange) {
    this.issueKey = issueKey;
    this.tags = tags || [];
    this.onTagsChange = onTagsChange;
  }

  /**
   * Render the tags manager for a single issue
   */
  render() {
    return `
      <div class="tags-manager" data-issue-key="${this.issueKey}">
        <div class="tags-list" id="tags-list-${this.issueKey}">
          ${this.tags.length === 0
            ? '<span class="no-tags">No tags</span>'
            : this.tags.map(tag => `
                <span class="tag-badge" data-tag="${this.escapeHtml(tag)}">
                  ${this.escapeHtml(tag)}
                  <button class="tag-remove" data-tag="${this.escapeHtml(tag)}" title="Remove tag">&times;</button>
                </span>
              `).join('')}
        </div>
        <div class="tag-add-row">
          <input
            type="text"
            class="tag-input"
            id="tag-input-${this.issueKey}"
            placeholder="Add tag..."
            list="tags-datalist-${this.issueKey}"
          />
          <datalist id="tags-datalist-${this.issueKey}">
            ${this.getAllKnownTags().map(tag => `<option value="${this.escapeHtml(tag)}">`).join('')}
          </datalist>
          <button class="tag-add-btn" id="tag-add-btn-${this.issueKey}" title="Add tag">+</button>
        </div>
      </div>
    `;
  }

  /**
   * Get all known tags for suggestions
   */
  async getAllKnownTags() {
    try {
      return await getAllTags();
    } catch (e) {
      return [];
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const issueKey = this.issueKey;

    // Add tag button
    const addBtn = document.getElementById(`tag-add-btn-${issueKey}`);
    const input = document.getElementById(`tag-input-${issueKey}`);

    addBtn?.addEventListener('click', async () => {
      const tagName = input?.value?.trim();
      if (tagName) {
        await this.addTag(tagName);
        if (input) input.value = '';
      }
    });

    // Add tag on Enter key
    input?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const tagName = input.value.trim();
        if (tagName) {
          await this.addTag(tagName);
          input.value = '';
        }
      }
    });

    // Remove tag buttons
    const removeBtns = document.querySelectorAll(`#tags-list-${issueKey} .tag-remove`);
    removeBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tagName = btn.dataset.tag;
        await this.removeTag(tagName);
      });
    });
  }

  /**
   * Add a tag
   */
  async addTag(tagName) {
    if (this.tags.includes(tagName)) {
      return; // Tag already exists
    }

    try {
      await addTagToDb(this.issueKey, tagName);
      this.tags = [...this.tags, tagName];
      this.refresh();

      if (this.onTagsChange) {
        this.onTagsChange(this.issueKey, this.tags);
      }
    } catch (error) {
      console.error('[TagsManager] Failed to add tag:', error);
    }
  }

  /**
   * Remove a tag
   */
  async removeTag(tagName) {
    try {
      await removeTagFromDb(this.issueKey, tagName);
      this.tags = this.tags.filter(t => t !== tagName);
      this.refresh();

      if (this.onTagsChange) {
        this.onTagsChange(this.issueKey, this.tags);
      }
    } catch (error) {
      console.error('[TagsManager] Failed to remove tag:', error);
    }
  }

  /**
   * Refresh the component
   */
  refresh() {
    const container = document.querySelector(`.tags-manager[data-issue-key="${this.issueKey}"]`);
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
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
 * Tags Filter Component
 * Provides filtering by tags
 */
export class TagsFilter {
  constructor(selectedTag, onTagSelect) {
    this.selectedTag = selectedTag || null;
    this.onTagSelect = onTagSelect;
  }

  /**
   * Render the tags filter
   */
  render() {
    const allTags = this.getAllTags();

    return `
      <div class="tags-filter" id="tags-filter">
        <label for="tag-filter-select">Tags</label>
        <select id="tag-filter-select" class="filter-select">
          <option value="">All Tags</option>
          ${allTags.map(tag => `
            <option value="${this.escapeHtml(tag)}" ${this.selectedTag === tag ? 'selected' : ''}>
              ${this.escapeHtml(tag)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  /**
   * Get all tags from database
   */
  getAllTags() {
    try {
      return getAllTags();
    } catch (e) {
      return [];
    }
  }

  /**
   * Refresh the component
   */
  refresh() {
    const container = document.getElementById('tags-filter');
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents();
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const select = document.getElementById('tag-filter-select');
    select?.addEventListener('change', (e) => {
      this.selectedTag = e.target.value || null;
      if (this.onTagSelect) {
        this.onTagSelect(this.selectedTag);
      }
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
 * Tags Manager Styles
 */
export const TagsManagerStyles = `
  .tags-manager {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 24px;
  }

  .no-tags {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--accent-bg);
    color: var(--accent);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    transition: all 0.2s ease;
  }

  .tag-remove:hover {
    background: var(--accent);
    color: white;
  }

  .tag-add-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .tag-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    background: var(--background);
    color: var(--text);
  }

  .tag-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .tag-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: all 0.2s ease;
  }

  .tag-add-btn:hover {
    background: var(--accent-hover);
    transform: scale(1.1);
  }

  .tags-filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tags-filter label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;
