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
    margin-bottom: 24px;
  }

  .view-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .view-header-left h2 {
    margin: 0;
    color: var(--text-h);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.025em;
  }

  .view-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
`

export const backButtonStyles = `
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    box-shadow: var(--shadow-xs);
    transition: background var(--dur-fast) var(--ease-out),
                border-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out),
                transform var(--dur-fast) var(--ease-out);
  }

  .back-btn:hover {
    background: var(--surface-sunken);
    border-color: var(--border-strong);
    color: var(--text-h);
  }

  .back-btn:active { transform: translateY(0); }
`

export const loadingContainerStyles = `
  .loading-container,
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    color: var(--text);
  }

  .loading-container {
    padding: 72px 24px;
    gap: 16px;
  }

  .loading-container p {
    color: var(--text-muted);
    font-size: 13px;
  }

  .loading-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 72px 24px;
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
    padding: 72px 24px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .empty-board {
    text-align: center;
    padding: 72px 24px;
    color: var(--text);
  }

  .empty-state .empty-hint,
  .table-view-empty .empty-hint,
  .roadmap-empty .empty-hint {
    font-size: 13px;
    margin-top: 8px;
    opacity: 0.85;
    color: var(--text-muted);
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
    background: rgba(10, 14, 26, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: modalFadeIn var(--dur) var(--ease-out);
  }

  @keyframes modalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    border: 1px solid var(--border-light);
    border-radius: var(--radius-xl);
    padding: 24px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-xl);
    animation: modalSlideUp var(--dur-slow) var(--ease-out);
  }

  @keyframes modalSlideUp {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .modal-content {
    background: var(--surface);
    padding: 28px;
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
    margin-bottom: 20px;
  }

  .modal-header h2,
  .tags-editor-header h4,
  .save-view-dialog-content h4,
  .column-customizer h4 {
    margin: 0;
    color: var(--text-h);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  .modal-header h2 {
    font-size: 20px;
    letter-spacing: -0.02em;
  }
`

export const modalCloseStyles = `
  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: var(--radius-md);
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }

  .modal-close:hover {
    background: var(--hover);
    color: var(--text-h);
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
    gap: 6px;
  }

  .form-group {
    gap: 6px;
  }

  .form-group label,
  .toolbar-group label,
  .tags-filter label,
  .select-group label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-h);
    text-transform: none;
    letter-spacing: -0.005em;
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
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-family: inherit;
    font-size: 14px;
    background: var(--surface);
    color: var(--text-h);
    transition: border-color var(--dur-fast) var(--ease-out),
                box-shadow var(--dur-fast) var(--ease-out),
                background var(--dur-fast) var(--ease-out);
  }

  .toolbar-input,
  .toolbar-select,
  .tag-input {
    padding: 7px 12px;
    font-size: 13px;
  }

  .form-group input:hover,
  .form-group select:hover,
  .form-group textarea:hover,
  .toolbar-input:hover,
  .toolbar-select:hover {
    border-color: var(--border-strong);
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
    box-shadow: var(--focus-ring);
  }

  .form-group input::placeholder,
  .form-group textarea::placeholder,
  .toolbar-input::placeholder,
  .tag-input::placeholder {
    color: var(--text-muted);
  }

  .form-group small {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
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
    gap: 16px;
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
    gap: 16px;
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
    margin-top: 12px;
  }

  .tags-editor-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border-light);
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
  .clear-field-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    box-shadow: var(--shadow-xs);
    transition: background var(--dur-fast) var(--ease-out),
                border-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out),
                box-shadow var(--dur-fast) var(--ease-out);
  }

  .clear-filters-btn,
  .clear-field-btn {
    background: transparent;
    color: var(--text-muted);
    box-shadow: none;
    font-size: 12.5px;
  }

  .toolbar-btn {
    height: 34px;
  }

  .border-btn:hover,
  .back-btn:hover,
  .customize-columns-btn:hover,
  .saved-views-dropdown:hover,
  .toolbar-btn:hover {
    background: var(--surface-sunken);
    border-color: var(--border-strong);
    color: var(--text-h);
  }

  .clear-filters-btn:hover {
    background: var(--hover);
    color: var(--text-h);
    border-color: var(--primary-border);
  }

  .clear-field-btn:hover {
    background: var(--hover);
    color: var(--text-h);
    border-color: var(--primary-border);
  }

  .toolbar-btn:hover { border-color: var(--primary-border); }
`

export const btnSmStyles = `
  .btn-sm {
    padding: 6px 12px;
    font-size: 12.5px;
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
    padding: 3px 9px;
    border-radius: var(--radius-full);
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: -0.005em;
    line-height: 1.4;
  }

  .tag-badge,
  .tags-editor-existing .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    background: var(--primary-bg);
    color: var(--primary);
    border: 1px solid var(--primary-border);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
  }

  .tags-editor-existing .tag-badge {
    padding: 4px 10px;
    font-size: 12px;
  }

  .status-badge,
  .issue-type-badge {
    background: var(--surface-sunken);
    color: var(--text);
    border: 1px solid var(--border-light);
  }

  .priority-badge {
    padding: 2px 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10.5px;
  }

  .chip {
    background: var(--surface-sunken);
    color: var(--text);
    border: 1px solid var(--border-light);
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
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    padding: 16px;
  }

  .settings-panel,
  .board-selector {
    background: var(--surface);
    border-color: var(--border);
    margin-bottom: 20px;
    box-shadow: var(--shadow-xs);
  }

  .settings-panel {
    padding: 24px;
    max-width: 520px;
    margin-left: auto;
    margin-right: auto;
    border-radius: var(--radius-xl);
  }

  .board-selector {
    padding: 14px 18px;
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
    background: var(--danger-bg);
    border: 1px solid rgba(220, 38, 38, 0.25);
    color: var(--danger);
    padding: 11px 14px;
    border-radius: var(--radius-md);
    font-size: 13px;
    line-height: 1.5;
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
    gap: 6px;
    white-space: nowrap;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid var(--surface);
    box-shadow: var(--shadow-xs);
  }
`

export const spinnerStyles = `
  .spinner {
    width: 36px;
    height: 36px;
    border: 2.5px solid var(--border-light);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
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
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
    padding: 0;
  }

  .tags-editor-existing .tag-remove {
    width: 18px;
    height: 18px;
  }

  .chip-remove {
    color: var(--text-muted);
  }

  .tag-remove:hover,
  .tags-editor-existing .tag-remove:hover {
    background: var(--primary);
    color: white;
  }

  .chip-remove:hover {
    background: var(--text-muted);
    color: var(--surface);
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
    color: var(--text-muted);
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
    font-weight: 500;
    font-family: var(--mono);
    letter-spacing: 0.01em;
  }

  .issue-link:hover {
    text-decoration: underline;
  }
`

export const priorityColorStyles = `
  .priority-highest { background: var(--danger-bg); color: var(--danger); }
  .priority-high    { background: rgba(234, 88, 12, 0.10); color: #ea580c; }
  .priority-medium  { background: var(--warning-bg); color: var(--warning); }
  .priority-low     { background: var(--success-bg); color: var(--success); }
`

export const issueBarStatusStyles = `
  .issue-bar.status-done       { background: var(--success); color: white; }
  .issue-bar.status-inprogress { background: var(--info); color: white; }
  .issue-bar.status-todo       { background: var(--warning); color: white; }
  .issue-bar.status-default    { background: #64748b; color: white; }

  .issue-milestone.status-done       { border-top-color: var(--success); }
  .issue-milestone.status-inprogress { border-top-color: var(--info); }
  .issue-milestone.status-todo       { border-top-color: var(--warning); }
  .issue-milestone.status-default    { border-top-color: #64748b; }
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
