import './style.css'
import logger from './utils/logger.js';
import { escapeHtml } from './utils/html.js';
import { showError } from './utils/dom.js';
import { SettingsPanel } from './components/SettingsPanel.js'
import { BoardSelector } from './components/BoardSelector.js'
import { IssueBoard } from './components/IssueBoard.js'
import { AllIssuesView, AllIssuesViewStyles } from './components/AllIssuesView.js'
import { RoadmapView, RoadmapViewStyles } from './components/RoadmapView.js'
import { SprintVelocityView, SprintVelocityViewStyles } from './components/SprintVelocityView.js'
import { TeamWorkloadView, TeamWorkloadViewStyles } from './components/TeamWorkloadView.js'
import { IssueAgingView, IssueAgingViewStyles } from './components/IssueAgingView.js'
import { ReleaseProgressView, ReleaseProgressViewStyles } from './components/ReleaseProgressView.js'
import { QuickSearchPalette, QuickSearchPaletteStyles } from './components/QuickSearchPalette.js'
import { IssueDetailDrawerStyles } from './components/IssueDetailDrawer.js'
import { DashboardHomeView, DashboardHomeViewStyles } from './components/DashboardHomeView.js'
import { DependencyGraphView, DependencyGraphViewStyles } from './components/DependencyGraphView.js'
import { SyncStatus, SyncStatusStyles } from './components/SyncStatus.js'
import { ChangelogDrawerStyles } from './components/ChangelogDrawer.js'
import { FilterPanelStyles } from './components/FilterPanel.js'
import { TableViewStyles } from './components/TableView.js'
import { SavedViewsMenuStyles } from './components/SavedViewsMenu.js'
import { TagsManagerStyles } from './components/TagsManager.js'
import { sharedStyles } from './utils/styles.js'
import { saveSelection, loadSelection, loadCredentials } from './utils/storage.js'
import { initDatabase } from './db/indexeddb.js'
import { syncAll, syncIncremental, getSyncStatus } from './db/sync.js'
import { invalidateFilterCache } from './db/queries.js'
import { JiraClient } from './api/jira.js'
import { navigate, onRouteChange, updateQueryParams, filtersToParams, paramsToFilters, ROUTES, parseRoute } from './utils/router.js'
import { registerServiceWorker } from './utils/sw-register.js'

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
  filters: {}, // Store current filters
  currentViewInstance: null, // Track active view instance for cleanup
  boardSelector: null // Shared BoardSelector instance
}

// Shared SyncStatus instance — created once, reused
let syncStatusComponent = null

function filtersEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const va = a[k], vb = b[k];
    if (Array.isArray(va)) {
      if (!Array.isArray(vb) || va.length !== vb.length || va.some((v, i) => v !== vb[i])) return false;
    } else if (va !== vb) return false;
  }
  return true;
}

// Runtime logger config from URL params (?log=debug)
const urlParams = new URLSearchParams(window.location.search)
const logLevel = urlParams.get('log')
if (logLevel) logger.setLevel(logLevel)

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
  const saved = await loadCredentials()
  if (saved?.domain && saved?.email && saved?.token) {
    await autoConnect(saved)
  } else {
    renderDisconnected()
  }

  // Set up route listener to handle navigation after user is connected
  // Initial route is handled by autoConnect() which parses route before rendering
  onRouteChange(handleRouteChange)

  // Register service worker for offline support
  registerServiceWorker()

  // Set up online/offline detection for the offline banner
  setupOfflineIndicator()

  // Global Cmd+K / Ctrl+K quick search shortcut
  let quickSearchPalette = null
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.target.closest('input, textarea, select')) {
      e.preventDefault()
      if (!quickSearchPalette) {
        quickSearchPalette = new QuickSearchPalette(state.jiraDomain || '')
      }
      quickSearchPalette.open()
    }
  })
}

function renderDependencyGraph(params) {
  const issueKey = params.issueKey;
  const summary = params.summary ? decodeURIComponent(params.summary) : issueKey;

  const graphView = new DependencyGraphView(issueKey, summary, (key, nodeSummary) => {
    window.navigate('deps', { issueKey: key, summary: encodeURIComponent(nodeSummary || key) });
  });
  state.currentViewInstance = graphView;
  state._depIssueKey = issueKey;

  const container = document.getElementById('issue-board-container');
  if (container) {
    container.innerHTML = `<div id="dep-graph-container"></div>`;
    graphView.init().catch(err => logger.error('[Deps] init failed:', err));
  }
}

/**
 * Handle route changes
 */
function handleRouteChange({ route, params }) {
  // Skip if client not ready yet
  if (!state.client) {
    logger.info('[Route] Skipping - client not ready')
    return
  }

  const filters = paramsToFilters(params)
  state.filters = filters

  logger.info('[Route] Handling route:', route, 'params:', params, 'currentView:', state.currentView)

  if (route === ROUTES.ROADMAP || params.roadmap === 'true') {
    logger.info('[Route] Switching to Roadmap view')
    if (state.currentView !== 'roadmap') {
      state.currentView = 'roadmap'
      updateViewToggle()

      // Hide board selector
      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      // Clean up previous view
      cleanupCurrentView()

      state.currentViewInstance = new RoadmapView(state.client, state.jiraDomain, switchToBoardView)
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = state.currentViewInstance.render()
        state.currentViewInstance.loadRoadmap(filters).catch(err => logger.error('[Roadmap] loadRoadmap failed:', err))
      }
    } else {
      // Already in roadmap view, apply filters if they changed
      if (state.currentViewInstance && filters) {
        const filtersChanged = !filtersEqual(state.currentViewInstance.filters, filters)
        if (filtersChanged) {
          state.currentViewInstance.filters = filters
          state.currentViewInstance.loadRoadmap().catch(err => logger.error('[Roadmap] loadRoadmap failed:', err))
        }
      }
    }
  } else if (route === ROUTES.ALL_ISSUES || params.allIssues === 'true' || params.customer || params.fixVersion || params.status || params.product || params.tag || params.projectKey) {
    logger.info('[Route] Switching to All Issues view')
    if (state.currentView !== 'all-issues') {
      state.currentView = 'all-issues'
      updateViewToggle()

      // Hide board selector
      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      // Clean up previous view
      cleanupCurrentView()

      state.currentViewInstance = new AllIssuesView(state.client, state.jiraDomain, switchToBoardView)
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = state.currentViewInstance.render()
        state.currentViewInstance.loadIssues(filters).catch(err => logger.error('[AllIssues] loadIssues failed:', err))
      }
    } else {
      // Already in all-issues view, apply filters if they changed
      const container = document.getElementById('all-issues-view')
      if (container && state.currentViewInstance) {
        const filtersChanged = !filtersEqual(state.currentViewInstance.filters, filters)
        if (filtersChanged) {
          // Use the debounced loadIssues for smooth filtering
          state.currentViewInstance.filters = filters
          state.currentViewInstance.loadIssues().catch(err => logger.error('[AllIssues] loadIssues failed:', err))
        }
      }
    }
  } else if (route === ROUTES.BOARD || route === '' || route === '/') {
    logger.info('[Route] Switching to Board view')
    if (state.currentView !== 'board') {
      state.currentView = 'board'
      updateViewToggle()

      // Clean up previous view
      cleanupCurrentView()

      // Show board selector and ensure it's rendered
      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'block'
        if (state.boardSelector && !boardSelectorContainer.querySelector('.board-selector')) {
          boardSelectorContainer.innerHTML = state.boardSelector.render()
          state.boardSelector.bindEvents(state.client)
        }
      }

      loadIssues().catch(err => logger.error('[Board] loadIssues failed:', err))
    }
  } else if (route === ROUTES.VELOCITY) {
    logger.info('[Route] Switching to Sprint Velocity view')
    if (state.currentView !== 'velocity') {
      state.currentView = 'velocity'
      updateViewToggle()

      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      cleanupCurrentView()

      const velocityView = new SprintVelocityView()
      state.currentViewInstance = velocityView
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = velocityView.render()
        velocityView.load().catch(err => logger.error('[Velocity] load failed:', err))
      }
    }
  } else if (route === ROUTES.WORKLOAD) {
    logger.info('[Route] Switching to Team Workload view')
    if (state.currentView !== 'workload') {
      state.currentView = 'workload'
      updateViewToggle()

      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      cleanupCurrentView()

      const workloadView = new TeamWorkloadView(state.client, state.jiraDomain, switchToBoardView)
      state.currentViewInstance = workloadView
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = workloadView.render()
        workloadView.load(filters.boardId, filters.sprintId).catch(err => logger.error('[Workload] load failed:', err))
      }
    }
  } else if (route === ROUTES.RELEASES) {
    logger.info('[Route] Switching to Release Progress view')
    if (state.currentView !== 'releases') {
      state.currentView = 'releases'
      updateViewToggle()

      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      cleanupCurrentView()

      const releasesView = new ReleaseProgressView(state.client, state.jiraDomain, switchToBoardView)
      state.currentViewInstance = releasesView
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = releasesView.render()
        releasesView.load(filters.projectKey).catch(err => logger.error('[Releases] load failed:', err))
      }
    } else if (state.currentViewInstance && filters) {
      const view = state.currentViewInstance
      if (filters.projectKey !== undefined && view.projectKey !== filters.projectKey) {
        view.load(filters.projectKey).catch(err => logger.error('[Releases] load failed:', err))
      }
    }
  } else if (route === 'deps') {
    logger.info('[Route] Switching to Dependency Graph view')
    if (state.currentView !== 'deps') {
      state.currentView = 'deps'
      updateViewToggle()

      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      cleanupCurrentView()
      renderDependencyGraph(params)
    } else if (params.issueKey !== state._depIssueKey) {
      cleanupCurrentView()
      renderDependencyGraph(params)
    }
  } else if (route === ROUTES.DASHBOARD) {
    logger.info('[Route] Switching to Dashboard view')
    if (state.currentView !== 'dashboard') {
      state.currentView = 'dashboard'
      updateViewToggle()

      const boardSelectorContainer = document.getElementById('board-selector-container')
      if (boardSelectorContainer) {
        boardSelectorContainer.style.display = 'none'
      }

      cleanupCurrentView()

      const dashboardView = new DashboardHomeView(state.client, state.jiraDomain, switchToBoardView)
      state.currentViewInstance = dashboardView
      const container = document.getElementById('issue-board-container')
      if (container) {
        container.innerHTML = dashboardView.render()
        dashboardView.load().catch(err => logger.error('[Dashboard] load failed:', err))
      }
    }
  }
}

/**
 * Clean up the current view instance when switching views
 */
function cleanupCurrentView() {
  if (state.currentViewInstance) {
    if (typeof state.currentViewInstance.destroy === 'function') {
      state.currentViewInstance.destroy()
    }
    state.currentViewInstance = null
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
    window.jiraDomain = saved.domain
    state.dbInitialized = false

    // Check current route BEFORE rendering to determine initial view
    const { route, params } = parseRoute()
    const hasFilterParams = params.customer || params.fixVersion || params.status || params.product || params.tag || params.projectKey
    const initialView = (route === ROUTES.ROADMAP || params.roadmap === 'true') ? 'roadmap'
      : (route === ROUTES.ALL_ISSUES || params.allIssues === 'true' || hasFilterParams) ? 'all-issues'
      : 'board'
    const filters = paramsToFilters(params)

    logger.info('[AutoConnect] Initial view will be:', initialView, 'route:', route, 'params:', params)

    await renderConnected(user, initialView, filters)
  } catch (error) {
    logger.error('[AutoConnect] Failed to auto-connect:', error.message)
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
async function renderDisconnected(savedUser = null) {
  const settingsPanel = new SettingsPanel(handleConnect, savedUser)
  await settingsPanel.loadSavedCredentials()

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
  state.currentView = initialView

  // Single unified layout: sidebar + main content
  appElement.innerHTML = `
    <div class="app-container">
      <div class="app-sidebar" id="app-sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-icon">📋</span>
          <span class="sidebar-brand-text">Jira Planner</span>
        </div>
        <div class="sidebar-nav" id="sidebar-nav">
          <div class="nav-section">
            <div class="nav-section-title">Views</div>
            <button class="nav-item" data-view="board" id="nav-board">
              <span class="nav-item-icon">📋</span>
              <span class="nav-item-label">Board</span>
            </button>
            <button class="nav-item" data-view="all-issues" id="nav-all-issues">
              <span class="nav-item-icon">📄</span>
              <span class="nav-item-label">All Issues</span>
            </button>
            <button class="nav-item" data-view="roadmap" id="nav-roadmap">
              <span class="nav-item-icon">🗺️</span>
              <span class="nav-item-label">Roadmap</span>
            </button>
          </div>
          <div class="nav-section">
            <div class="nav-section-title">Analytics</div>
            <button class="nav-item" data-view="dashboard" id="nav-dashboard">
              <span class="nav-item-icon">📊</span>
              <span class="nav-item-label">Dashboard</span>
            </button>
            <button class="nav-item" data-view="velocity" id="nav-velocity">
              <span class="nav-item-icon">⚡</span>
              <span class="nav-item-label">Velocity</span>
            </button>
            <button class="nav-item" data-view="workload" id="nav-workload">
              <span class="nav-item-icon">👥</span>
              <span class="nav-item-label">Team</span>
            </button>
            <button class="nav-item" data-view="aging" id="nav-aging">
              <span class="nav-item-icon">⏳</span>
              <span class="nav-item-label">Aging</span>
            </button>
            <button class="nav-item" data-view="releases" id="nav-releases">
              <span class="nav-item-icon">🚀</span>
              <span class="nav-item-label">Releases</span>
            </button>
          </div>
        </div>
        <div class="sidebar-footer">
          <button class="sidebar-collapse-btn" id="sidebar-collapse-btn">
            <span>◀</span>
            <span class="nav-item-label">Collapse</span>
          </button>
        </div>
      </div>
      <div class="app-main">
        <div class="top-bar">
          <div class="top-bar-left">
            <span class="user-greeting">
              Connected as <strong>${escapeHtml(user.displayName)}</strong>
            </span>
          </div>
          <div class="top-bar-right">
            <div id="sync-status-container"></div>
            <button class="refresh-btn" id="refresh-btn" title="Refresh issues">
              🔄 Refresh
            </button>
          </div>
        </div>
        <div class="app-content" id="app-content">
          <div id="board-selector-container"></div>
          <div id="issue-board-container"></div>
        </div>
      </div>
    </div>
  `

  // Add global styles
  addGlobalStyles()

  // Set the active nav item
  highlightNavItem(initialView)

  // Bind sidebar collapse button
  let collapsed = false
  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
    collapsed = !collapsed
    const sidebar = document.getElementById('app-sidebar')
    const btn = document.getElementById('sidebar-collapse-btn')
    sidebar?.classList.toggle('collapsed', collapsed)
    if (btn) {
      btn.innerHTML = collapsed
        ? '<span>▶</span>'
        : '<span>◀</span><span class="nav-item-label">Collapse</span>'
    }
  })

  // Bind navigation through a single listener on the nav container
  const sidebarNav = document.getElementById('sidebar-nav')
  sidebarNav?.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item')
    if (!navItem) return
    const view = navItem.dataset.view
    const viewSwitchMap = {
      board: switchToBoardView,
      'all-issues': switchToAllIssuesView,
      roadmap: () => switchToRoadmapView(),
      velocity: () => switchToSprintVelocityView(),
      workload: () => switchToWorkloadView(),
      aging: () => switchToAgingView(),
      releases: () => switchToReleasesView(),
      dashboard: () => switchToDashboardView()
    }
    const handler = viewSwitchMap[view]
    if (handler) handler()
  })

  // Bind refresh
  document.getElementById('refresh-btn')?.addEventListener('click', loadIssues)

  // Initialize sync status in background
  renderSyncStatus().catch(() => {})

  // Initialize board selector (always, but only visible on board view)
  const boardSelector = new BoardSelector(handleSelectionChange)
  state.boardSelector = boardSelector
  const selectorContainer = document.getElementById('board-selector-container')

  // Hide selector container if initial view is not board
  if (initialView !== 'board' && selectorContainer) {
    selectorContainer.style.display = 'none'
  }

  // Always render the initial (loading) HTML so the container isn't empty
  if (selectorContainer) {
    selectorContainer.innerHTML = boardSelector.render()
  }

  boardSelector.load(state.client).then(() => {
    if (selectorContainer) {
      selectorContainer.innerHTML = boardSelector.render()
      boardSelector.bindEvents(state.client)
    }
    const savedSelection = loadSelection()
    if (savedSelection && state.board) {
      const savedBoard = boardSelector.boards.find(b => b.id === savedSelection.boardId)
      if (savedBoard) {
        boardSelector.selectedBoard = savedBoard.id
        const savedSprint = boardSelector.sprints.find(s => s.id === savedSelection.sprintId)
        if (savedSprint) boardSelector.selectedSprint = savedSprint.id
        boardSelector.refresh(state.client)
      }
    }
    if (initialView === 'board') {
      loadIssues().catch(err => logger.error('[Board] loadIssues failed:', err))
    }
    autoSync()
  }).catch(err => logger.error('[BoardSelector] load failed:', err))

  // Render initial view content
  if (initialView === 'all-issues') {
    const allIssuesView = new AllIssuesView(state.client, state.jiraDomain, switchToBoardView)
    const container = document.getElementById('issue-board-container')
    if (container) {
      container.innerHTML = allIssuesView.render()
      allIssuesView.loadIssues(filters).catch(err => logger.error('[AllIssues] loadIssues failed:', err))
    }
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
  window.jiraDomain = state.jiraDomain
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
    logger.info('[loadIssues] No board selected')
    return
  }

  logger.info('[loadIssues] Loading issues for board:', state.board, 'sprint:', state.sprint)

  // Cancel any previous in-flight request
  if (state.issuesAbortController) {
    state.issuesAbortController.abort()
  }
  state.issuesAbortController = new AbortController()

  const container = document.getElementById('issue-board-container')
  if (!container) {
    logger.info('[loadIssues] Container not found')
    return
  }

  container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading issues...</p></div>'

  try {
    const issueBoard = new IssueBoard(state.client, () => loadIssues())
    await issueBoard.loadIssues(state.board, state.sprint, { signal: state.issuesAbortController.signal })

    if (state.issuesAbortController.signal.aborted) {
      logger.info('[loadIssues] Request was aborted')
      return
    }

    logger.info('[loadIssues] Issues loaded successfully, columns:', issueBoard.columns.size)

    const currentContainer = document.getElementById('issue-board-container')
    if (currentContainer && currentContainer === container) {
      currentContainer.innerHTML = issueBoard.render()
      issueBoard.bindEvents()

      // Store issues globally for drag-and-drop
      window.currentIssues = Array.from(issueBoard.columns.values()).flat()
      state.currentIssues = window.currentIssues
    }
  } catch (error) {
    logger.error('[loadIssues] Failed to load issues:', error)
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

/**
 * Offline indicator banner
 */
function setupOfflineIndicator() {
  let banner = document.getElementById('offline-banner');

  function show(message) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      document.body.appendChild(banner);
    }
    banner.className = 'offline-banner visible';
    banner.textContent = message;
  }

  function hide() {
    if (banner) {
      banner.className = 'offline-banner';
    }
  }

  window.addEventListener('offline', () => {
    show('⚠️ You are offline. App data may be stale.');
  });

  window.addEventListener('online', () => {
    hide();
  });

  // Initial check
  if (!navigator.onLine) {
    show('⚠️ You are offline. App data may be stale.');
  }
}

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
    ${sharedStyles}
    ${SyncStatusStyles}
    ${ChangelogDrawerStyles || ''}
    ${FilterPanelStyles}
    ${TableViewStyles}
    ${SavedViewsMenuStyles}
    ${TagsManagerStyles}
    ${RoadmapViewStyles || ''}
    ${SprintVelocityViewStyles || ''}
    ${TeamWorkloadViewStyles || ''}
    ${IssueAgingViewStyles || ''}
    ${ReleaseProgressViewStyles || ''}
    ${QuickSearchPaletteStyles || ''}
    ${IssueDetailDrawerStyles || ''}
    ${AllIssuesViewStyles || ''}
    ${DashboardHomeViewStyles || ''}
    ${DependencyGraphViewStyles || ''}

    /* Offline indicator */
    .offline-banner {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #f59e0b;
      color: #1a1a2e;
      text-align: center;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .offline-banner.visible { display: flex; }
    .offline-banner button {
      background: #1a1a2e;
      color: #f59e0b;
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }

    .refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.12s ease;
    }

    .refresh-btn:hover {
      background: var(--hover);
      border-color: var(--primary-border);
    }

    .board-selector {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: var(--space-md) var(--space-lg);
      margin-bottom: var(--space-lg);
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
      border-top-color: var(--primary);
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

  if (!syncStatusComponent) {
    syncStatusComponent = new SyncStatus(handleSyncRequest, state.jiraDomain || '')
  }
  container.innerHTML = syncStatusComponent.render()
  syncStatusComponent.bindEvents()

  // Load initial sync status
  try {
    const status = await getSyncStatus()
    syncStatusComponent.setStatus(status)
  } catch (e) {
    // Database not initialized yet
    logger.info('[Sync] Initial status not available')
  }
}

async function autoSync() {
  if (!state.client || state.isSyncing) return

  try {
    if (!state.dbInitialized) {
      await initDatabase()
      state.dbInitialized = true
    }

    const syncResult = await syncIncremental(state.client)
    const status = await getSyncStatus()
    status.changeCount = syncResult.changeCount || 0
    updateSyncStatusUI(false, status)

    if (syncResult.warnings && syncResult.warnings.length > 0) {
      logger.warn('[AutoSync] Completed with warnings:', syncResult.warnings);
    }

    logger.info('[AutoSync] Background sync completed')
  } catch (error) {
    logger.error('[AutoSync] Background sync failed:', error.message)
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
        logger.error('[DB] Initialization failed:', dbError)
        throw new Error(`Database initialization failed: ${dbError.message}. Please try again or clear browser data.`)
      }
    }

    // Perform sync
    if (state.client) {
      const syncResult = await syncAll(state.client)
      invalidateFilterCache()
      const status = await getSyncStatus()
      status.changeCount = syncResult.changeCount || 0
      updateSyncStatusUI(false, status)

      if (syncResult.warnings && syncResult.warnings.length > 0) {
        showError(`Sync completed with ${syncResult.warnings.length} warning(s): ${syncResult.warnings[0]}`)
      }

      // Reload issues if on all-issues view
      if (state.currentView === 'all-issues' && window.currentAllIssuesView) {
        window.currentAllIssuesView.loadIssues().catch(err => logger.error('[Sync] reload issues failed:', err))
      }
    }
  } catch (error) {
    logger.error('[Sync] Failed:', error)
    showError(`Sync failed: ${error.message}`)
    updateSyncStatusUI(false)
  }
}

/**
 * Update sync status UI
 */
function updateSyncStatusUI(syncing, status = null) {
  const container = document.getElementById('sync-status-container')
  if (!container) return

  if (!syncStatusComponent) {
    syncStatusComponent = new SyncStatus(handleSyncRequest, state.jiraDomain || '')
  }
  syncStatusComponent.setSyncing(syncing)
  if (status) syncStatusComponent.setStatus(status)
  container.innerHTML = syncStatusComponent.render()
  syncStatusComponent.bindEvents()
}

/**
 * Switch to board view
 */
function switchToBoardView() {
  state.currentView = 'board'
  updateViewToggle()

  // Navigate to board route
  navigate(ROUTES.BOARD)

  // Show board selector and ensure it's rendered
  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'block'
    if (state.boardSelector && !boardSelectorContainer.querySelector('.board-selector')) {
      boardSelectorContainer.innerHTML = state.boardSelector.render()
      state.boardSelector.bindEvents(state.client)
    }
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

  loadIssues().catch(err => logger.error('[Board] loadIssues failed:', err))
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
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
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
  allIssuesView.loadIssues(filters).catch(err => logger.error('[AllIssues] loadIssues failed:', err))
}

/**
 * Switch to roadmap view
 */
async function switchToRoadmapView(filters = {}) {
  state.currentView = 'roadmap'
  updateViewToggle()

  // Navigate to roadmap route with filters
  const params = filtersToParams(filters)
  params.roadmap = 'true'
  navigate(ROUTES.ROADMAP, params)

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
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  // Clear and render roadmap view
  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading roadmap...</p></div>'
  }

  const roadmapView = new RoadmapView(state.client, state.jiraDomain, switchToBoardView)
  container.innerHTML = roadmapView.render()
  roadmapView.loadRoadmap(filters).catch(err => logger.error('[Roadmap] loadRoadmap failed:', err))
}

async function switchToSprintVelocityView(filters = {}) {
  cleanupCurrentView()
  state.currentView = 'velocity'
  updateViewToggle()

  navigate(ROUTES.VELOCITY)

  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading velocity data...</p></div>'
  }

  const velocityView = new SprintVelocityView()
  state.currentViewInstance = velocityView
  container.innerHTML = velocityView.render()
  await velocityView.load()
}

async function switchToWorkloadView(filters = {}) {
  cleanupCurrentView()
  state.currentView = 'workload'
  updateViewToggle()

  navigate(ROUTES.WORKLOAD)

  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading team workload...</p></div>'
  }

  const workloadView = new TeamWorkloadView(state.client, state.jiraDomain, switchToBoardView)
  state.currentViewInstance = workloadView
  container.innerHTML = workloadView.render()
  await workloadView.load(filters.boardId, filters.sprintId)
}

/**
 * Switch to Issue Aging view
 */
async function switchToAgingView(filters = {}) {
  cleanupCurrentView()
  state.currentView = 'aging'
  updateViewToggle()

  navigate(ROUTES.AGING)

  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading issue aging report...</p></div>'
  }

  const agingView = new IssueAgingView(state.client, state.jiraDomain, switchToBoardView)
  state.currentViewInstance = agingView
  container.innerHTML = agingView.render()
  await agingView.load(filters.boardId, filters.sprintId)
}

async function switchToReleasesView(filters = {}) {
  cleanupCurrentView()
  state.currentView = 'releases'
  updateViewToggle()

  navigate(ROUTES.RELEASES)

  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading release progress...</p></div>'
  }

  const releasesView = new ReleaseProgressView(state.client, state.jiraDomain, switchToBoardView)
  state.currentViewInstance = releasesView
  container.innerHTML = releasesView.render()
  await releasesView.load(filters.projectKey || null)
}

/**
 * Switch to Dashboard view
 */
async function switchToDashboardView() {
  cleanupCurrentView()
  state.currentView = 'dashboard'
  updateViewToggle()

  navigate(ROUTES.DASHBOARD)

  const boardSelectorContainer = document.getElementById('board-selector-container')
  if (boardSelectorContainer) {
    boardSelectorContainer.style.display = 'none'
  }

  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      showError(`Failed to initialize database: ${error.message}. Please try again.`)
      switchToBoardView()
      return
    }
  }

  const container = document.getElementById('issue-board-container')
  if (container) {
    container.innerHTML = '<div class="loading-board"><div class="spinner"></div><p>Loading dashboard...</p></div>'
  }

  const dashboardView = new DashboardHomeView(state.client, state.jiraDomain, switchToBoardView)
  state.currentViewInstance = dashboardView
  container.innerHTML = dashboardView.render()
  dashboardView.load().catch(err => logger.error('[Dashboard] load failed:', err))
}

/**
 * Update view toggle buttons
 */
function highlightNavItem(view) {
  const sidebarNav = document.getElementById('sidebar-nav')
  if (!sidebarNav) return
  sidebarNav.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view)
  })
}

function updateViewToggle() {
  highlightNavItem(state.currentView)
}
