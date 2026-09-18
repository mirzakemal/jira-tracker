import './style.css'
import logger from './utils/logger.js';
import { escapeHtml } from './utils/html.js';
import { showError } from './utils/dom.js';
import { SettingsPanel } from './components/SettingsPanel.js'
import { QuickSearchPalette, QuickSearchPaletteStyles } from './components/QuickSearchPalette.js'
import { IssueDetailDrawerStyles } from './components/IssueDetailDrawer.js'
import { SyncStatus, SyncStatusStyles } from './components/SyncStatus.js'
import { ChangelogDrawerStyles } from './components/ChangelogDrawer.js'
import { StandupView, StandupViewStyles } from './components/StandupView.js'
import { ProductBoardView, ProductBoardViewStyles } from './components/ProductBoardView.js'
import { CustomerDashboardView, CustomerDashboardViewStyles } from './components/CustomerDashboardView.js'
import { ProductRadarView, ProductRadarViewStyles } from './components/ProductRadarView.js'
import { BugPatternsView, BugPatternsViewStyles } from './components/BugPatternsView.js'
import { TraceabilityView, TraceabilityViewStyles } from './components/TraceabilityView.js'
import { initKeyboardShortcuts, KeyboardShortcutsStyles } from './components/KeyboardShortcuts.js'
import { sharedStyles } from './utils/styles.js'
import { NAV_ICONS } from './utils/nav-icons.js'
import { loadCredentials } from './utils/storage.js'
import { initDatabase } from './db/indexeddb.js'
import { syncAll, syncIncremental, getSyncStatus } from './db/sync.js'
import { JiraClient } from './api/jira.js'
import { navigate, onRouteChange, updateQueryParams, ROUTES, parseRoute } from './utils/router.js'
import { resolveInitialView, ROUTE_FOR_VIEW, productFiltersFromParams, customerFiltersFromParams } from './utils/initial-view.js'
import { registerServiceWorker } from './utils/sw-register.js'
import { shouldUseProxy } from './utils/proxy.js'
import { usesServerAuth, configuredDomain, serverAuthProblem } from './utils/auth-mode.js'

// App state
const state = {
  client: null,
  user: null,
  jiraDomain: null,
  dbInitialized: false,
  isSyncing: false,
  currentView: null,          // key into VIEWS
  currentViewInstance: null   // the mounted view, for cleanup and refresh
}

// Shared SyncStatus instance — created once, reused
let syncStatusComponent = null

/**
 * Every view the tab bar offers, in tab order — Standup deliberately last,
 * after the three PM lenses.
 *
 * One table instead of a switchTo… function per view: adding a view is one
 * entry here plus a route constant. `load` receives the parsed URL params so
 * each view can read its own filter vocabulary; `reloadOnParams` says whether
 * a hash change while the view is already mounted should re-run load().
 */
const VIEWS = {
  product: {
    route: ROUTES.PRODUCT,
    title: 'Product Board',
    icon: 'product',
    create: () => new ProductBoardView(state.client, state.jiraDomain),
    load: (view, params) => view.load(productFiltersFromParams(params)),
    reloadOnParams: true
  },
  customers: {
    route: ROUTES.CUSTOMERS,
    title: 'Customer Card Dashboard',
    icon: 'customers',
    create: () => new CustomerDashboardView(state.client, state.jiraDomain),
    load: (view, params) => view.load(customerFiltersFromParams(params)),
    reloadOnParams: true
  },
  radar: {
    route: ROUTES.RADAR,
    title: 'Product Radar',
    icon: 'radar',
    create: () => new ProductRadarView(state.client, state.jiraDomain),
    load: (view, params) => view.load(params),
    reloadOnParams: true
  },
  bugs: {
    route: ROUTES.BUGS,
    title: 'Bug Patterns',
    icon: 'bugs',
    create: () => new BugPatternsView(state.client, state.jiraDomain),
    load: (view, params) => view.load(params),
    reloadOnParams: true
  },
  trace: {
    route: ROUTES.TRACE,
    title: 'Traceability',
    icon: 'trace',
    create: () => new TraceabilityView(state.client, state.jiraDomain),
    load: (view, params) => view.load(params),
    reloadOnParams: true
  },
  standup: {
    route: ROUTES.STANDUP,
    title: 'Standup',
    icon: 'standup',
    create: () => new StandupView(state.client, state.jiraDomain),
    load: (view) => view.load(),
    reloadOnParams: false
  }
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

  // Apply saved theme
  const theme = localStorage.getItem('jira-planner-theme')
  if (theme) document.documentElement.setAttribute('data-theme', theme)

  // Under server auth the proxy holds the credential, so there is nothing to
  // load and nothing to ask for — connect straight through.
  if (usesServerAuth()) {
    const problem = serverAuthProblem()
    if (problem) {
      logger.error('[Auth]', problem)
      showError(problem)
      renderDisconnected()
    } else {
      await autoConnect({ domain: configuredDomain(), serverAuth: true })
    }
  } else {
    const saved = await loadCredentials()
    if (saved?.domain && saved?.email && saved?.token) {
      await autoConnect(saved)
    } else {
      renderDisconnected()
    }
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

/**
 * Handle route changes
 */
function handleRouteChange({ route, params }) {
  // Skip if client not ready yet
  if (!state.client) {
    logger.info('[Route] Skipping - client not ready')
    return
  }

  const name = resolveInitialView(route)
  const def = VIEWS[name]

  // A bookmark to a view that no longer exists (#roadmap, #board, ...) resolves
  // to the Product Board. Rewrite the hash so the URL says where we are; the
  // resulting hashchange comes back through here with a real route.
  if (route !== def.route) {
    logger.info('[Route] Unknown route, redirecting to', def.route, 'from', route)
    navigate(def.route)
    return
  }

  logger.info('[Route] Handling route:', route, 'params:', params, 'currentView:', state.currentView)

  if (state.currentView !== name || !state.currentViewInstance) {
    mountView(name, params).catch(err => logger.error(`[${def.title}] mount failed:`, err))
    return
  }

  // Already on the view — reapply filters from the URL. Skipped while a load
  // is in flight: renderConnected() writes the landing route into the hash,
  // and the resulting hashchange would otherwise restart the load it just
  // kicked off and flash the spinner.
  if (def.reloadOnParams && !state.currentViewInstance.isLoading) {
    Promise.resolve(def.load(state.currentViewInstance, params))
      .catch(err => logger.error(`[${def.title}] filter reload failed:`, err))
  }
}

/**
 * Tear down the mounted view, then create, render and load `name`.
 *
 * @param {string} name - key into VIEWS
 * @param {object} [params] - parsed URL params
 */
async function mountView(name, params = {}) {
  const def = VIEWS[name] || VIEWS.product
  cleanupCurrentView()
  state.currentView = name
  highlightNavItem(name)

  const container = document.getElementById('view-container')
  if (!container) return

  try {
    await ensureDatabase()
  } catch (error) {
    logger.error('[DB] Failed to initialize:', error)
    container.innerHTML = `
      <div class="error-message" style="padding: 20px; text-align: center;">
        <p>Failed to initialize the local database: ${escapeHtml(error.message)}</p>
        <p>Try again, or clear this site's browser data.</p>
      </div>`
    return
  }

  const view = def.create()
  state.currentViewInstance = view
  container.innerHTML = view.render()

  try {
    await def.load(view, params)
  } catch (error) {
    logger.error(`[${def.title}] load failed:`, error)
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

/** Open the IndexedDB cache once; every view and the sync share it. */
async function ensureDatabase() {
  if (state.dbInitialized) return
  await initDatabase()
  state.dbInitialized = true
}

/**
 * Auto-connect with saved credentials
 */
async function autoConnect(saved) {
  try {
    const client = new JiraClient({
      domain: saved.domain,
      email: saved.email,
      apiToken: saved.token,
      useProxy: shouldUseProxy(),
      serverAuth: Boolean(saved.serverAuth)
    })

    const user = await client.testConnection()
    state.client = client
    state.user = user
    state.jiraDomain = saved.domain
    window.jiraDomain = saved.domain
    state.dbInitialized = false

    // Check current route BEFORE rendering to determine initial view
    const { route, params } = parseRoute()
    const initialView = resolveInitialView(route)

    logger.info('[AutoConnect] Initial view will be:', initialView, 'route:', route, 'params:', params)

    await renderConnected(user, initialView, params)
  } catch (error) {
    logger.error('[AutoConnect] Failed to auto-connect:', error.message)
    if (saved.serverAuth) {
      // There is no form to fall back to — the credential is the proxy's.
      showError(`Could not reach Jira through the proxy: ${error.message}`)
      renderDisconnected()
      return
    }
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
        <h1 class="app-title"><span class="brand-icon">${NAV_ICONS.brand}</span>ProductTVT</h1>
      </div>
      <div id="settings-container"></div>
    </div>
  `

  const container = document.getElementById('settings-container')
  container.innerHTML = settingsPanel.render()
  settingsPanel.bindEvents()
}

/**
 * Render connected state: top bar with icon tabs, then the view.
 *
 * @param {object} user
 * @param {string} [initialView]
 * @param {object} [params] - parsed URL params, passed through to the view
 */
async function renderConnected(user, initialView = 'product', params = {}) {
  state.currentView = null

  // Put the landing view in the URL. Without this the hash keeps whatever it
  // was (often a bookmark to a removed view) while a different view renders,
  // so a reload lands somewhere else than the screen showed.
  const initialRoute = ROUTE_FOR_VIEW[initialView]
  if (initialRoute && parseRoute().route !== initialRoute) {
    navigate(initialRoute, params)
  }

  const tabs = Object.entries(VIEWS).map(([name, def]) => `
        <button class="tab-btn" data-view="${name}" id="tab-${name}" aria-label="${def.title}">
          ${NAV_ICONS[def.icon]}
        </button>`).join('')

  appElement.innerHTML = `
    <div class="app-shell">
      <header class="top-bar">
        <div class="top-bar-left">
          <span class="brand"><span class="brand-icon">${NAV_ICONS.brand}</span><span class="brand-text">ProductTVT</span></span>
          <nav class="tab-bar" id="tab-bar" aria-label="Views">${tabs}
          </nav>
        </div>
        <div class="top-bar-right">
          <span class="user-greeting">
            Connected as <strong>${escapeHtml(user.displayName)}</strong>
          </span>
          <div id="sync-status-container"></div>
          <button class="icon-btn" id="theme-toggle-btn" aria-label="Toggle dark / light">${NAV_ICONS.theme}</button>
        </div>
      </header>
      <main class="app-content" id="app-content">
        <div id="view-container"></div>
      </main>
    </div>
  `

  addGlobalStyles()

  // Tabs navigate by URL; the hashchange mounts the view. One listener on the
  // bar, not one per button.
  document.getElementById('tab-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn')
    if (!btn) return
    const def = VIEWS[btn.dataset.view]
    if (def) navigate(def.route)
  })

  // Theme toggle
  const savedTheme = localStorage.getItem('jira-planner-theme')
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('jira-planner-theme', next)
  })

  // Initialize sync status in background
  renderSyncStatus().catch(() => {})

  await mountView(initialView, params)

  // Initialize keyboard shortcuts
  initKeyboardShortcuts(state.jiraDomain)

  // Background refresh. Used to be kicked off from the board selector's load;
  // with that gone it starts here, once the first view is on screen.
  ensureDatabase()
    .then(() => {
      autoSync()
      startAutoSyncTimer()
    })
    .catch(err => logger.error('[AutoSync] could not start:', err))
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
 * Add global styles for components
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
    ${QuickSearchPaletteStyles || ''}
    ${IssueDetailDrawerStyles || ''}
    ${StandupViewStyles || ''}
    ${ProductBoardViewStyles || ''}
    ${CustomerDashboardViewStyles || ''}
    ${ProductRadarViewStyles || ''}
    ${BugPatternsViewStyles || ''}
    ${TraceabilityViewStyles || ''}
    ${KeyboardShortcutsStyles || ''}

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
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .offline-banner.visible { display: flex; }

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
    logger.info('[Sync] Initial status not available')
  }
}

/** How often to refresh in the background. */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000
let autoSyncTimer = null

/**
 * Refresh in the background on a timer, so the board reflects Jira without
 * anyone pressing Sync.
 *
 * Deliberately conservative about when it fires:
 *  - nothing while the tab is hidden (a background tab polling Jira all day is
 *    wasted requests and rate-limit budget); a catch-up sync runs on refocus
 *  - nothing while offline
 *  - nothing while a sync is already running
 */
function startAutoSyncTimer() {
  stopAutoSyncTimer()

  autoSyncTimer = setInterval(() => {
    if (document.hidden || !navigator.onLine) return
    autoSync().catch(err => logger.error('[AutoSync] scheduled sync failed:', err))
  }, AUTO_SYNC_INTERVAL_MS)

  // Catch up when the tab comes back, rather than waiting out the interval.
  document.addEventListener('visibilitychange', handleVisibilityResync)
  window.addEventListener('online', handleVisibilityResync)
}

function stopAutoSyncTimer() {
  if (autoSyncTimer) clearInterval(autoSyncTimer)
  autoSyncTimer = null
  document.removeEventListener('visibilitychange', handleVisibilityResync)
  window.removeEventListener('online', handleVisibilityResync)
}

async function handleVisibilityResync() {
  if (document.hidden || !navigator.onLine || state.isSyncing) return

  const status = await getSyncStatus().catch(() => null)
  const last = status?.lastSync ? new Date(status.lastSync).getTime() : 0
  if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return

  autoSync().catch(err => logger.error('[AutoSync] refocus sync failed:', err))
}

/** Re-run the mounted view's load so fresh data appears without a view switch. */
function refreshCurrentView() {
  const view = state.currentViewInstance
  if (!view || typeof view.load !== 'function') return
  Promise.resolve(view.load(view.filters || {}))
    .catch(err => logger.error('[Sync] view refresh failed:', err))
}

async function autoSync() {
  if (!state.client || state.isSyncing) return
  state.isSyncing = true

  try {
    await ensureDatabase()

    const syncResult = await syncIncremental(state.client)
    const status = await getSyncStatus()
    status.changeCount = syncResult.changeCount || 0
    updateSyncStatusUI(false, status)

    if (syncResult.warnings && syncResult.warnings.length > 0) {
      logger.warn('[AutoSync] Completed with warnings:', syncResult.warnings);
    }

    logger.info('[AutoSync] Background sync completed')
    refreshCurrentView()
  } catch (error) {
    logger.error('[AutoSync] Background sync failed:', error.message)
  } finally {
    state.isSyncing = false
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
    try {
      await ensureDatabase()
    } catch (dbError) {
      logger.error('[DB] Initialization failed:', dbError)
      throw new Error(`Database initialization failed: ${dbError.message}. Please try again or clear browser data.`)
    }

    if (state.client) {
      const syncResult = await syncAll(state.client)
      const status = await getSyncStatus()
      status.changeCount = syncResult.changeCount || 0
      updateSyncStatusUI(false, status)

      if (syncResult.warnings && syncResult.warnings.length > 0) {
        showError(`Sync completed with ${syncResult.warnings.length} warning(s): ${syncResult.warnings[0]}`)
      }

      refreshCurrentView()
    }
  } catch (error) {
    logger.error('[Sync] Failed:', error)
    showError(`Sync failed: ${error.message}. Progress was saved — syncing again resumes from where it stopped.`)
    updateSyncStatusUI(false)
  } finally {
    // Without this the flag latched on after the first sync, and every later
    // sync — manual or automatic — returned at the `if (state.isSyncing)`
    // guard without doing anything.
    state.isSyncing = false
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

/** Mark the active tab. */
function highlightNavItem(view) {
  document.querySelectorAll('#tab-bar .tab-btn').forEach(btn => {
    const active = btn.dataset.view === view
    btn.classList.toggle('active', active)
    if (active) btn.setAttribute('aria-current', 'page')
    else btn.removeAttribute('aria-current')
  })
}

// Components reach the router through these globals rather than importing it.
window.navigate = navigate
window.updateQueryParams = updateQueryParams
