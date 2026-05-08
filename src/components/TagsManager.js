/**
 * Tags Manager Styles
 * Shared CSS for tag-related components
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

  .tag-add-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .tag-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: var(--primary);
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: all 0.2s ease;
  }

  .tag-add-btn:hover {
    background: var(--primary-hover);
    transform: scale(1.1);
  }

`;
