# AGENTS.md — ProductTVT

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

- **`src/main.js`** (~700 lines) — app entry: the `VIEWS` registry (one entry per tab: route, title, icon, `create`, `load`, `reloadOnParams`), `mountView()`, the top bar, sync scheduling. Adding a view is one registry entry; there are no per-view `switchTo…` functions any more.
- **`src/api/jira.js`** — `JiraClient` class, GET-only. Has 30s timeout via `AbortController`. Uses `btoa` for Basic auth (base64, not encryption).
- **`src/db/indexeddb.js`** — IndexedDB wrapper. `DB_VERSION = 10`. Key stores: `issues` (keyPath: `key`), `tags` (autoIncrement), `metadata` (keyPath: `key`), `product_cards` / `doc_drafts` (keyPath `id`, autoIncrement).
- **`src/db/sync.js`** — Fetches from Jira → caches locally. Errors are silently swallowed (logged only).
- **`src/db/queries.js`** — Shared plumbing only: `getIssueByKey`, local tags (`addTag`/`removeTag`/…), `getAllProjects`, `searchIssues` (Cmd+K), `getLatestChangelog`, `getIssueLinks`. View-specific queries live beside their views: `radar-queries.js`, `bug-queries.js`, `trace-queries.js`, `product-queries.js`. Each exports a pure `build…()` (tested on fixtures) and a `load…()` that reads the cache.
- **`src/db/product-queries.js`** — Product Board CRUD (`product_cards`, `doc_drafts`), Eng-link detection, assigned-engineer resolution, milestone triggers. Kept separate from `queries.js` to stop that file growing further.
- **`src/db/product-sync.js`** — Local reconciliation of the Product Board after a Jira sync. Makes NO network calls; called from `syncAll()`/`syncIncremental()` via `reconcileProductBoard()`.
- **`src/utils/product-handoff.js`** — Builds the prefilled Jira create-issue URL + REST payload for a drafted card. No network calls, no writes.
- **`src/components/CustomerDashboardView.js`** — Customer Card Dashboard: one full-width card per CUSTOMER CARD, sourced from the Customer Testing Board (TSM2 board 22), NOT from PDT. Epic links expand to show their child work items. Route `ROUTES.CUSTOMERS` (`#customers`). Read-only; every row is an anchor to Jira.
- **`src/components/ProductBoardView.js`** — Product Board dashboard: Customer/Priority/Reporter filters, Action Required alerts, Kanban columns. Route `ROUTES.PRODUCT` (`#product`) — the app's LANDING view; every unknown route (including the removed `#board`, `#roadmap`, …) redirects here. Cards show a linked-issue count plus each link's status and open Jira in a new tab.
- **`src/components/ProductRadarView.js`** + **`db/radar-queries.js`** — Product Radar: decisions waiting (PDT in Plan/Feedback/Validation), High/Highest open >30d, rework (Test Comments / Test Run Failed), inflow vs outflow per team area over 90d, customers with urgent work. Route `#radar`. Triage chips store `triage:reviewed|decision|parked` tags locally.
- **`src/components/BugPatternsView.js`** + **`db/bug-queries.js`** — Bug Pattern Explorer: product areas from `utils/product-area.js`, monthly trend, Bug:Defect escape ratio, bounce-backs, recurring phrases. Route `#bugs`. `SORT_OPTIONS` carries the on-screen explanation of each sort.
- **`src/components/TraceabilityView.js`** + **`db/trace-queries.js`** — Traceability Gaps: PDT without engineering work, TSM2 without a product parent, TTS tickets linked / mentioned-only / unconnected. Route `#trace`. `utils/mentions.js` finds keys cited in titles.
- **`src/utils/completion.js`** — `isCompleted()` / `completedAt()`: status CATEGORY, dated by `resolved_at` else `updated_at`. See gotcha below.
- **`src/utils/team-area.js`**, **`utils/parked.js`** — the two inferred classifications the Radar rests on; both are rule tables meant to be tuned.
- **`src/db/sync-progress.js`** — per-mode sync checkpoints (unit done-lists plus a page offset or token cursor). Why an interrupted sync resumes instead of restarting.
- **`src/utils/nav-icons.js`** — inline SVG for the tab bar, `currentColor` so the active tab tints.
- **`src/api/confluence.js`** — `ConfluenceClient`, GET-only, mirrors `JiraClient`. `publishDraft()` deliberately throws.
- **`src/product-config.js`** — Dual-board config: board IDs, eng link types, product statuses.
- **`src/utils/storage.js`** — AES-GCM encrypted credentials in localStorage. Falls back to plaintext migration path on load.
- **`src/utils/router.js`** — Hash-based routing with query params. Exports `navigate()`, `onRouteChange()`, `ROUTES`.
- **`src/jira-config.js`** — Custom field IDs per Jira instance. Edit for your team.

## Critical Gotchas

### STORES constant
`indexeddb.js` is the single source (`STORE_NAMES`); `sync.js`, `queries.js` and
`product-queries.js` all import it as `STORES`. (Earlier versions duplicated it —
they no longer do.) Adding a store still means bumping `DB_VERSION` so
`onupgradeneeded` fires for existing users.

### `getIssueLinks` used to close the shared connection
It called `db.close()` on the singleton `dbInstance` while `indexeddb.js` kept caching the
now-dead handle, so every later IndexedDB call threw `InvalidStateError` until a reload.
The close is gone (see the NOTE in `getIssueLinks`, with regression tests in `queries.test.js`). `indexeddb.js` owns that
lifecycle: never close what you did not open. Prefer `getByIndex` for new link reads.

### The two projects: PDT (product) and TSM2 (engineering)
`PRODUCT_PROJECT_KEY` = `PDT` (Product Development Team, id 10085).
`ENG_PROJECT_KEY` = `TSM2` (TenderBoard Sprints, id 10009). PDT cards link to TSM2
predominantly via Jira Product Discovery's **"Polaris work item link"** (48 of 57
links), recorded inward on the PDT issue; the rest are generic "Relates".

### Eng-link detection is multi-strategy
`detectEngIssueLink()` returns `{ key, source }`, trying in order: `custom_field`
(VITE_ENG_LINK_FIELD on the product issue) → `issue_link` (a type in
`ENG_LINK_TYPES`) → `epic_parent` (an issue whose `parent_key` is the product
issue) → `issue_link_any`. Every link-derived strategy REQUIRES the candidate to be
in `ENG_PROJECT_KEY` — an Eng card lives in TSM2 by definition, and generic link
types like "Relates" are used for both delivery links and plain cross-references
(PDT genuinely has a `Relates ← MDP` link that must not be adopted). Only the
explicit custom field bypasses the check. `link_source` records which strategy
matched; all links are listed in `linked_issue_keys` for display regardless.

### Unknown routes redirect to the Product Board
`handleRouteChange()` resolves the route with `resolveInitialView()`; if the hash is not one
of the six current routes it calls `navigate(ROUTES.PRODUCT)` and returns. Bookmarks to the
ten removed views (`#board`, `#all-issues`, `#roadmap`, `#velocity`, `#workload`, `#aging`,
`#releases`, `#dashboard`, `#cfd`, `deps`) therefore land somewhere useful instead of on a
blank screen. Their code is deleted, not hidden — do not resurrect a view by re-adding a
route without its component.

### Landing-view logic lives in `utils/initial-view.js`
`main.js` touches the DOM at import time, so it cannot be imported from a test — which
is how a `params is not defined` ReferenceError in `renderConnected()` shipped and hung
the Product Board on its spinner. `resolveInitialView(route)`, `ROUTE_FOR_VIEW` and the
per-view `…FiltersFromParams()` helpers live in a separate module so they are unit tested.
Params never change the landing view any more — only the route does.

### Issue links are replaced PER ISSUE, never globally
`syncIncremental()` must not `clear(STORES.ISSUELINKS)`: it only refetches issues
updated since the last run, so a global wipe strips links off every unchanged issue
and they never return without a full sync — the Product Board then shows
"Linked Issues: None" for almost everything. `upsertIssues()` calls
`deleteByIndex('issuelinks', 'source_key', key)` per issue instead. `getBoardIssues`
also requests `fields=*navigable,issuelinks` explicitly so links are always returned.

### Milestones are matched by status NAME, never category
TSM2 files `Tested`, `Ready for Regression` AND `Ready To Test` under the Done
category, so a `statusCategory` check reports most in-flight work as released. The
category fallback was removed for exactly this reason — do not reintroduce it. Only
`Ready To Test` and `Delivered / Released` are milestones.

### Milestones are sticky, and can't use `changelog`
`syncAll()` calls `clear(STORES.CHANGELOG)` on every run, so the changelog only
ever holds the last sync — it cannot answer "has this shipped?". Milestone state
therefore lives on the card in `milestones[key] = { reached_at, acknowledged }`,
stamped once and never overwritten, so a card bouncing between statuses does not
re-alert. `acknowledged` is owned by the UI via `acknowledgeMilestone()`.

### Product Board membership is by PROJECT, not board id
Cards come from `PRODUCT_PROJECT_KEY` (default `PDT` — the Product Development Team
project, id 10085). `VITE_PRODUCT_BOARD_ID` is only used for the "open in Jira" link.
Kanban columns come from `PRODUCT_STATUSES`, holding the REAL PDT workflow statuses
in board order: Plan, Feedback, Validation, Ready for Technical Specification, Ready
for Development, Development Process, Delivered / Released. This is NOT status-category
order — Validation sits third by design. Jira's board COLUMN config is not exposed by
the REST endpoints this app uses, so the order is maintained by hand; an unknown status
still gets its own column, appended last.

### `openIssueDrawer` has a centred variant
`openIssueDrawer(key, domain, onClose, { centered: true })` renders a 900px centred
modal instead of the 600px side drawer, via the `issue-detail-overlay--centered`
class. Only the Product Board passes it — product cards carry long descriptions that
the side panel squeezes. Both style blocks must stay; other callers rely on the drawer.

### Jira rich text is ADF, not a string
`fields.description` (and comments) come back as an ADF document tree. Storing it
raw yields `[object Object]` when rendered or searched. `utils/adf.js` `adfToText()`
flattens it at the sync boundary; it also passes plain strings through, since older
cached issues may hold either shape.

### Fuzzy search: subsequence matching only on SHORT fields
`utils/fuzzy.js` `fuzzyMatch(text, query, { allowSubsequence })`. Over a long
concatenated blob almost any short query can be found as an in-order subsequence, so
`cardMatchesSearch()` runs substring-only matching against the full search text
(description + every linked issue's summary and description) and reserves subsequence
matching for the key + title. Card search text is precomputed by `buildSearchText()`,
not rebuilt per keystroke.

### The Product Board only spins on FIRST load
`ProductBoardView.load()` sets `isLoading` only while `hasLoaded` is false. A filter or
search refresh must not swap in the loading state: it destroys the search input
mid-keystroke and flashes the column layout. `refresh()` also restores focus and caret
to `#product-search`.

### Card `updated_at` is a LOCAL write time, not Jira's
`updateProductCard()` stamps `updated_at` on every call, and reconciliation rewrites
every card on every sync — so sorting by it sorts by sync order. The Jira timestamp is
mirrored separately as `jira_updated_at`, and `sortByLastUpdated()` (the Product
Board's default order) uses that, falling back to `updated_at` only for local drafts
with no Jira issue.

### Background sync runs on a timer
`startAutoSyncTimer()` in `main.js` runs `syncIncremental` every 5 minutes
(`AUTO_SYNC_INTERVAL_MS`), skipping hidden tabs and offline, with a catch-up sync on
refocus/online when the last sync is older than the interval. It also reloads the
current view afterwards so new data appears without a manual refresh. `autoSync()` owns
`state.isSyncing` itself — before this it never set the flag, so it could overlap the
Sync button.

### The service worker must NOT intercept API requests
`public/sw.js` used to race `/rest/` and `/agile/` against an 8s timeout and return a
synthetic 503 on loss. `api/jira.js` maps any 5xx to "Jira server error. Please try
again later", so a slow-but-healthy Jira was reported as a server fault while
`navigator.onLine` was true. It also cached authenticated Jira responses in the Cache
API. v2 passes API paths straight through (`return` from the fetch handler, no
`respondWith`): JiraClient's own 30s AbortController governs timeouts and a real
failure surfaces as "Network error". Don't reintroduce API caching — the app's offline
story is IndexedDB. `sw-register.js` also skips registration in dev, where a cached app
shell fights Vite HMR and serves stale modules.

### Standup columns are matched by status NAME
`STANDUP_COLUMNS` in `StandupView.js`, left to right: Blockers / To Do, In Progress,
Review (Code Quality Check + In Review + Review Approval), Test (Ready To Test +
Testing + Tested + Ready for Regression), Completed (Delivered / Released + Approved +
Ready For Approval). Each card still shows its specific status, so folding several
stages into one column loses nothing. Matching is
on the status name because TSM2 files "Ready To Test" under the Done CATEGORY — a
category check would file it as finished. Nothing is ever dropped: an unrecognised OPEN
status falls to Blockers / To Do and an unrecognised FINISHED one to Completed, so a
Jira workflow change cannot make a ticket vanish from someone's standup.
The Test column names the TSM2 testing stages: Ready To Test, Testing, TESTING IN
PROGRESS, TEST RUN PASSED, Test Comments, Tested, Ready for Regression. `TEST RUN
FAILED` is named on the Blockers / To Do column instead — a failed run is a blocker, not
testing in progress.

### Standup filters on the issue's `updated` timestamp
`isRecentlyUpdated()` answers "this ticket changed within N days" — NOT "this person
made the change". Per-author attribution lives in Jira's changelog, which this app only
caches for the most recent sync (`syncAll` clears the store each run), so it is not
available offline. Don't describe the standup filter as "updates by that user".

### Type floor of 12px on the three dense views
Product Board, Customer Card Dashboard and Standup keep every `font-size` at 12px or
above — tests assert the floor. Raising it needed the Product Board's Kanban columns
widened too (`grid-auto-columns: minmax(300px, 1fr)`): at the old 240px a linked-issue
row wrapped its key, status chip and assignee onto separate lines.

### Standup reuses the shared filter bar
`renderControls()` emits `.product-filters` / `.product-filter` — the same classes as the
Product Board, injected globally from `ProductBoardViewStyles` — so every view's filter
bar looks and behaves alike. Prev/Next sits at the end of the same bar. There is no Exit
button; navigation is the icon tab bar at the top.

### Card actions replaced the Action Required banner
The board-level banner is gone; prompts render on the card they refer to
(`renderCardActions` / `renderDocAction` in `ProductBoardView.js`). The delegated card
click returns early for anything inside `.pb-card-actions`, so operating the Confluence
controls never navigates. Documentation has
four states in `DOC_STATUSES` — not_started, in_progress, done, not_needed — stored on
the card as `doc_status`/`doc_updated_at` and never touched by sync. `setDocStatus()`
also acknowledges the `released` milestone when documentation is settled either way, so
a card stops prompting once the question is answered. "Create Documentation" is a
handoff to Confluence's create screen (`buildCreateDocUrl`), matching the Jira one — the
app still writes nothing. With no `VITE_CONFLUENCE_SPACE_KEY` the space is chosen in
Confluence; setting it pins the space.

### Cards open Jira directly, not a local popup
Clicking a product card or a standup card opens `/browse/{key}` in a new tab. Standup
cards are real anchors (no interactive children, so ctrl/middle-click and keyboard work
for free); product cards use a delegated handler because they contain buttons and a
select, with the issue key additionally rendered as an anchor. The Radar, Bug Patterns and
Traceability rows are anchors too (`target="_blank" rel="noopener"`); Radar rows keep their
triage buttons OUTSIDE the anchor, because interactive content inside `<a>` is invalid.
`IssueDetailDrawer` is still reached from ChangelogDrawer, QuickSearchPalette and the `o`
keyboard shortcut, so it stays.

### Link rows snapshot the issue at the far end
Jira embeds the linked issue's summary/status/issuetype inside each issuelink, so sync
stores them on the row as `target_summary` / `target_status` / `target_status_category` /
`target_type` (`linkTargetSnapshot()`). `getLinkedIssues()` prefers the synced issue and
falls back to that snapshot, so a linked issue that was never synced on its own still
shows its type and status instead of reading "Not synced" — which is what an uncached
epic used to look like. Only rows whose `source_key` IS the issue being queried carry a
usable snapshot: a row written from the far side describes the other issue.

### Routes decide the view; params only filter it
The old All Issues heuristic ("a `customer` param means All Issues") is gone with that view.
`resolveInitialView()` looks at the route alone. Each view reads its own params in `load()`
— Product Board `customer/priority/reporter/search`, Radar `area/parked`, Bug Patterns
`sort/team/sel`, Traceability `tab/bugs/parked` — and writes them back with
`updateQueryParams()` so the address bar is the saved state.

### Uncached epics are hydrated on demand
`sync.js` walks BOARDS, so an epic sitting on no board — and its children — is absent
from the local store entirely. That showed as an epic row with no summary and no
children (TSM2-5515 "Complicated Evaluation Module", ten children in Jira).
`db/epic-hydrator.js` fetches the epic (`getIssue`) and its children
(`getEpicIssues` -> `/rest/agile/1.0/epic/{key}/issue`) after first paint, for the epics
ON SCREEN only, and writes them into the `issues` store so every other view benefits and
the data survives a reload. Records are flagged `hydrated: true`; a later full sync
overwrites them with the complete field set. Failures are silent — the view has already
rendered. `CustomerDashboardView._hydrating` exposes the in-flight run: the dedupe set is
marked before the fetch resolves, so a second concurrent call would otherwise
short-circuit while the first is still landing.

### Epic children come from the parent_key index
`getChildIssues()` reads the `parent_key` index (DB_VERSION 9). `withEpicChildren()`
attaches them to epic links ONLY — expanding every link would multiply reads for no
benefit. The dashboard renders them inside the epic's bordered group behind a left rail,
with a label naming the parent, so the hierarchy is unmistakable. Children are searchable
through `customerSearchText()`.

### Customer cards are a Jira issue TYPE, not the customer field
A customer card is a TSM2 issue of type `Customer` (e.g. TSM2-7612 "UOL Customer Card")
living on the Customer Testing Board, board 22. `getCustomerCards()` selects on that
type — NOT on the product card's `customer` text field, and not on PDT, whose own issue
type is `Customer Request`. `TYPE_CHIPS` matches Epic loosely (`\bepic\b`, so
"Delivery Epic" counts) but Customer EXACTLY (`^customer$`), or every PDT card would
read as a customer.

### Linked-issue chips show a TYPE where the type says more than the status
`typeChip()` in `product-config.js`: an epic is a container and a customer card is a
customer, so both show their type (EPIC / CUSTOMER) instead of a workflow status, with
the real status moved to the tooltip. Everything else shows its status.

### Epic links are marked in orange
`isEpicType()` in `product-queries.js` matches the issue type NAME (`/\bepic\b/i`) —
the cached issue record has no hierarchy level. `linked_issues` carries `issue_type`
and `is_epic`; the status chip reads EPIC for an epic regardless of its actual status
(which moves to the tooltip), the Product Board rings the chip AND the whole card in
`--warning`, and
`IssueDetailDrawer.renderLinkedIssues()` does the same from the raw Jira payload. Orange
is reserved for this on the Product Board, so it does not collide with any status colour.

### Product issue links are re-fetched per issue, not trusted from the board sweep
`syncProductIssueLinks()` in `sync.js` calls `getIssue(key, ['issuelinks'])` for every
issue in the Product project after the board sweep, and rewrites its link rows. The
agile board endpoint is not a reliable source: a board with sprints only returns
sprint-assigned issues, and its field set is not guaranteed to carry `issuelinks`.
PDT-39 has four Polaris links but showed one — the single row written from the other
end by whichever linked TSM2 issue happened to sync. Scoped to the Product project, so
it is tens of requests, not thousands.

### Standup cards show Created and Updated, both labelled
Two dates on a card need labels: an unlabelled pair reads as a duplicate, which is what
happened when the card foot showed `updated_at` and the "Updated by" row showed the
changelog timestamp. `created_at` and `updated_at` are now a labelled pair, and the
"Updated by" row carries the name only.

### "Last updated by" needs the changelog, and costs 2 calls per issue
Jira has no such field; `updated` carries no author. `JiraClient.getLastChangeAuthor()`
reads `/issue/{key}/changelog`, which pages oldest-first with no sort option — so the
newest entry needs one call for the total and one for the final page. StandupView calls
it only for the cards currently on screen, after first paint, and renders without it if
it fails. Do NOT move this into sync: it would scale with the whole issue set.

### Read issue links with getByIndex, not queries.js getIssueLinks
`getIssueLinks()` runs two sequential cursor scans inside ONE transaction.
IndexedDB auto-commits a transaction once its request queue drains, so the second
scan can hit an inactive transaction and return nothing — which surfaced as only
some of an issue's links appearing (PDT-39 has four Polaris links; fewer showed).
`product-queries.js` `readLinkRows()` uses two `getByIndex` calls instead, each in
its own transaction.

### Custom fields detected by NAME go through field-resolver.js
`FIELD_PATTERNS` matches a field's DISPLAY NAME, which issue payloads do not carry —
they key custom fields by id only. `db/field-resolver.js` resolves ids once per sync
from `/rest/api/3/field` (`JiraClient.getFields()`), and `sync.js` holds the result in
`resolvedFieldIds`. Matching the patterns against the `customfield_NNNNN` key, as this
app originally did, can never fire: a key holds no human words, so `product` and
`qaTester` were silently always null. An explicit id in `CUSTOM_FIELDS` still wins;
missing field metadata degrades to the configured ids rather than failing the sync.
Verified names here: "Story Points" = customfield_10014, "QA Tester" = customfield_10040,
"QA Reviewer" = customfield_10041.

### Story Points is customfield_10014 here
Not the usual `customfield_10016`/`_10026`, which do not exist on this instance.
Set in `jira-config.js` as `CUSTOM_FIELDS.storyPoints`; sync copies it to
`story_points` on the issue record.

### Descriptions can be a STRING or an ADF object
`IssueDetailDrawer.renderDescription()` handles both. A plain string gets
`white-space: pre-wrap` — passing a long markdown-ish description through
`escapeHtml` alone collapses it into one unreadable wall (PDT-39's description is
several screens of tables).

### Product Board ownership
`issues` is a Jira mirror and is overwritten by every sync — never write to it.
`product_cards` is locally owned and survives syncs. `assigned_engineer_*` is
*derived* from the linked Eng card: re-run `refreshAllAssignedEngineers()` after
a sync rather than editing it by hand.

### `escapeHtml` is for TEXT, `escapeAttr` is for ATTRIBUTES
`escapeHtml` escapes via `textContent` -> `innerHTML`, which does NOT escape quotes (they are not
special in text). Interpolating its output into a quoted attribute lets `" onmouseover="alert(1)`
break out and become a real event handler. Use `escapeAttr()` for anything inside `attr="..."`.
Both live in `src/utils/html.js` — always import them from there, never re-define a local copy
(local copies of `escapeHtml` used to be scattered across components and all carried this flaw).

Rule of thumb:

| Position | Helper |
|---|---|
| Text content — `>${...}<` | `escapeHtml` |
| Anywhere inside `attr="..."`, including mid-attribute (`title="Priority: ${...}"`) | `escapeAttr` |

Audit with `grep -rn '="[^"]*\${escapeHtml' src/components/` — it should return nothing.

### Container ID must exist in loading state
Component `render()` returns `<div id="my-view">` wrapper. Loading spinners must also be inside this wrapper or `refresh()` can't find the container after async load → endless spinner.

### `getAll(ISSUES)` performance
The three PM views each do ONE `getAll('issues')` per load and compute everything in memory
— fine at ~7,500 issues. What must never come back is a `getAll` inside a per-page loop:
`upsertIssues()` used to read the whole store once per page of every sprint, which is what
stalled production syncs. Use `getMany(store, keys)` for a batch, `count(store)` for a number.

### URL params are strings; coerce in the view
`parseRoute()` returns strings (or arrays when a param repeats). Views coerce as they read:
`parked === '1'`, `first(params.customer)`. The old shared `paramsToFilters()` vocabulary was
removed with All Issues; do not reintroduce a global filter vocabulary.

### Completion is derived from status CATEGORY, never from `resolved_at`
TSM2's workflow never sets a Jira resolution: 5,627 of 5,628 Done-category issues have
none, so `resolutiondate`/`resolved_at` is null project-wide. Anything computed from it reads
zero — which is how the old throughput, cycle-time, CFD and burndown views showed nothing
for months. Use `isCompleted()` / `completedAt()` / `completedWithin()` from
`utils/completion.js`; the date falls back to `updated_at`, and says so.

### Parked work is excluded by RULE, then by hand
"Untouched for a long time" is not neglect — much of it is deliberate. `utils/parked.js`
detects the conventions actually in use: customer field `Archived`, or a title starting with
`[Archived]` `[KIV]` `[On Hold]` `[WIP]` `[Duplicated]` (leading bracket tags only; `[RAW]`
and `[Gateway]` are not parking). A PM can also park anything with the ⏸ chip, stored as a
`triage:parked` tag. Every "needs attention" list filters both by default and reports how
many it hid.

### Team area (Project / Integration / Core) is INFERRED
Nobody records it in Jira. `utils/team-area.js` decides by whole-word title keywords
(Integration), then issue type / customer=internal (Core), else Project. It will misfire
— "Sync with line item field" reads as Integration — so treat the tables as tunable, and if
the team ever records the area in a field, replace the rules with a lookup.

### Product area (bug dictionary) is a PRIORITY-ORDERED list
`utils/product-area.js` returns the FIRST matching area, so order encodes specificity
(Gateway before Invoicing, catch-alls last). Patterns are whole-word where a substring would
lie (`\btenders?\b`, because "tenderboard_inbound_log" is not sourcing). The explorer's
"phrases not named yet" panel is the tuning input; bracketed words are kept for exactly that.

### TTS has no agile board, so it is synced by JQL
The board sweep never reaches a Jira "business" project. `EXTRA_SYNC_PROJECTS` (default
`TTS`) is fetched with `client.searchJql('project = KEY')` — `/rest/api/3/search/jql`, paged
by `nextPageToken`, checkpointed per project. Mock clients in tests need a `searchJql` stub or
the step logs a warning.

### Sync checkpoints are per MODE
`sync_progress_full` and `sync_progress_incremental` are separate keys. A single key let the
5-minute background incremental sync overwrite an interrupted full sync's progress — and an
incremental run can never fill the gaps a full run left. `syncIncremental` clears only its
own key; `syncAll` clears both.

## Read-Only Rule — Hard Constraint

**Never add Jira write methods.** The app is deliberately read-only.
- `api/jira.js` — only GET operations
- `db/sync.js` — only fetches and caches
- `db/indexeddb.js` — local writes OK (tags, saved views, metadata, changelog, issuelinks)
- `CreateIssueModal.js` exists as dead code — do not import or wire up
- Drafted product cards reach Jira via HANDOFF, not a write: `utils/product-handoff.js`
  builds a prefilled create-issue URL (plus a copyable REST payload) for a human to
  click. `markHandedOff()` flags the draft; `adoptHandedOffDrafts()` in `product-sync.js`
  joins it to the real issue on the next sync by exact normalised title, only when
  exactly one unclaimed issue matches.
- The one `method: 'POST'` in `api/jira.js` is `/rest/api/3/search` — a READ. Jira
  requires POST to send a JQL body. It is not an exception to the rule.

## Adding a New View

1. Add the route constant to `src/utils/router.js` (`ROUTES.MYVIEW`) and its mapping in
   `BY_ROUTE` in `src/utils/initial-view.js`.
2. Add an icon to `src/utils/nav-icons.js` (24×24, stroke-only, `currentColor`).
3. Add one entry to `VIEWS` in `src/main.js`: `{ route, title, icon, create, load, reloadOnParams }`.
   The tab, click handling, mounting, URL normalisation and active state all follow from it.
4. Import the component and append `${MyViewStyles || ''}` in `addGlobalStyles()`.
5. Optionally add a `g`+key in `GOTO_MAP` / `SHORTCUTS` in `KeyboardShortcuts.js`.
6. Add the route to the `initial-view.test.js` round-trip test.

Pattern: `mountView()` does `cleanupCurrentView()` → `ensureDatabase()` → `create()` → render
into `#view-container` → `load(view, params)`. A hashchange on an already-mounted view calls
`load()` again only when `reloadOnParams` is true AND `view.isLoading` is false.

## Component Pattern

```js
import { escapeHtml } from '../utils/html.js';
import { formatDate } from '../utils/date.js';

export class MyComponent {
  constructor(client, jiraDomain) { ... }
  get filters() { return { /* what load() accepts; the app passes it back on refresh */ }; }
  destroy() { this._destroyed = true; }
  async load(filters = {}) {
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

Key: `#my-view` ID must be in both loading and loaded HTML. `isLoading` is read by the router to
skip a redundant reload; `destroy()` must make a late `load()` a no-op (check a flag after every await).

## Dead Code (do not extend)

Nothing known at the moment. The 2026-09 prune deleted the Board, All Issues, Roadmap,
Dashboard, Velocity, Team, Aging, Releases, Flow and Dependency views with their helpers
(`BoardSelector`, `IssueBoard`, `IssueCard`, `TableView`, `FilterPanel`, `SavedViewsMenu`,
`TagsManager`, `BackButton`) and ~40 query functions. If something is unused, delete it —
do not leave it hidden.

## Production

- `npm run verify` = lint + tests + build. CI (`.github/workflows/ci.yml`) runs the
  same gate on every push; `.nvmrc` pins Node so CI and laptops agree.
- **A reverse proxy is mandatory off localhost.** Atlassian Cloud sends no CORS
  headers for arbitrary origins, so a browser on a deployed host cannot call
  `atlassian.net` directly — this is why `vite.config.js` proxies `/rest`, `/agile`
  and `/wiki`. `deploy/nginx.conf` does the same in production; build with
  `VITE_USE_PROXY=true` so `utils/proxy.js` issues same-origin requests.
- CSP needs `style-src 'unsafe-inline'` (runtime `<style>` injection in
  `addGlobalStyles` plus ~50 inline style attributes) but NOT for `script-src` —
  there is no eval or inline script. Tests in `__tests__/deploy-config.test.js`
  pin that distinction.
- `sw.js` must be served `no-store`, or a released fix cannot reach a browser that
  already registered an older worker.
- `VITE_AUTH_MODE=proxy` moves the Atlassian credential to the reverse proxy:
  `JiraClient` sends no `Authorization` header, `SettingsPanel` shows no form and
  `saveCredentials()` refuses to write. It requires `VITE_USE_PROXY=true` and
  `VITE_JIRA_DOMAIN`, and the proxied routes MUST sit behind your own auth —
  `deploy/nginx.conf` gates them with `auth_request`, whose stub denies so a
  half-finished deploy fails closed. Default stays `browser`.
- `RELEASING.md` is the runbook, including what `proxy` mode trades away (one
  shared Jira identity, no per-user audit trail).

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

`VITE_JIRA_DOMAIN` env var sets the proxy target (default: `tenderboard.atlassian.net`). In dev, API calls go through Vite proxy at `/rest`, `/agile` and `/wiki` (Confluence) to avoid CORS. In production, calls go direct to `https://{domain}`.

**Never put an API token in a `VITE_`-prefixed var.** Vite inlines those into the
public bundle. Tokens go through `utils/storage.js` (AES-GCM in localStorage).
See `.env.example`.

## Known Bug Patterns

| Bug | Cause | Fix |
|-----|-------|-----|
| Endless loading | Loading HTML missing `#my-view` wrapper | Wrap spinner in container div |
| Duplicate event listeners | `addEventListener` called twice | Guard flag or event delegation |
| Filter 0 results | String ID vs Number ID | `Number(val)` on select change |
| Date mutation | `new Date(date).setMonth()` mutates original | Clone: `new Date(new Date(date).setMonth(...))` |
| CSS var in @keyframes | Not animatable | Use `transform`/`clip-path` |
| Retry button crash | Wrong method name | Check method exists on view instance |
| Attribute injection | `escapeHtml` in `attr="${...}"` | Use `escapeAttr` — escapeHtml leaves quotes |

## Environment Quirks

- Credentials encrypted with AES-GCM (Web Crypto). Requires secure context (HTTPS or localhost).
- `?log=debug` URL param enables verbose logging at runtime.
- Cmd+K / Ctrl+K opens quick search palette.
- Offline banner shown via `navigator.onLine` events.
