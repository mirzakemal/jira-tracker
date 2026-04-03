import './style.css'
import { SettingsPanel } from './components/SettingsPanel.js'
import { BoardSelector } from './components/BoardSelector.js'
import { IssueBoard } from './components/IssueBoard.js'
import { AllIssuesView, AllIssuesViewStyles } from './components/AllIssuesView.js'
import { SyncStatus, SyncStatusStyles } from './components/SyncStatus.js'
import { FilterPanelStyles } from './components/FilterPanel.js'
import { TableViewStyles } from './components/TableView.js'
import { SavedViewsMenuStyles } from './components/SavedViewsMenu.js'
import { TagsManagerStyles } from './components/TagsManager.js'
import { saveSelection, loadSelection, loadCredentials } from './utils/storage.js'
import { initDatabase } from './db/indexeddb.js'
import { syncAll, syncIncremental, getSyncStatus } from './db/sync.js'
import { invalidateFilterCache } from './db/queries.js'
import { JiraClient } from './api/jira.js'
import { navigate, onRouteChange, updateQueryParams, filtersToParams, paramsToFilters, ROUTES, parseRoute } from './utils/router.js'

// App State
const state = {
  client: null,
  user: null,
  project: null,
  board: null,
  sprint: null,
  currentIssues: [],
  issuesAbortController: null,
  dbInitialized: false,
  isSyncing: false,
  currentView: 'board', // 'board' or 'all-issues'
  jiraDomain: null,
  filters: {} // Store current filters
}

// DOM Elements
let appElement

/**
 * Initialize the application
 */
async function init() {
  appElement = document.getElementById('app')

  // Expose router functions globally for components
  window.navigate = navigate
  window.updateQueryParams = updateQueryParams
  window.filtersToParams = filtersToParams
  window.paramsToFilters = paramsToFilters

  // Try to auto-connect if credentials exist
  const saved = loadCredentials()
  if (saved?.domain && saved?.email && saved?.token) {
    await autoConnect(saved)
  } else {
    renderDisconnected()
  }

  // Set up route listener to handle navigation after user is connected
  // Initial route is handled by autoConnect() which parses route before rendering
  onRouteChange(handleRouteChange)
}

/**
 * Handle route changes
 */
function handleRouteChange({ route, params }) {
  // Skip if client not ready yet
  if (!state.client) {
    console.log('[Route] Skipping - client not ready')
    return
  }

  // Convert URL params to filters
  const filters = paramsToFilters(params)
  state.filters = filters

  console.log('[Route] Handling route:', route, 'params:', params, 'currentView:', state.currentView)

  // Handle route - check for any filter params or all-issues route
  if (route === ROUTES.ALL_ISSUES || params.allIssues === 'true' || params.customer || params.fixVersion || params.status || params.product || params.tag || params.projectKey) {
    console.log('[Route] Switching to All Issues view')
    if (state.currentView !== 'all-issues') {
      state.currentView = 'all-issues'
      updateViewToggle()

      // Hide board selector
      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      const allIssuesView = new AllIssuesView(state.client, state.jiraDomain, switchToBoardView)
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = allIssuesView.render()
        allIssuesView.loadIssues(filters)
      }
    } else {
      // Already in all-issues view, apply filters if they changed
      const container = document.getElementById('all-issues-view')
      if (container && window.currentAllIssuesView) {
        const filtersChanged = JSON.stringify(window.currentAllIssuesView.filters) !== JSON.stringify(filters)
        if (filtersChanged) {
          // Use the debounced loadIssues for smooth filtering
          window.currentAllIssuesView.filters = filters
          window.currentAllIssuesView.loadIssues()
        }
      }
    }
  } else if (route === ROUTES.BOARD || route === '' || route === '/') {
    console.log('[Route] Switching to Board view')
    if (state.currentView !== 'board') {
      state.currentView = 'board'
      updateViewToggle()

      // Show board selector
      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'block'
      }

      loadIssues()
    }
  }
}

/**
 * Auto-connect with saved credentials
 */
async function autoConnect(saved) {
  try {
    const isDevelopment = window.location.hostname === 'localhost'
    const client = new JiraClient({
      domain: saved.domain,
      email: saved.email,
      apiToken: saved.token,
      useProxy: isDevelopment
    })

    const user = await client.testConnection()
    state.client = client
    state.user = user
    state.jiraDomain = saved.domain
    state.dbInitialized = false

    // Check current route BEFORE rendering to determine initial view
    const { route, params } = parseRoute()
    const hasFilterParams = params.customer || params.fixVersion || params.status || params.product || params.tag || params.projectKey
    const initialView = (route === ROUTES.ALL_ISSUES || params.allIssues === 'true' || hasFilterParams) ? 'all-issues' : 'board'
    const filters = paramsToFilters(params)

    console.log('[AutoConnect] Initial view will be:', initialView, 'route:', route, 'params:', params)

    // Render with the correct initial view and filters
    await renderConnected(user, initialView, filters)
  } catch (error) {
    console.log('[AutoConnect] Failed to auto-connect:', error.message)
    // Fall back to login screen with saved credentials pre-filled
    renderDisconnected({
      displayName: 'User',
      emailAddress: saved.email,
      avatarUrls: { '48x48': '' }
    })
  }
}

/**
 * Render disconnected state (settings panel)
 */
function renderDisconnected(savedUser = null) {
  const settingsPanel = new SettingsPanel(handleConnect, savedUser)

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
async function renderConnected(user, initialView = 'board', filters = {}) {
  // Set the initial view state before rendering
  state.currentView = initialView

  // Render different HTML based on initial view to avoid flash
  if (initialView === 'all-issues') {
    // Render All Issues view immediately
    appElement.innerHTML = `
      <div class="app-container">
        <div class="app-header">
          <div>
            <h1 class="app-title">📋 Jira Planner</h1>
            <p style="margin: 5px 0 0; font-size: 14px; color: var(--text-secondary);">
              Connected as ${user.displayName}
            </p>
          </div>
          <div class="header-actions">
            <div class="view-toggle">
              <button class="toggle-btn" id="board-view-btn">
                Kanban Board
              </button>
              <button class="toggle-btn active" id="all-issues-view-btn">
                All Issues
              </button>
            </div>
            <div id="sync-status-container"></div>
            <button class="refresh-btn" id="refresh-btn" title="Refresh issues">
              🔄 Refresh
            </button>
          </div>
        </div>
        <div id="issue-board-container"></div>
      </div>
    `

    // Add global styles
    addGlobalStyles()

    // Bind toolbar events immediately
    document.getElementById('refresh-btn')?.addEventListener('click', loadIssues)
    document.getElementById('board-view-btn')?.addEventListener('click', switchToBoardView)
    document.getElementById('all-issues-view-btn')?.addEventListener('click', switchToAllIssuesView)

    // Render All Issues view BEFORE awaiting anything
    const allIssuesView = new AllIssuesView(state.client, state.jiraDomain, switchToBoardView)
    const container = document.getElementById('issue-board-container')
    if (container) {
      container.innerHTML = allIssuesView.render()
      allIssuesView.loadIssues(filters)
    }

    // Initialize sync status in background (non-blocking)
    renderSyncStatus().catch(() => {})

    // Load board selector in background for later use
    const boardSelector = new BoardSelector(handleSelectionChange)
    boardSelector.load(state.client)
  } else {
    // Render Board view
    appElement.innerHTML = `
      <div class="app-container">
        <div class="app-header">
          <div>
            <h1 class="app-title">📋 Jira Planner</h1>
            <p style="margin: 5px 0 0; font-size: 14px; color: var(--text-secondary);">
              Connected as ${user.displayName}
            </p>
          </div>
          <div class="header-actions">
            <div class="view-toggle">
              <button class="toggle-btn active" id="board-view-btn">
                Kanban Board
              </button>
              <button class="toggle-btn" id="all-issues-view-btn">
                All Issues
              </button>
            </div>
            <div id="sync-status-container"></div>
            <button class="refresh-btn" id="refresh-btn" title="Refresh issues">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div id="board-selector-container"></div>
        <div id="issue-board-container"></div>
      </div>
    `

    // Add global styles
    addGlobalStyles()

    // Bind toolbar events
    document.getElementById('refresh-btn')?.addEventListener('click', loadIssues)
    document.getElementById('board-view-btn')?.addEventListener('click', switchToBoardView)
    document.getElementById('all-issues-view-btn')?.addEventListener('click', switchToAllIssuesView)

    // Initialize sync status in background
    renderSyncStatus().catch(() => {})

    // Initialize board selector for board view
    const boardSelector = new BoardSelector(handleSelectionChange)
    const selectorContainer = document.getElementById('board-selector-container')
    selectorContainer.innerHTML = boardSelector.render()

    // Load projects and boards
    boardSelector.load(state.client).then(() => {
      selectorContainer.innerHTML = boardSelector.render()
      boardSelector.bindEvents(state.client)

      // Restore saved selection if available
      const savedSelection = loadSelection()
      if (savedSelection && state.board) {
        const savedBoard = boardSelector.boards.find(b => b.id === savedSelection.boardId)
        if (savedBoard) {
          boardSelector.selectedBoard = savedBoard.id
          const savedSprint = boardSelector.sprints.find(s => s.id === savedSelection.sprintId)
          if (savedSprint) {
            boardSelector.selectedSprint = savedSprint.id
          }
          boardSelector.refresh(state.client)
        }
      }

      // Load initial issues
      loadIssues()

      // Auto-sync data in background
      autoSync()
    })
  }
}

/**
 * Handle connection from settings panel
 */
function handleConnect({ client, user }) {
  if (!client || !user) {
    // Disconnect was called - reload page to reset state
    window.location.reload()
    return
  }
  state.client = client
  state.user = user
  state.jiraDomain = client?.domain || null
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
  if (state.board && state.sprint && state.sprint.id !== 'all') {
    saveSelection({ boardId: state.board.id, sprintId: state.sprint.id })
  }

  // Hide/show board selector based on view
  const boardSelectorContainer = document.getElementById('board-selector-container')

  // If "All Sprints" is selected AND sprints exist, switch to all-issues view
  // If board has no sprints, stay in board view and show all issues from the board
  if (state.sprint?.id === 'all' && selection.hasSprints) {
    state.currentView = 'all-issues'
    updateViewToggle()

    // Hide board selector
    if (boardSelectorContainer) {
      boardSelectorContainer.style.display = 'none'
    }

    // Navigate to all-issues route
    navigate(ROUTES.ALL_ISSUES, { allIssues: 'true' })

    switchToAllIssuesView(state.filters)
    return
  }

  // Show board selector for specific sprint selection or boards without sprints
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'block'
  }

  // Navigate to board route
  navigate(ROUTES.BOARD)

  // If we're currently on all-issues view and a specific sprint is selected,
  // switch back to board view
  if (state.currentView === 'all-issues' && state.sprint && state.sprint.id !== 'all') {
    state.currentView = 'board'
    updateViewToggle()
  }

  // Load issues for the selected sprint (or all issues from board if no sprint)
  if (state.currentView === 'board') {
    await loadIssues()
  }
}

/**
 * Load issues from selected board/sprint
 */
async function loadIssues() {
  if (!state.board) {
    console.log('[loadIssues] No board selected')
    return
  }

  console.log('[loadIssues] Loading issues for board:', state.board, 'sprint:', state.sprint)

  // Cancel any previous in-flight request
  if (state.issuesAbortController) {
    state.issuesAbortController.abort()
  }
  state.issuesAbortController = new AbortController()

  const container = document.getElementById('issue-board-container')
  if (!container) {
    console.log('[loadIssues] Container not found')
    return
  }

  container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading issues...</p></div>'

  try {
    const issueBoard = new IssueBoard(state.client, () => loadIssues())
    await issueBoard.loadIssues(state.board, state.sprint, { signal: state.issuesAbortController.signal })

    // Skip update if request was aborted or container changed
    if (state.issuesAbortController.signal.aborted) {
      console.log('[loadIssues] Request was aborted')
      return
    }

    console.log('[loadIssues] Issues loaded successfully, columns:', issueBoard.columns.size)

    const currentContainer = document.getElementById('issue-board-container')
    if (currentContainer && currentContainer === container) {
      currentContainer.innerHTML = issueBoard.render()
      issueBoard.bindEvents()

      // Store issues globally for drag-and-drop
      window.currentIssues = Array.from(issueBoard.columns.values()).flat()
      state.currentIssues = window.currentIssues
    }
  } catch (error) {
    console.error('[loadIssues] Failed to load issues:', error)
    // Ignore abort errors (expected when canceling requests)
    if (error.name === 'AbortError') {
      return
    }

    const currentContainer = document.getElementById('issue-board-container')
    if (currentContainer && currentContainer === container) {
      currentContainer.innerHTML = `
        <div class="error-message" style="padding: 20px; text-align: center;">
          <p>Failed to load issues: ${error.message}</p>
          <button class="btn btn-primary" onclick="loadIssues()" style="margin-top: 10px;">
            Try Again
          </button>
        </div>
      `
    }
  }
}

// Make loadIssues available globally for the retry button
window.loadIssues = loadIssues

// Initialize app
init()

/**
 * Add global styles for new components
 */
function addGlobalStyles() {
  const styleId = 'global-component-styles'
  if (document.getElementById(styleId)) return

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    ${SyncStatusStyles}
    ${FilterPanelStyles}
    ${TableViewStyles}
    ${SavedViewsMenuStyles}
    ${TagsManagerStyles}
    ${AllIssuesViewStyles || ''}

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .view-toggle {
      display: flex;
      background: var(--surface);
      border-radius: 8px;
      padding: 4px;
      box-shadow: var(--shadow);
    }

    .toggle-btn {
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .toggle-btn:hover {
      background: var(--hover);
      color: var(--text);
    }

    .toggle-btn.active {
      background: var(--accent);
      color: white;
    }

    .app-header {
      flex-wrap: wrap;
      gap: 16px;
    }

    .loading-board {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      gap: 16px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* All Sprints option highlighting */
    .all-sprints-option {
      font-weight: 600;
      background: #f0f7ff;
      color: #0066cc;
      border-bottom: 1px solid #ddd;
    }

    select.all-sprints-selected {
      border-color: #0066cc;
      box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
    }

    .all-sprints-option::before {
      content: '📊 ';
    }
  `
  document.head.appendChild(style)
}

/**
 * Render sync status component
 */
async function renderSyncStatus() {
  const container = document.getElementById('sync-status-container')
  if (!container) return

  const syncStatus = new SyncStatus(handleSyncRequest)
  container.innerHTML = syncStatus.render()
  syncStatus.bindEvents()

  // Load initial sync status
  try {
    const status = await getSyncStatus()
    syncStatus.setStatus(status)
  } catch (e) {
    // Database not initialized yet
    console.log('[Sync] Initial status not available')
  }
}

/**
 * Auto-sync data in background on page load
 */
async function autoSync() {
  if (!state.client || state.isSyncing) return

  try {
    // Initialize database if needed
    if (!state.dbInitialized) {
      await initDatabase()
      state.dbInitialized = true
    }

    // Perform incremental sync to refresh data
    await syncIncremental(state.client)

    const status = await getSyncStatus()
    updateSyncStatusUI(false, status)

    console.log('[AutoSync] Background sync completed')
  } catch (error) {
    console.log('[AutoSync] Background sync failed:', error.message)
  }
}

/**
 * Handle sync request from user
 */
async function handleSyncRequest() {
  if (state.isSyncing) return

  state.isSyncing = true
  updateSyncStatusUI(true)

  try {
    // Initialize database if needed
    if (!state.dbInitialized) {
      try {
        await initDatabase()
        state.dbInitialized = true
      } catch (dbError) {
        console.error('[DB] Initialization failed:', dbError)
        throw new Error(`Database initialization failed: ${dbError.message}. Please try again or clear browser data.`)
      }
    }

    // Perform sync
    if (state.client) {
      await syncAll(state.client)
      invalidateFilterCache() // Invalidate cache after sync
      const status = getSyncStatus()
      updateSyncStatusUI(false, status)

      // Reload issues if on all-issues view
      if (state.currentView === 'all-issues' && window.currentAllIssuesView) {
        window.currentAllIssuesView.loadIssues()
      }
    }
  } catch (error) {
    console.error('[Sync] Failed:', error)
    alert(`Sync failed: ${error.message}`)
    updateSyncStatusUI(false)
  }
}

/**
 * Update sync status UI
 */
function updateSyncStatusUI(syncing, status = null) {
  const container = document.getElementById('sync-status-container')
  if (!container) return

  const syncStatus = new SyncStatus(handleSyncRequest)
  syncStatus.setSyncing(syncing)
  if (status) syncStatus.setStatus(status)
  container.innerHTML = syncStatus.render()
  syncStatus.bindEvents()
}

/**
 * Switch to board view
 */
function switchToBoardView() {
  state.currentView = 'board'
  updateViewToggle()

  // Navigate to board route
  navigate(ROUTES.BOARD)

  // Show board selector
  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'block'
  }

  // Clear container before loading
  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading board view...</p></div>'
  }

  // If no board is selected, show a message to select one
  if (!state.board) {
    if (container) {
      container.innerHTML = `
        <div class="error-message" style="padding: 20px; text-align: center;">
          <p>Please select a board from the dropdown above</p>
        </div>
      `
    }
    return
  }

  loadIssues()
}

/**
 * Switch to all issues view
 */
async function switchToAllIssuesView(filters = {}) {
  state.currentView = 'all-issues'
  updateViewToggle()

  // Navigate to all-issues route with filters
  const params = filtersToParams(filters)
  params.allIssues = 'true'
  navigate(ROUTES.ALL_ISSUES, params)

  // Hide board selector
  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  // Initialize database if needed
  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      console.error('[DB] Failed to initialize:', error)
      alert(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  // Clear and render all issues view
  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading all issues...</p></div>'
  }

  const allIssuesView = new AllIssuesView(state.client, state.jiraDomain, switchToBoardView)
  container.innerHTML = allIssuesView.render()
  allIssuesView.loadIssues(filters)
}

/**
 * Update view toggle buttons
 */
function updateViewToggle() {
  const boardBtn = document.getElementById('board-view-btn')
  const allIssuesBtn = document.getElementById('all-issues-view-btn')

  if (boardBtn) boardBtn.classList.toggle('active', state.currentView === 'board')
  if (allIssuesBtn) allIssuesBtn.classList.toggle('active', state.currentView === 'all-issues')
}
