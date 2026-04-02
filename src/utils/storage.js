/**
 * Local Storage Utilities
 * Handles saving/loading credentials securely
 */

const STORAGE_KEY = 'jira-planner-credentials';

/**
 * Save credentials to localStorage
 * @returns {boolean} true if saved successfully, false otherwise
 */
export function saveCredentials({ domain, email, token }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ domain, email, token }));
    return true;
  } catch (error) {
    console.error('Failed to save credentials:', error);
    if (error.name === 'QuotaExceededError') {
      alert('Storage full. Please clear browser data or use session mode.');
    } else if (error.name === 'SecurityError') {
      alert('LocalStorage is disabled (private browsing mode). Credentials will not persist.');
    }
    return false;
  }
}

/**
 * Load credentials from localStorage
 */
export function loadCredentials() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load credentials:', error);
    return null;
  }
}

/**
 * Clear stored credentials
 */
export function clearCredentials() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear credentials:', error);
  }
}

/**
 * Save board/sprint selection
 */
export function saveSelection({ boardId, sprintId }) {
  try {
    localStorage.setItem('jira-planner-selection', JSON.stringify({
      boardId,
      sprintId
    }));
  } catch (error) {
    console.error('Failed to save selection:', error);
  }
}

/**
 * Load saved board/sprint selection
 */
export function loadSelection() {
  try {
    const data = localStorage.getItem('jira-planner-selection');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load selection:', error);
    return null;
  }
}
