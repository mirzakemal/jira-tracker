/**
 * Shared reusable CSS style fragments for Jira Planner components.
 *
 * These patterns are duplicated across multiple component style blocks.
 * Import them in main.js and inject once via the global style tag
 * to avoid repetition across component files.
 */

// ============================================================================
// Layout Patterns
// ============================================================================

export const viewHeaderStyles = `
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .view-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .view-header-left h2 {
    margin: 0;
    color: var(--text);
    font-size: 24px;
  }

  .view-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
`

export const backButtonStyles = `
  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: var(--hover);
  }
`

export const loadingContainerStyles = `
  .loading-container,
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--text);
  }

  .loading-container {
    padding: 60px 20px;
    gap: 16px;
  }

  .loading-container p {
    color: var(--text-secondary);
  }

  .loading-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 16px;
    color: var(--text);
  }
`

export const emptyStateStyles = `
  .empty-state,
  .table-view-empty,
  .roadmap-empty,
  .saved-views-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
  }

  .empty-board {
    text-align: center;
    padding: 60px 20px;
    color: var(--text);
  }

  .empty-state .empty-hint,
  .table-view-empty .empty-hint,
  .roadmap-empty .empty-hint {
    font-size: 13px;
    margin-top: 8px;
    opacity: 0.8;
  }
`

// ============================================================================
// Modal Patterns
// ============================================================================

export const modalOverlayStyles = `
  .modal-overlay,
  .tags-editor-modal,
  .column-customizer,
  .save-view-dialog {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .tags-editor-modal,
  .save-view-dialog {
    z-index: 2000;
  }

  .save-view-dialog {
    display: none;
  }

  .save-view-dialog[style*="display: flex"] {
    display: flex;
  }
`

export const modalContentStyles = `
  .modal-content,
  .tags-editor-content,
  .column-customizer-content,
  .save-view-dialog-content {
    background: var(--surface);
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
  }

  .modal-content {
    background: var(--bg);
    padding: 25px;
    max-height: 90vh;
  }

  .column-customizer-content {
    max-height: 80vh;
  }
`

export const modalHeaderStyles = `
  .modal-header,
  .tags-editor-header,
  .column-customizer h4 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .modal-header h2,
  .tags-editor-header h4,
  .save-view-dialog-content h4,
  .column-customizer h4 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
  }

  .modal-header h2 {
    font-size: 20px;
  }
`

export const modalCloseStyles = `
  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s ease;
  }

  .modal-close:hover {
    color: var(--text);
  }
`

// ============================================================================
// Form Patterns
// ============================================================================

export const formGroupStyles = `
  .form-group,
  .toolbar-group,
  .tags-filter,
  .select-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group {
    gap: 5px;
  }

  .form-group label,
  .toolbar-group label,
  .tags-filter label,
  .select-group label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-h);
    text-transform: none;
    letter-spacing: normal;
  }

  .form-group.full-width {
    width: 100%;
    grid-column: 1 / -1;
  }
`

export const formInputStyles = `
  .form-group input,
  .form-group select,
  .form-group textarea,
  .toolbar-input,
  .toolbar-select,
  .tag-input,
  .view-name-input,
  .tags-editor-add .tag-input {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--bg);
    color: var(--text);
    transition: border-color 0.2s ease;
  }

  .toolbar-input,
  .toolbar-select,
  .tag-input {
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--background);
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus,
  .toolbar-input:focus,
  .toolbar-select:focus,
  .tag-input:focus,
  .view-name-input:focus,
  .tags-editor-add .tag-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .form-group small {
    font-size: 11px;
    color: var(--text);
  }

  .form-group small a {
    color: var(--primary);
  }

  .select-group select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export const formRowStyles = `
  .form-row {
    display: flex;
    gap: 15px;
  }

  .form-row .form-group {
    flex: 1;
  }
`

export const formContainerStyles = `
  .settings-form,
  .create-issue-form {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .create-issue-form textarea {
    resize: vertical;
    min-height: 100px;
  }
`

export const formActionsStyles = `
  .form-actions,
  .tags-editor-footer,
  .column-customizer-actions,
  .save-view-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }

  .tags-editor-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
`

// ============================================================================
// Button Patterns
// ============================================================================

export const borderButtonStyles = `
  .border-btn,
  .back-btn,
  .clear-filters-btn,
  .customize-columns-btn,
  .saved-views-dropdown,
  .toolbar-btn,
  .refresh-btn,
  .clear-field-btn {
    padding: 8px 16px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .clear-filters-btn,
  .clear-field-btn {
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .toolbar-btn {
    border-radius: 4px;
    font-size: 13px;
    height: 36px;
  }

  .refresh-btn {
    background: none;
    padding: 8px 12px;
  }

  .border-btn:hover,
  .back-btn:hover,
  .customize-columns-btn:hover,
  .saved-views-dropdown:hover,
  .toolbar-btn:hover,
  .refresh-btn:hover {
    background: var(--hover);
  }

  .clear-filters-btn:hover {
    background: var(--hover);
    color: var(--text);
    border-color: var(--primary);
  }

  .clear-field-btn:hover {
    background: var(--hover);
    color: var(--text);
    border-color: var(--primary);
  }

  .toolbar-btn:hover {
    border-color: var(--primary);
  }
`

export const btnSmStyles = `
  .btn-sm {
    padding: 6px 12px;
    font-size: 13px;
  }
`

// ============================================================================
// Badge / Chip Patterns
// ============================================================================

export const badgeBaseStyles = `
  .badge,
  .status-badge,
  .priority-badge,
  .issue-type-badge,
  .tag-badge,
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .tag-badge,
  .tags-editor-existing .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--primary-bg);
    color: var(--primary);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .tags-editor-existing .tag-badge {
    padding: 4px 10px;
    font-size: 12px;
  }

  .status-badge,
  .issue-type-badge {
    background: var(--hover);
  }

  .priority-badge {
    padding: 2px 8px;
  }

  .chip {
    background: var(--hover);
    color: var(--text);
  }
`

// ============================================================================
// Panel / Card Patterns
// ============================================================================

export const panelBaseStyles = `
  .panel,
  .settings-panel,
  .board-selector,
  .roadmap-toolbar,
  .sync-status,
  .table-view,
  .roadmap-timeline {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow);
    padding: 16px;
  }

  .settings-panel,
  .board-selector {
    background: var(--border-light);
    margin-bottom: 20px;
    box-shadow: none;
  }

  .settings-panel {
    padding: 20px;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .board-selector {
    padding: 15px 20px;
  }

  .roadmap-toolbar {
    margin-bottom: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-end;
  }

  .sync-status {
    display: flex;
    align-items: center;
    gap: 10px;
  }
`

// ============================================================================
// Utility / Helper Patterns
// ============================================================================

export const errorMessageStyles = `
  .error-message {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
    padding: 10px;
    border-radius: 6px;
    font-size: 13px;
  }
`

export const flexBetweenStyles = `
  .flex-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .flex-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`

export const userBadgeStyles = `
  .user-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
`

export const spinnerStyles = `
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`

export const tagRemoveStyles = `
  .tag-remove,
  .tags-editor-existing .tag-remove,
  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    transition: all 0.2s ease;
    padding: 0;
  }

  .tags-editor-existing .tag-remove {
    width: 18px;
    height: 18px;
  }

  .chip-remove {
    color: var(--text-secondary);
  }

  .tag-remove:hover,
  .tags-editor-existing .tag-remove:hover {
    background: var(--primary);
    color: white;
  }

  .chip-remove:hover {
    background: var(--text-secondary);
    color: var(--background);
  }
`

export const tagsEditorBodyStyles = `
  .tags-editor-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tags-editor-summary {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .tags-editor-existing {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 32px;
  }

  .tags-editor-add {
    display: flex;
    gap: 8px;
    align-items: center;
  }
`

export const issueLinkStyles = `
  .issue-link {
    color: var(--primary);
    text-decoration: none;
    font-size: 13px;
  }

  .issue-link:hover {
    text-decoration: underline;
  }
`

export const priorityColorStyles = `
  .priority-highest { background: #ffebee; color: #c62828; }
  .priority-high    { background: #fff3e0; color: #e65100; }
  .priority-medium  { background: #fff8e1; color: #f9a825; }
  .priority-low     { background: #e8f5e9; color: #2e7d32; }
`

export const issueBarStatusStyles = `
  .issue-bar.status-done       { background: #22c55e; color: white; }
  .issue-bar.status-inprogress { background: #3b82f6; color: white; }
  .issue-bar.status-todo       { background: #f59e0b; color: white; }
  .issue-bar.status-default    { background: #6b7280; color: white; }

  .issue-milestone.status-done       { border-top-color: #22c55e; }
  .issue-milestone.status-inprogress { border-top-color: #3b82f6; }
  .issue-milestone.status-todo       { border-top-color: #f59e0b; }
  .issue-milestone.status-default    { border-top-color: #6b7280; }
`

// ============================================================================
// Aggregated shared styles for easy injection
// ============================================================================

export const sharedStyles = `
  ${viewHeaderStyles}
  ${backButtonStyles}
  ${loadingContainerStyles}
  ${emptyStateStyles}
  ${modalOverlayStyles}
  ${modalContentStyles}
  ${modalHeaderStyles}
  ${modalCloseStyles}
  ${formGroupStyles}
  ${formInputStyles}
  ${formRowStyles}
  ${formContainerStyles}
  ${formActionsStyles}
  ${borderButtonStyles}
  ${btnSmStyles}
  ${badgeBaseStyles}
  ${panelBaseStyles}
  ${errorMessageStyles}
  ${flexBetweenStyles}
  ${userBadgeStyles}
  ${spinnerStyles}
  ${tagRemoveStyles}
  ${tagsEditorBodyStyles}
  ${issueLinkStyles}
  ${priorityColorStyles}
  ${issueBarStatusStyles}
`
