import './style.css'
import { SettingsPanel } from './components/SettingsPanel.js'
import { BoardSelector } from './components/BoardSelector.js'
import { IssueBoard } from './components/IssueBoard.js'
import { CreateIssueModal } from './components/CreateIssueModal.js'
import { saveSelection, loadSelection } from './utils/storage.js'

// App State
const state = {
  client: null,
  user: null,
  project: null,
  board: null,
  sprint: null,
  currentIssues: [],
  issuesAbortController: null
}

// DOM Elements
let appElement

/**
 * Initialize the application
 */
function init() {
  appElement = document.getElementById('app')
  renderDisconnected()
}

/**
 * Render disconnected state (settings panel)
 */
function renderDisconnected() {
  const settingsPanel = new SettingsPanel(handleConnect)

  appElement.innerHTML = `
    <div class="app-container">
      <div class="app-header">
        <h1 class="app-title">📋 Jira Planner</h1>
      </div>
      <div id="settings-container"></div>
    </div>
  `

  const container = document.getElementById('settings-container')
  container.innerHTML = settingsPanel.render()
  settingsPanel.bindEvents()
}

/**
 * Render connected state (full app)
 */
function renderConnected(user) {
  appElement.innerHTML = `
    <div class="app-container">
      <div class="app-header">
        <div>
          <h1 class="app-title">📋 Jira Planner</h1>
          <p style="margin: 5px 0 0; font-size: 14px; color: var(--text);">
            Connected as ${user.displayName}
          </p>
        </div>
        <div class="board-actions">
          <button class="refresh-btn" id="refresh-btn" title="Refresh issues">
            🔄 Refresh
          </button>
          <button class="btn btn-primary" id="create-issue-btn">
            + Create Issue
          </button>
        </div>
      </div>

      <div id="board-selector-container"></div>
      <div id="issue-board-container"></div>
    </div>
  `

  // Initialize board selector
  const boardSelector = new BoardSelector(handleSelectionChange)
  const selectorContainer = document.getElementById('board-selector-container')
  selectorContainer.innerHTML = boardSelector.render()

  // Load projects and boards
  boardSelector.load(state.client).then(() => {
    selectorContainer.innerHTML = boardSelector.render()
    boardSelector.bindEvents(state.client)

    // Load initial issues
    loadIssues()
  })

  // Bind toolbar events
  document.getElementById('refresh-btn')?.addEventListener('click', loadIssues)
  document.getElementById('create-issue-btn')?.addEventListener('click', handleCreateIssue)
}

/**
 * Handle connection from settings panel
 */
function handleConnect({ client, user }) {
  state.client = client
  state.user = user
  renderConnected(user)
}

/**
 * Handle board/sprint selection change
 */
async function handleSelectionChange(selection) {
  state.project = selection.project
  state.board = selection.board
  state.sprint = selection.sprint

  // Save selection
  if (state.board) {
    saveSelection({ boardId: state.board.id, sprintId: state.sprint?.id })
  }

  await loadIssues()
}

/**
 * Load issues from selected board/sprint
 */
async function loadIssues() {
  if (!state.board) return

  // Cancel any previous in-flight request
  if (state.issuesAbortController) {
    state.issuesAbortController.abort()
  }
  state.issuesAbortController = new AbortController()

  const container = document.getElementById('issue-board-container')
  container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading issues...</p></div>'

  try {
    const issueBoard = new IssueBoard(state.client, () => loadIssues())
    await issueBoard.loadIssues(state.board, state.sprint, { signal: state.issuesAbortController.signal })

    // Skip update if request was aborted
    if (state.issuesAbortController.signal.aborted) {
      return
    }

    container.innerHTML = issueBoard.render()
    issueBoard.bindEvents()

    // Store issues globally for drag-and-drop
    window.currentIssues = Array.from(issueBoard.columns.values()).flat()
    state.currentIssues = window.currentIssues
  } catch (error) {
    // Ignore abort errors (expected when canceling requests)
    if (error.name === 'AbortError') {
      return
    }

    container.innerHTML = `
      <div class="error-message" style="padding: 20px; text-align: center;">
        <p>Failed to load issues: ${error.message}</p>
        <button class="btn btn-primary" onclick="loadIssues()" style="margin-top: 10px;">
          Try Again
        </button>
      </div>
    `
  }
}

/**
 * Handle create issue button click
 */
async function handleCreateIssue() {
  if (!state.project) {
    alert('Please select a project first')
    return
  }

  const modal = new CreateIssueModal(state.client, state.project, () => {
    document.getElementById('create-issue-modal')?.remove()
  })

  await modal.load()

  const div = document.createElement('div')
  div.innerHTML = modal.render()
  document.body.appendChild(div.firstElementChild)

  CreateIssueModal.bindEvents(modal)

  const form = document.getElementById('create-issue-form')
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const submitBtn = document.getElementById('btn-create')
    submitBtn.disabled = true
    submitBtn.textContent = 'Creating...'

    try {
      const result = await modal.submit()
      document.getElementById('create-issue-modal')?.remove()

      // Reload issues to show the new one
      await loadIssues()

      // Show success message
      showNotification(`Issue ${result.key} created successfully!`)
    } catch (error) {
      modal.showError(error.message || 'Failed to create issue')
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Create Issue'
    }
  })
}

/**
 * Show a notification message
 */
function showNotification(message) {
  const notification = document.createElement('div')
  notification.className = 'notification'
  notification.textContent = message
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--accent);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: var(--shadow);
    z-index: 2000;
    animation: slideIn 0.3s ease;
  `

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.style.opacity = '0'
    notification.style.transition = 'opacity 0.3s'
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}

// Add animation keyframes
const style = document.createElement('style')
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`
document.head.appendChild(style)

// Make loadIssues available globally for the retry button
window.loadIssues = loadIssues

// Initialize app
init()
