# ProductTVT

A browser-based companion to Jira for the product team, with a local IndexedDB cache. Six views — a Product Board, a Customer Card Dashboard, a Standup, and three product-management lenses (Product Radar, Bug Patterns, Traceability) — behind a single row of icon tabs. **Read-only** — the app never writes to Jira; every card opens the issue in a new tab.

## Features

- **Product Board** — Kanban of PDT product cards with their linked engineering work, milestones and Confluence documentation status
- **Customer Card Dashboard** — One card per customer request from the Customer Testing Board, with linked issues and epic children
- **Standup** — Per-person view of what moved in the last few days, in standup columns
- **Product Radar** — What only a PM can unblock: decisions waiting, high-priority work gone stale, rework, inflow vs outflow per team area, customers with urgent open work. Parked work is excluded by rule
- **Bug Patterns** — Bugs clustered by product area (inferred from titles), monthly trend, Bug:Defect escape ratio, bounce-backs, and the recurring phrases the dictionary doesn't name yet
- **Traceability** — Product cards with no engineering work, engineering work with no product parent, and support tickets connected only by a mention in a title
- **Local triage** — Reviewed / needs decision / parked chips on Radar rows, stored in this browser only
- **What's Changed** — Post-sync changelog drawer showing status/assignee/priority changes
- **Quick Search** — Cmd+K fuzzy search across all cached issues
- **Issue Detail Drawer** — Slide-in panel with full issue details, comments, ADF rendering
- **Shareable URLs** — Every filter lives in the hash, so a view can be bookmarked or sent
- **Auto-Connect** — Credentials kept in the browser, or held by the reverse proxy in production
- **Dark/Light Mode** — Follows the system, with a toggle in the top bar

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Jira Cloud account
- An API token from Atlassian

### Generate Jira API Token

1. Go to [https://id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens)
2. Click "Create API token"
3. Label your token (e.g., "ProductTVT")
4. Copy the token

### Installation

```bash
npm install
npm run dev
```

The app will open at `http://localhost:5173`.

### Environment Variables

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_JIRA_DOMAIN` | Atlassian site for the dev proxy (`/rest`, `/agile`, `/wiki`) | `tenderboard.atlassian.net` |
| `VITE_PRODUCT_BOARD_ID` | Jira board ID for the Product board | — |
| `VITE_ENG_BOARD_ID` | Jira board ID for the Engineering board | — |
| `VITE_PRODUCT_PROJECT_KEY` | Project whose issues form the Product Board | `PDT` |
| `VITE_ENG_PROJECT_KEY` | Project holding engineering cards | `TSM2` |
| `VITE_EXTRA_SYNC_PROJECTS` | Projects with no agile board, synced by JQL (comma-separated) | `TTS` |
| `VITE_CONFLUENCE_SPACE_KEY` | Confluence space for documentation drafts | — |
| `VITE_USER_PERSONA_FIELD` | Custom field ID backing "User Persona" | — |

### Credentials

**API tokens are not environment variables in this app**, and there is no
`CONFLUENCE_API_TOKEN` entry above on purpose.

This is a browser-only app with no server. Vite inlines every `VITE_`-prefixed
variable into the JavaScript bundle as plain text, so a token placed there is
readable by anyone who loads the page. Non-`VITE_` variables are visible only to
the Node build process, which never makes Atlassian calls — so they would not
reach the client at all.

Instead, Jira and Confluence tokens are entered in **Settings → Connect** and
stored AES-GCM encrypted in localStorage (`src/utils/storage.js`). One Atlassian
API token works for both products — create it at
[id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens).

Holding tokens in env would require adding a real server-side component to keep
them off the client.

## Usage

1. **Connect to Jira** — Enter domain, email, API token (or deploy with `VITE_AUTH_MODE=proxy` and the proxy holds the credential).
2. **Sync** — The Sync button runs a full sync; a background incremental sync runs every 5 minutes while the tab is visible. An interrupted sync resumes where it stopped.
3. **Switch views** — The icon tabs in the top bar. Hover for the name. `g` then `p` / `c` / `s` / `r` / `b` / `t` jumps by keyboard; `?` lists shortcuts.
4. **Filter** — Each view's controls write to the URL, so the address bar is the saved state.
5. **Triage** — On the Product Radar, mark a row reviewed, needs-decision, or parked. Stored locally; parked rows leave the radar.
6. **Open in Jira** — Click any card or row. Annotate there; this app only reads.

## URL Routing

Hash-based routing with query parameters:

```
#product                                  — Product Board (default)
#product?customer=NTUC&priority=High      — Product Board, filtered
#customers?customer=NTUC                  — Customer Card Dashboard
#standup                                  — Standup
#radar?area=integration&parked=1          — Product Radar, one team area, parked shown
#bugs?sort=escape&team=core&sel=invoicing — Bug Patterns, sorted by escape ratio
#trace?tab=tts&bugs=1                     — Traceability, support-ticket tab
```

Bookmarks to views that no longer exist (`#board`, `#roadmap`, `#dashboard`, …) open the Product Board.

## Project Structure

```
src/
├── api/
│   ├── jira.js                  # Jira REST client (read-only GET; retries; JQL search)
│   └── confluence.js            # Confluence client (read-only)
├── components/
│   ├── ProductBoardView.js      # Product Board kanban
│   ├── CustomerDashboardView.js # Customer Card Dashboard
│   ├── StandupView.js           # Standup columns
│   ├── ProductRadarView.js      # Product Radar
│   ├── BugPatternsView.js       # Bug Pattern Explorer
│   ├── TraceabilityView.js      # Traceability Gaps
│   ├── IssueDetailDrawer.js     # Slide-in issue detail (ADF parser)
│   ├── QuickSearchPalette.js    # Cmd+K fuzzy search
│   ├── ChangelogDrawer.js       # Sync changelog drawer
│   ├── SyncStatus.js            # Sync button, status, resume notice
│   ├── SettingsPanel.js         # Connection form / server-auth screen
│   └── KeyboardShortcuts.js     # g+key navigation, ? overlay
├── db/
│   ├── indexeddb.js             # IndexedDB wrapper (getMany, count, indexes)
│   ├── sync.js                  # Resumable sync engine (boards, sprints, JQL projects)
│   ├── sync-progress.js         # Sync checkpoints
│   ├── queries.js               # Shared queries: issue lookup, local tags, quick search, links
│   ├── product-queries.js       # Product Board queries
│   ├── product-sync.js          # Product Board reconciliation after sync
│   ├── radar-queries.js         # Product Radar signals
│   ├── bug-queries.js           # Bug Pattern Explorer
│   ├── trace-queries.js         # Traceability gaps
│   ├── epic-hydrator.js         # On-demand epic + children fetch
│   └── field-resolver.js        # Custom field ids by name
├── utils/
│   ├── completion.js            # isCompleted / completedAt — status category, not resolution
│   ├── team-area.js             # Project / Integration / Core inference
│   ├── product-area.js          # Title → product area dictionary; recurring phrases
│   ├── parked.js                # [Archived] / [KIV] / customer=Archived detection
│   ├── mentions.js              # Issue keys cited inside titles
│   ├── nav-icons.js             # Inline SVG tab icons
│   ├── router.js                # Hash routing
│   ├── initial-view.js          # Landing-view resolution
│   ├── storage.js               # Credential storage
│   ├── styles.js                # Shared CSS fragments
│   └── ...                      # date, dom, html, logger, fuzzy, adf, proxy, auth-mode, sw-register
├── __tests__/                   # 32 test files, 586 tests
├── jira-config.js               # Custom field mappings
├── product-config.js            # Project keys, statuses, board ids, extra sync projects
├── main.js                      # App entry: view registry, top bar, sync scheduling
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

586 tests across 32 files using Vitest with jsdom + fake-indexeddb.

| Test File | Coverage |
|-----------|----------|
| `jira.test.js`, `sync-resume.test.js` | API client, retries, pagination, checkpointing |
| `sync.test.js`, `sync-engine-resume.test.js` | Full/incremental sync, resume wiring |
| `indexeddb.test.js`, `queries.test.js` | Storage, tags, quick search, links |
| `completion.test.js`, `classifiers.test.js` | Derived completion; team-area and parked rules |
| `radar-queries.test.js`, `product-radar-view.test.js` | Product Radar data and UI |
| `bug-queries.test.js`, `bug-patterns-view.test.js` | Product-area dictionary, phrases, explorer UI |
| `trace-queries.test.js`, `traceability-view.test.js` | Mentions, link index, gap lists, UI |
| `product-*.test.js`, `customer-dashboard.test.js`, `standup.test.js` | The three original views |
| `router.test.js`, `initial-view.test.js` | Routing and landing view |

## Security

- **AES-GCM** encryption via Web Crypto API
- **PBKDF2** key derivation (100K iterations, SHA-256)
- **Per-credential random salt** (16 bytes) — unique per credential set
- **Random IV** (12 bytes) — unique per encryption
- Key material derived from `domain:email`
- No application server. Production needs a reverse proxy for CORS (see `RELEASING.md`); it can also hold the Atlassian credential so the browser never sees one
- The service worker does not cache Jira API responses; cached issue data lives only in IndexedDB
- Never commit API tokens to version control

## Sync Behavior

| Trigger | Type | Scope |
|---------|------|-------|
| Initial connect | Full sync | All projects, boards, sprints, issues, links |
| Page refresh | Incremental | Last 30 days of updated issues |
| Manual "Sync" button | Full sync | All data |
| Board-less projects (`VITE_EXTRA_SYNC_PROJECTS`) | JQL, in every sync | `project = KEY`, paged by token |
| Interrupted sync | Resumes | Completed boards/sprints/pages are skipped on the next run |

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
| Customer filter empty | `customfield_10043` exists in your Jira instance; trigger manual sync |
| Traceability's support tab says nothing is cached | Run a sync — `TTS` has no board and is fetched by JQL (`VITE_EXTRA_SYNC_PROJECTS`) |
| A card is in the wrong team area | Tune the keyword/type rule in `src/utils/team-area.js`; nothing in Jira records the area |
| A bug is in the wrong product area | Add a pattern to `src/utils/product-area.js`; the explorer's "phrases not named yet" shows candidates |
| Something parked is still showing | Parked = customer `Archived`, or title starts `[Archived]` `[KIV]` `[On Hold]` `[WIP]` `[Duplicated]`; otherwise park it with the ⏸ chip |
| View resets on refresh | URL contains a current route (`#radar`, `#bugs`, …) — removed routes redirect to `#product` |
| Endless loading spinner | Check browser console; likely a missing container ID in render method |

## License

MIT
