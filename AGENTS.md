# AGENTS.md — Jira Planner

Browser-based read-only Jira client. Vanilla JS, Vite, IndexedDB cache. No Jira writes ever.

## Commands

```bash
npm run dev              # Vite dev server (proxy to Jira via VITE_JIRA_DOMAIN)
npm run build            # Production build
npm run lint             # ESLint (src/)
npm test                 # Vitest watch mode
npm run test:run         # Single CI run
npm run test:coverage    # Coverage report
```

Single test file: `npx vitest run src/__tests__/jira.test.js`

Test env: jsdom + fake-indexeddb (polyfilled in `src/__tests__/setup.js`).

## Architecture

- **`src/main.js`** (~1290 lines) — god file: routing, view switching, sync, DB init, UI rendering. Most bugs live here.
- **`src/api/jira.js`** — `JiraClient` class, GET-only. Has 30s timeout via `AbortController`. Uses `btoa` for Basic auth (base64, not encryption).
- **`src/db/indexeddb.js`** — IndexedDB wrapper. `DB_VERSION = 6`. Key stores: `issues` (keyPath: `key`), `tags` (autoIncrement), `metadata` (keyPath: `key`).
- **`src/db/sync.js`** — Fetches from Jira → caches locally. Errors are silently swallowed (logged only).
- **`src/db/queries.js`** — All data queries + filter logic. Has its own filter cache (`invalidateFilterCache()` clears it).
- **`src/utils/storage.js`** — AES-GCM encrypted credentials in localStorage. Falls back to plaintext migration path on load.
- **`src/utils/router.js`** — Hash-based routing with query params. Exports `navigate()`, `onRouteChange()`, `ROUTES`.
- **`src/jira-config.js`** — Custom field IDs per Jira instance. Edit for your team.

## Critical Gotchas

### STORES constant duplicated 3x
`sync.js`, `queries.js`, `indexeddb.js` each define their own `STORES`/`STORE_NAMES` object. They must stay in sync manually. If adding a new store, update all three.

### `escapeHtml` duplicated 7x
Defined in `src/utils/html.js` but several components define their own local copy. Always import from `utils/html.js`.

### Board/Sprint IDs are strings from `<select>`, numbers in IndexedDB
Always coerce: `Number(val)`. Mismatch causes 0-result queries.

### Container ID must exist in loading state
Component `render()` returns `<div id="my-view">` wrapper. Loading spinners must also be inside this wrapper or `refresh()` can't find the container after async load → endless spinner.

### `getAll(ISSUES)` performance
`queries.js` calls `getAll('issues')` ~11 times for filter option generation. With large datasets this is slow. Consider caching or using indexes.

### Numeric filter fields are strings in URL params
`paramsToFilters()` returns strings. IndexedDB stores numbers. Query functions must handle both.

## Read-Only Rule — Hard Constraint

**Never add Jira write methods.** The app is deliberately read-only.
- `api/jira.js` — only GET operations
- `db/sync.js` — only fetches and caches
- `db/indexeddb.js` — local writes OK (tags, saved views, metadata, changelog, issuelinks)
- `CreateIssueModal.js` exists as dead code — do not import or wire up

## Adding a New View

1. Add route constant to `src/utils/router.js` (`ROUTES.MYVIEW`)
2. Add nav button to sidebar in `renderConnected()` in `main.js`
3. Add click handler in the `viewSwitchMap` object in `renderConnected()`
4. Add `switchToMyView()` function in `main.js`
5. Add route case in `handleRouteChange()` in `main.js`
6. Import component + styles in `main.js`, inject styles in `addGlobalStyles()`

Pattern: every view switch does `cleanupCurrentView()` → hide board selector → create new instance → render into `#issue-board-container`.

## Component Pattern

```js
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class MyComponent {
  constructor(client, jiraDomain, onBack) { ... }
  async load() {
    this.isLoading = true;
    this.refresh();
    try { /* fetch */ this.isLoading = false; this.refresh(); }
    catch (e) { this.error = e.message; this.isLoading = false; this.refresh(); }
  }
  render() {
    if (this.error) return this.renderError();
    if (this.isLoading) return `<div id="my-view"><div class="loading-board">...</div></div>`;
    return `<div id="my-view">...</div>`;
  }
  refresh() {
    const el = document.getElementById('my-view');
    if (el) { el.outerHTML = this.render(); this.bindEvents(); }
  }
  bindEvents() { ... }
}
export const MyComponentStyles = `...`;
```

Key: `#my-view` ID must be in both loading and loaded HTML.

## Dead Code (do not extend)

- `src/components/CreateIssueModal.js` — unused, not imported
- `src/components/TagsManager.js` — `TagsManager` class unused; only `TagsManagerStyles` is imported
- `src/components/TagsManager.js` `TagsFilter` class — unused
- `jira-client` npm package — not imported anywhere, custom `JiraClient` used instead

## CSS Variables

```css
var(--bg)              /* #1a1a2e */
var(--surface)         /* #1e1e36 */
var(--hover)           /* #2a2a44 */
var(--border)          /* #333 */
var(--text)            /* #e0e0e0 */
var(--text-secondary)  /* #888 */
var(--accent)          /* #4f8cff */
var(--primary)         /* #6366f1 */
var(--danger)          /* #ef4444 */
var(--success)         /* #22c55e */
```

## Dev Proxy

`VITE_JIRA_DOMAIN` env var sets the proxy target (default: `tenderboard.atlassian.net`). In dev, API calls go through Vite proxy at `/rest` and `/agile` to avoid CORS. In production, calls go direct to `https://{domain}`.

## Known Bug Patterns

| Bug | Cause | Fix |
|-----|-------|-----|
| Endless loading | Loading HTML missing `#my-view` wrapper | Wrap spinner in container div |
| Duplicate event listeners | `addEventListener` called twice | Guard flag or event delegation |
| Filter 0 results | String ID vs Number ID | `Number(val)` on select change |
| Date mutation | `new Date(date).setMonth()` mutates original | Clone: `new Date(new Date(date).setMonth(...))` |
| CSS var in @keyframes | Not animatable | Use `transform`/`clip-path` |
| Retry button crash | Wrong method name | Check method exists on view instance |

## Environment Quirks

- Credentials encrypted with AES-GCM (Web Crypto). Requires secure context (HTTPS or localhost).
- `?log=debug` URL param enables verbose logging at runtime.
- Cmd+K / Ctrl+K opens quick search palette.
- Offline banner shown via `navigator.onLine` events.
