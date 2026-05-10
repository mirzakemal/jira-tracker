# Jira Planner

A modern, browser-based Jira planning tool with local IndexedDB storage. View your Jira issues in a Kanban board, table view, roadmap timeline, and analytics dashboards — all with powerful filtering, custom tags, and shareable URLs. **Read-only** — no writes to Jira.

## Features

- **Kanban Board** — View issues organized by status
- **All Issues Table** — Sortable, filterable grid with customizable columns
- **Roadmap Timeline** — Gantt chart with swimlanes, sprint overlays, color modes, compact view, drag-to-pan, keyboard nav
- **Sprint Velocity Dashboard** — Completion trends, burndown charts per sprint, board filter
- **Team Workload Heatmap** — Assignee × status distribution
- **Issue Aging Report** — Days-in-status buckets
- **Release Progress** — Fix version completion tracking with risk indicators
- **Dependency Graph** — Issue blocks/blocked-by tree visualization
- **Dashboard Home** — Aggregate overview
- **What's Changed** — Post-sync changelog drawer showing status/assignee/priority changes
- **Quick Search** — Cmd+K fuzzy search across all issues
- **Issue Detail Drawer** — Slide-in panel with full issue details, comments, ADF rendering
- **Advanced Filtering** — Status, Fix Version, Customer, Product, Assignee, Reporter, QA Tester, Tags, date ranges, search
- **Custom Tags** — Add personal tags to issues (stored locally)
- **Saved Views** — Save and load filter/column configurations
- **Shareable URLs** — Bookmark or share filtered views via hash parameters
- **Auto-Connect** — AES-GCM encrypted credential storage, auto-login on refresh
- **Dark/Light Mode** — Adapts to system preference

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Jira Cloud account
- An API token from Atlassian

### Generate Jira API Token

1. Go to [https://id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens)
2. Click "Create API token"
3. Label your token (e.g., "Jira Planner")
4. Copy the token

### Installation

```bash
npm install
npm run dev
```

The app will open at `http://localhost:5173`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_JIRA_DOMAIN` | Custom Jira domain for dev proxy | — |

## Usage

1. **Connect to Jira** — Enter domain, email, API token. Credentials are encrypted and saved for auto-connect.
2. **Select Project & Board** — Choose project, board, sprint (or "All Sprints").
3. **Switch Views** — Kanban Board, All Issues, Roadmap, Velocity, Workload, Aging, Releases, Dependencies.
4. **Filter** — Use the filter panel (All Issues) or toolbar (Roadmap) to narrow results. Filters are reflected in the URL.
5. **Manage Tags** — Click Tags cell in table to add/remove local tags.
6. **Save Views** — Save filter+column configs for quick access.

## URL Routing

Hash-based routing with query parameters:

```
#/board                                          — Kanban board
#/all-issues                                     — All Issues table
#/roadmap                                        — Roadmap timeline
#/velocity                                       — Sprint velocity dashboard
#/workload                                       — Team workload heatmap
#/aging                                          — Issue aging report
#/releases                                       — Release progress
#/all-issues?status=In%20Progress&customer=Acme  — Filtered view
#/roadmap?startDate=2026-04-01&endDate=2026-09-30&groupBy=epic&zoomLevel=month
```

Multiple filters combine: `#/all-issues?status=Done&status=In%20Progress&fixVersion=v2.0`

**Bookmark or share these URLs** — they preserve your view and filters on page refresh.

## Project Structure

```
src/
├── api/
│   └── jira.js                  # Jira REST client (read-only GET)
├── components/
│   ├── AllIssuesView.js         # Table view + filters
│   ├── BackButton.js            # Shared back button
│   ├── BoardSelector.js         # Project/board/sprint dropdowns
│   ├── ChangelogDrawer.js       # Sync changelog drawer
│   ├── DashboardHomeView.js     # Aggregate dashboard
│   ├── DependencyGraphView.js   # Issue dependency tree
│   ├── FilterPanel.js           # Multi-select filter controls
│   ├── IssueAgingView.js        # Days-in-status report
│   ├── IssueBoard.js            # Kanban board
│   ├── IssueCard.js             # Kanban card
│   ├── IssueDetailDrawer.js     # Slide-in issue detail (ADF parser)
│   ├── QuickSearchPalette.js    # Cmd+K fuzzy search
│   ├── ReleaseProgressView.js   # Fix version progress
│   ├── RoadmapTimeline.js       # Gantt timeline renderer
│   ├── RoadmapToolbar.js        # Roadmap filter controls
│   ├── RoadmapView.js           # Roadmap container
│   ├── SavedViewsMenu.js        # Save/load view configs
│   ├── SettingsPanel.js         # Connection form
│   ├── SprintVelocityView.js    # Velocity + burndown charts
│   ├── SyncStatus.js            # Sync indicator + changes badge
│   ├── TableView.js             # Configurable table
│   ├── TagsManager.js           # Tag styles (CSS)
│   └── TeamWorkloadView.js      # Workload heatmap
├── db/
│   ├── indexeddb.js             # IndexedDB wrapper
│   ├── queries.js               # Query layer with filtering
│   └── sync.js                  # Data sync engine
├── utils/
│   ├── date.js                  # formatDate, timeAgo
│   ├── db.js                    # DB helpers
│   ├── debounce.js              # Debounce utility
│   ├── dom.js                   # showError, renderLoading, toggleBoardSelector
│   ├── html.js                  # escapeHtml
│   ├── logger.js                # Leveled, prefix-filtered logger
│   ├── router.js                # Hash-based routing
│   ├── storage.js               # AES-GCM encrypted credential storage
│   ├── styles.js                # Shared CSS fragments
│   └── sw-register.js           # Service worker registration
├── __tests__/                   # 10 test files, 143 tests
├── jira-config.js               # Custom field mappings
├── main.js                      # App entry point
└── style.css                    # Global styles
```

## Development

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests (watch mode) |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run test:coverage` | Tests with coverage report |

### Runtime Debug

Append `?log=debug` to the URL to enable verbose logging:
```
http://localhost:5173/?log=debug#/board
```

## Testing

143 tests across 10 test files using Vitest with jsdom + fake-indexeddb.

| Test File | Coverage |
|-----------|----------|
| `jira.test.js` | API client, request building, error codes, network failures |
| `indexeddb.test.js` | CRUD, metadata, indexes, schema upgrades |
| `queries.test.js` | Filter combos, tags, saved views, roadmap queries |
| `router.test.js` | Hash routing, parse, navigate, params |
| `debounce.test.js` | Debounce + throttle |
| `storage.test.js` | Encrypt/decrypt, legacy migration |
| `sync.test.js` | Full/incremental sync, status |
| `components.test.js` | SyncStatus, IssueCard rendering |
| `logger.test.js` | Logger levels, prefix filtering |

## Security

- **AES-GCM** encryption via Web Crypto API
- **PBKDF2** key derivation (100K iterations, SHA-256)
- **Per-credential random salt** (16 bytes) — unique per credential set
- **Random IV** (12 bytes) — unique per encryption
- Key material derived from `domain:email`
- Zero server-side — runs entirely in browser, no data sent to third parties
- Never commit API tokens to version control

## Sync Behavior

| Trigger | Type | Scope |
|---------|------|-------|
| Initial connect | Full sync | All projects, boards, sprints, issues, links |
| Page refresh | Incremental | Last 30 days of updated issues |
| Manual "Sync" button | Full sync | All data |

## Custom Fields

`jira-config.js` maps Jira custom fields:

| Field | Source |
|-------|--------|
| customer | `customfield_10043` |
| codeReviewer1 | `customfield_10044` |
| codeReviewer2 | `customfield_10313` |
| product | Any field containing "product" |
| qa_tester | Any field containing "qa" or "tester" |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Connection fails | Domain format (`xxx.atlassian.net`), valid API token |
| No boards found | Scrum/Kanban board configured in Jira |
| Empty board | Selected sprint has issues |
| Customer filter empty | `customfield_10043` exists in your Jira instance; trigger manual sync |
| View resets on refresh | URL contains correct hash route (`#/all-issues`, `#/roadmap`, etc.) |
| Endless loading spinner | Check browser console; likely a missing container ID in render method |

## License

MIT
