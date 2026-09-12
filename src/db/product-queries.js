/**
 * Product Board Queries
 *
 * Data access for the Product Board (`product_cards`) and its documentation
 * drafts (`doc_drafts`). Kept out of `queries.js` deliberately — that file is
 * already ~1800 lines and owns the Engineering Board / issue-cache queries.
 *
 * Ownership model:
 *   - `issues`        — mirror of Jira, overwritten by every sync. Never edit.
 *   - `product_cards` — locally owned. A card MAY point at a Jira product issue
 *                       (`product_issue_key`) and at an engineering issue
 *                       (`eng_issue_key`), but it survives independently of both.
 *   - `doc_drafts`    — local Markdown, many drafts per card.
 *
 * The read-only Jira rule still applies: nothing here writes to Jira.
 */

import {
  initDatabase,
  get,
  getAll,
  getByIndex,
  put,
  del,
  STORE_NAMES as STORES
} from './indexeddb.js';

import {
  ENG_LINK_TYPES,
  BOARD_IDS,
  PRODUCT_CUSTOM_FIELDS,
  MILESTONE_STATUSES,
  MILESTONE_LABELS,
  ENG_DERIVED_STATUSES,
  ENG_PROJECT_KEY
} from '../product-config.js';
import {
  PRIORITY_ORDER, DOC_STATUSES, DOC_SETTLED,
  typeChip, CUSTOMER_ISSUE_TYPE, ENG_PROJECT_KEY as ENG_KEY
} from '../product-config.js';
import { adfToText } from '../utils/adf.js';
import { fuzzyMatch } from '../utils/fuzzy.js';
import logger from '../utils/logger.js';

/**
 * Shape a product card, filling defaults so every record has the same keys.
 * @param {object} input
 * @returns {object}
 */
function normalizeCard(input = {}) {
  return {
    product_issue_key: input.product_issue_key || null,
    title: input.title || null,
    description: input.description || null,
    customer: input.customer || null,
    user_persona: input.user_persona || null,
    status: input.status || 'Draft',
    eng_issue_key: input.eng_issue_key || null,
    assigned_engineer_id: input.assigned_engineer_id || null,
    assigned_engineer_name: input.assigned_engineer_name || null,
    eng_status: input.eng_status || null,
    link_source: input.link_source || null,
    reporter_name: input.reporter_name || null,
    // When the JIRA issue last changed. Distinct from `updated_at`, which is
    // this local record's write time and is refreshed by every reconciliation —
    // sorting by that would be sorting by sync order, not by activity.
    jira_updated_at: input.jira_updated_at || null,
    // Assignee ON THE PRODUCT ISSUE itself. Distinct from
    // assigned_engineer_name, which comes from the linked Eng card.
    assignee_name: input.assignee_name || null,
    priority: input.priority || null,
    // Every issue linked to the product issue, Eng card included, as
    // { key, status, status_category }. Refreshed from the `issuelinks` store
    // on each reconciliation. Status comes from the local issue cache and is
    // null for links whose target has not been synced.
    linked_issues: input.linked_issues || [],
    // Stamped when the draft is handed to a human to create in Jira; cleared
    // once sync adopts the resulting issue key.
    handed_off_at: input.handed_off_at || null,
    // Documentation workflow — locally owned, never touched by sync.
    doc_status: input.doc_status || 'not_started',
    doc_updated_at: input.doc_updated_at || null,
    milestones: input.milestones || {},
    created_at: input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// ==================== Product Cards ====================

/**
 * Create a product card. Returns the generated local ID.
 * @param {object} card
 * @returns {Promise<number>}
 */
export async function createProductCard(card) {
  await initDatabase();
  const record = normalizeCard(card);
  const id = await put(STORES.PRODUCT_CARDS, record);
  logger.debug(`[ProductBoard] Created card ${id}`, record.product_issue_key);
  return id;
}

/**
 * Partially update a product card by local ID.
 * @param {number} id
 * @param {object} patch
 * @returns {Promise<object|null>} the updated card, or null if not found
 */
export async function updateProductCard(id, patch = {}) {
  await initDatabase();
  const numericId = Number(id);
  const existing = await get(STORES.PRODUCT_CARDS, numericId);
  if (!existing) {
    logger.warn(`[ProductBoard] updateProductCard: no card with id ${numericId}`);
    return null;
  }
  const updated = {
    ...existing,
    ...patch,
    id: numericId,
    created_at: existing.created_at,
    updated_at: new Date().toISOString()
  };
  await put(STORES.PRODUCT_CARDS, updated);
  return updated;
}

/**
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getProductCard(id) {
  await initDatabase();
  return get(STORES.PRODUCT_CARDS, Number(id));
}

/**
 * @param {string} issueKey - Jira product issue key, e.g. "PROD-12"
 * @returns {Promise<object|null>}
 */
export async function getProductCardByIssueKey(issueKey) {
  await initDatabase();
  const matches = await getByIndex(STORES.PRODUCT_CARDS, 'product_issue_key', issueKey);
  return matches[0] || null;
}

/**
 * Everything about a card that search should look at, as one string.
 *
 * Built once per card rather than per keystroke: the issue key, title and
 * description, plus every linked issue's key, summary and description.
 *
 * @param {object} card
 * @returns {string}
 */
export function buildSearchText(card) {
  const linked = card.linked_issues || [];
  return [
    card.product_issue_key,
    card.title,
    card.description,
    card.customer,
    card.reporter_name,
    card.assignee_name,
    card.assigned_engineer_name,
    ...linked.flatMap(l => [
      l.key, l.summary, l.description,
      ...(l.children || []).flatMap(c => [c.key, c.summary])
    ])
  ].filter(Boolean).join(' ');
}

/**
 * Sort cards by when their Jira issue last changed, newest first.
 *
 * Falls back to the local record time for cards with no Jira issue (local
 * drafts), and pushes cards with neither to the end rather than letting an
 * Invalid Date scramble the order.
 *
 * @param {object[]} cards
 * @returns {object[]} the same array, sorted in place
 */
export function sortByLastUpdated(cards) {
  const stamp = (card) => {
    const value = card.jira_updated_at || card.updated_at;
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? -Infinity : time;
  };
  return cards.sort((a, b) => stamp(b) - stamp(a));
}

/**
 * Does a card match a search query?
 *
 * Two passes with different strictness:
 *   - the full blob (description, linked issue text) is matched on substrings
 *     only — subsequence matching over that much text matches almost anything;
 *   - the key and title, being short and high-signal, additionally allow
 *     subsequence matching so "bulktnd" still finds "Bulk tender upload".
 *
 * @param {object} card
 * @param {string} query
 * @returns {boolean}
 */
export function cardMatchesSearch(card, query) {
  if (!query || !String(query).trim()) return true;

  if (fuzzyMatch(buildSearchText(card), query, { allowSubsequence: false })) return true;

  const headline = [card.product_issue_key, card.title].filter(Boolean).join(' ');
  return fuzzyMatch(headline, query);
}

/**
 * The status a card effectively sits at, taking the linked Eng card into
 * account. A product card often lags its Eng card (still "Eng WIP" while
 * engineering has moved to "Ready to Test"), and the user thinks in terms of
 * the further-along state.
 *
 * @param {object} card
 * @returns {string|null}
 */
export function getEngDerivedStatus(card) {
  const milestones = card?.milestones || {};
  // Released supersedes ready-to-test when both have been reached.
  if (milestones.released) return ENG_DERIVED_STATUSES.released;
  if (milestones.ready_to_test) return ENG_DERIVED_STATUSES.ready_to_test;
  return null;
}

/**
 * Whether a card matches a status filter value, on either its own status or the
 * status derived from its Eng card.
 *
 * @param {object} card
 * @param {string[]} wanted
 * @returns {boolean}
 */
function matchesStatus(card, wanted) {
  if (wanted.includes(card.status)) return true;
  const derived = getEngDerivedStatus(card);
  return derived ? wanted.includes(derived) : false;
}

/**
 * Distinct values available for the Product Board filter controls.
 * @returns {Promise<{customers: string[], reporters: string[], priorities: string[]}>}
 */
export async function getProductBoardFilterOptions() {
  const cards = await getProductCards();

  const collect = (field) => [...new Set(
    cards.map(c => c[field]).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const present = new Set(cards.map(c => c.priority).filter(Boolean));

  return {
    customers: collect('customer'),
    reporters: collect('reporter_name'),
    // Ordered by severity rather than alphabetically, and limited to values
    // actually in use so the control does not list priorities no card has.
    priorities: PRIORITY_ORDER.filter(p => present.has(p))
      .concat([...present].filter(p => !PRIORITY_ORDER.includes(p)).sort())
  };
}

/**
 * List product cards, newest first.
 * @param {object} [filters] - { status, customer, userPersona, assignedEngineerId }
 * @returns {Promise<object[]>}
 */
export async function getProductCards(filters = {}) {
  await initDatabase();
  let cards = await getAll(STORES.PRODUCT_CARDS);

  if (filters.status) {
    const wanted = Array.isArray(filters.status) ? filters.status : [filters.status];
    cards = cards.filter(c => matchesStatus(c, wanted));
  }
  if (filters.customer) {
    cards = cards.filter(c => c.customer === filters.customer);
  }
  if (filters.userPersona) {
    cards = cards.filter(c => c.user_persona === filters.userPersona);
  }
  if (filters.priority) {
    const wanted = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
    cards = cards.filter(c => wanted.includes(c.priority));
  }
  if (filters.reporter) {
    cards = cards.filter(c => c.reporter_name === filters.reporter);
  }
  if (filters.search) {
    cards = cards.filter(c => cardMatchesSearch(c, filters.search));
  }
  if (filters.assignedEngineerId) {
    cards = cards.filter(c => c.assigned_engineer_id === filters.assignedEngineerId);
  }

  return sortByLastUpdated(cards);
}

/**
 * Delete a product card and every draft attached to it.
 * @param {number} id
 */
export async function deleteProductCard(id) {
  await initDatabase();
  const numericId = Number(id);
  const drafts = await getByIndex(STORES.DOC_DRAFTS, 'product_card_id', numericId);
  for (const draft of drafts) {
    await del(STORES.DOC_DRAFTS, draft.id);
  }
  await del(STORES.PRODUCT_CARDS, numericId);
  logger.debug(`[ProductBoard] Deleted card ${numericId} and ${drafts.length} draft(s)`);
}

// ==================== Eng Card Linking ====================

/**
 * Read the Eng issue key out of a custom field on the cached product issue.
 * Handles the field being a plain string, an option object, or a link object.
 * @param {object} productIssue - record from the `issues` store
 * @returns {string|null}
 */
function readEngKeyCustomField(productIssue) {
  const fieldId = PRODUCT_CUSTOM_FIELDS.engIssueKey;
  if (!fieldId || !productIssue?.raw_data) return null;

  let raw;
  try {
    raw = JSON.parse(productIssue.raw_data);
  } catch {
    return null;
  }

  const value = raw?.fields?.[fieldId];
  if (!value) return null;

  const text = typeof value === 'string'
    ? value
    : value.value || value.key || value.name || null;
  if (!text) return null;

  // Tolerate "ENG-42", "See ENG-42", or a browse URL.
  const match = String(text).match(/[A-Z][A-Z0-9]+-\d+/);
  return match ? match[0] : null;
}

/**
 * Find the Engineering issue linked to a product issue.
 *
 * An Engineering Lead may connect the two in any of several ways, so this tries
 * each in descending order of explicitness and reports which one matched:
 *
 *   1. `custom_field`  — a field on the product issue naming the Eng key
 *   2. `issue_link`    — a Jira issue link of a type in ENG_LINK_TYPES
 *   3. `epic_parent`   — an issue whose parent/epic IS the product issue
 *   4. `issue_link_any`— any remaining issue link (weakest signal)
 *
 * Candidates on the configured Engineering board are preferred within a
 * strategy; the product issue itself is never returned.
 *
 * @param {string} productIssueKey
 * @returns {Promise<{key: string, source: string}|null>}
 */
export async function detectEngIssueLink(productIssueKey) {
  if (!productIssueKey) return null;
  await initDatabase();

  const productIssue = await get(STORES.ISSUES, productIssueKey);

  // 1. Explicit custom field on the product issue.
  const fromField = readEngKeyCustomField(productIssue);
  if (fromField && fromField !== productIssueKey) {
    return { key: fromField, source: 'custom_field' };
  }

  const links = await readLinkRows(productIssueKey);

  // getIssueLinks matches on both source_key and target_key, so the linked
  // issue is whichever end is NOT the product issue.
  const otherEnd = link => (
    link.source_key === productIssueKey ? link.target_key : link.source_key
  );

  /**
   * Is this issue an Engineering card? Prefer the project key (TSM2), which
   * holds regardless of which board the issue sits on; fall back to the board
   * id when the issue is not cached with a project key.
   */
  const engBoardId = BOARD_IDS.engineering;
  const isEngIssue = async (key) => {
    if (ENG_PROJECT_KEY && String(key).startsWith(`${ENG_PROJECT_KEY}-`)) return true;
    const issue = await get(STORES.ISSUES, key);
    if (!issue) return false;
    if (ENG_PROJECT_KEY && issue.project_key === ENG_PROJECT_KEY) return true;
    return engBoardId ? Number(issue.board_id) === Number(engBoardId) : false;
  };

  /**
   * Pick the best candidate, preferring one on the Engineering board.
   *
   * `requireEng` applies to every link-derived strategy once the Engineering
   * project is known: an Eng card lives in that project by definition, so a
   * linked issue outside it — a design ticket, an MDP item, a duplicate — must
   * never be adopted, or its status drives false Ready-to-Test / Released
   * alerts. This matters even for "strong" link types, because generic ones
   * like "Relates" are used for both delivery links and plain cross-references.
   *
   * Only the explicit custom field (strategy 1) bypasses this, since naming a
   * key by hand is an unambiguous statement of intent.
   */
  const choose = async (keys, requireEng = false) => {
    const unique = [...new Set(keys)].filter(k => k && k !== productIssueKey);
    for (const key of unique) {
      if (await isEngIssue(key)) return key;
    }
    if (requireEng && (ENG_PROJECT_KEY || engBoardId)) return null;
    return unique[0] || null;
  };

  // 2. Issue links whose type means "delivered by".
  const typed = links.filter(
    l => ENG_LINK_TYPES.includes((l.link_type || '').toLowerCase())
  );
  const typedKey = await choose(typed.map(otherEnd), true);
  if (typedKey) return { key: typedKey, source: 'issue_link' };

  // 3. Epic / parent: an issue that names the product issue as its parent.
  let children = [];
  try {
    children = await getByIndex(STORES.ISSUES, 'parent_key', productIssueKey);
  } catch (error) {
    // Older databases predate the parent_key index (added in DB_VERSION 9).
    logger.warn('[ProductBoard] parent_key index unavailable:', error.message);
  }
  const childKey = await choose(children.map(c => c.key), true);
  if (childKey) return { key: childKey, source: 'epic_parent' };

  // 4. Any remaining link — only trusted when it is an Engineering issue
  //    (see requireEng above).
  const anyKey = await choose(links.map(otherEnd), true);
  if (anyKey) return { key: anyKey, source: 'issue_link_any' };

  return null;
}

/**
 * Is this Jira issue type an epic?
 *
 * Matched on the type NAME rather than hierarchy level, which the cached issue
 * record does not carry. Case-insensitive, and tolerant of renamed types that
 * still contain the word ("Epic Story", "Delivery Epic").
 *
 * @param {string|null} issueType
 * @returns {boolean}
 */
export function isEpicType(issueType) {
  return /\bepic\b/i.test(String(issueType || ''));
}

/**
 * Raw link rows touching an issue, from either end.
 *
 * Uses getByIndex (one transaction per scan) rather than queries.js
 * getIssueLinks, which runs two sequential cursor scans inside a SINGLE
 * transaction. IndexedDB auto-commits a transaction once its request queue
 * drains, so the second scan there can hit an already-inactive transaction and
 * silently return nothing — which showed up as only some of an issue's links
 * appearing on the board.
 *
 * @param {string} issueKey
 * @returns {Promise<object[]>}
 */
async function readLinkRows(issueKey) {
  const [asSource, asTarget] = await Promise.all([
    getByIndex(STORES.ISSUELINKS, 'source_key', issueKey),
    getByIndex(STORES.ISSUELINKS, 'target_key', issueKey)
  ]);
  return [...asSource, ...asTarget];
}

/**
 * Every issue linked to a product issue, with its cached status.
 *
 * Broader than detectEngIssueLink(): that picks the ONE Eng card that owns
 * delivery, this lists everything connected (design tickets, dependencies,
 * duplicates) for display on the card.
 *
 * @param {string} productIssueKey
 * @returns {Promise<Array<{key: string, status: string|null, status_category: string|null}>>}
 */
export async function getLinkedIssues(productIssueKey) {
  if (!productIssueKey) return [];
  await initDatabase();

  const links = await readLinkRows(productIssueKey);
  const keys = links.map(link => (
    link.source_key === productIssueKey ? link.target_key : link.source_key
  ));

  const unique = [...new Set(keys)].filter(k => k && k !== productIssueKey).sort();

  // Snapshot Jira embedded in the link itself, keyed by the linked issue.
  // Only rows written from THIS issue's side describe the other end; a row
  // recorded from the far side describes this issue instead.
  const snapshotByKey = new Map();
  for (const link of links) {
    if (link.source_key !== productIssueKey || !link.target_key) continue;
    if (!snapshotByKey.has(link.target_key)) snapshotByKey.set(link.target_key, link);
  }

  return Promise.all(unique.map(async (key) => {
    const issue = await get(STORES.ISSUES, key);
    const snap = snapshotByKey.get(key) || {};

    // Prefer the synced issue — it is fresher and has every field — and fall
    // back to the link snapshot, so a linked issue that was never synced still
    // shows its type and status rather than reading as "Not synced".
    const issueType = issue?.issue_type || snap.target_type || null;

    return {
      key,
      status: issue?.status || snap.target_status || null,
      // Jira does not embed the assignee in a link payload, so this is only
      // known for issues that have actually synced.
      assignee_name: issue?.assignee_name || null,
      status_category: issue?.status_category || snap.target_status_category || null,
      // Carried for search: the linked ticket's own wording is often how
      // someone remembers a product item.
      summary: issue?.summary || snap.target_summary || null,
      description: adfToText(issue?.description),
      story_points: issue?.story_points ?? null,
      issue_type: issueType,
      // Epics get flagged on the board — a product card delivered by an epic is
      // a different size of commitment to one delivered by a task.
      is_epic: isEpicType(issueType),
      // Epic / Customer read better as a type than as a workflow status.
      type_chip: typeChip(issueType)
    };
  }));
}

/**
 * Back-compat wrapper returning just the linked Engineering issue key.
 * @param {string} productIssueKey
 * @returns {Promise<string|null>}
 */
export async function findLinkedEngIssueKey(productIssueKey) {
  const match = await detectEngIssueLink(productIssueKey);
  return match?.key || null;
}

/**
 * Resolve the assigned engineer for a card from its linked Engineering issue
 * and persist it onto the card, along with the Eng status and how the link was
 * found.
 *
 * The engineer is *derived* data: the Eng card in Jira is the source of truth,
 * so this should be re-run after each sync rather than edited by hand.
 *
 * @param {number} cardId
 * @returns {Promise<object|null>} the updated card
 */
export async function resolveAssignedEngineer(cardId) {
  await initDatabase();
  const card = await getProductCard(cardId);
  if (!card) return null;

  // A manually set eng_issue_key wins — someone corrected it by hand.
  let engKey = card.eng_issue_key;
  let linkSource = card.link_source || 'manual';

  if (!engKey) {
    const detected = await detectEngIssueLink(card.product_issue_key);
    engKey = detected?.key || null;
    linkSource = detected?.source || null;
  }

  const linkedIssues = await getLinkedIssues(card.product_issue_key);

  if (!engKey) {
    return updateProductCard(cardId, {
      eng_issue_key: null,
      link_source: null,
      eng_status: null,
      assigned_engineer_id: null,
      assigned_engineer_name: null,
      linked_issues: linkedIssues
    });
  }

  const engIssue = await get(STORES.ISSUES, engKey);
  if (!engIssue) {
    // Linked, but the Eng issue is not in the local cache yet (not synced, or
    // on a board the user has not selected). Keep the link, clear the engineer.
    logger.debug(`[ProductBoard] Eng issue ${engKey} not in local cache`);
    return updateProductCard(cardId, {
      eng_issue_key: engKey,
      link_source: linkSource,
      eng_status: null,
      assigned_engineer_id: null,
      assigned_engineer_name: null,
      linked_issues: linkedIssues
    });
  }

  const milestones = detectMilestones(card, engIssue);

  return updateProductCard(cardId, {
    eng_issue_key: engKey,
    link_source: linkSource,
    eng_status: engIssue.status || null,
    assigned_engineer_id: engIssue.assignee_id || null,
    assigned_engineer_name: engIssue.assignee_name || null,
    linked_issues: linkedIssues,
    milestones
  });
}

/**
 * Re-resolve engineers for every product card. Intended to run after a sync.
 * @returns {Promise<number>} number of cards refreshed
 */
export async function refreshAllAssignedEngineers() {
  await initDatabase();
  const cards = await getAll(STORES.PRODUCT_CARDS);
  for (const card of cards) {
    await resolveAssignedEngineer(card.id);
  }
  logger.info(`[ProductBoard] Refreshed engineers for ${cards.length} card(s)`);
  return cards.length;
}

// ==================== Jira Handoff ====================

/**
 * Record that a draft has been handed to a human to create in Jira.
 *
 * The app never creates the issue itself (read-only rule). This only marks the
 * card as awaiting adoption so `adoptHandedOffDrafts()` knows to look for it
 * and the UI can show "awaiting creation in Jira".
 *
 * @param {number} cardId
 * @returns {Promise<object|null>}
 */
export async function markHandedOff(cardId) {
  return updateProductCard(cardId, { handed_off_at: new Date().toISOString() });
}

/**
 * Local drafts that have been handed off but not yet matched to a Jira issue.
 * @returns {Promise<object[]>}
 */
export async function getAwaitingAdoption() {
  const cards = await getProductCards();
  return cards.filter(c => c.handed_off_at && !c.product_issue_key);
}

/**
 * Child work items of a parent issue (an epic's tasks).
 *
 * Uses the `parent_key` index added in DB_VERSION 9. Returns [] rather than
 * throwing on an older database that predates it.
 *
 * @param {string} parentKey
 * @returns {Promise<object[]>}
 */
export async function getChildIssues(parentKey) {
  if (!parentKey) return [];
  await initDatabase();

  let children = [];
  try {
    children = await getByIndex(STORES.ISSUES, 'parent_key', parentKey);
  } catch (error) {
    logger.warn('[ProductBoard] parent_key index unavailable:', error.message);
    return [];
  }

  return children
    .map(issue => ({
      key: issue.key,
      summary: issue.summary || null,
      status: issue.status || null,
      status_category: issue.status_category || null,
      assignee_name: issue.assignee_name || null,
      issue_type: issue.issue_type || null,
      story_points: issue.story_points ?? null
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

/**
 * Customer cards — Jira issues of type "Customer" on the Customer Testing
 * Board, each with its linked issues resolved.
 *
 * These are NOT product cards: a customer card represents a customer (e.g.
 * "UOL Customer Card", TSM2-7612) and links out to the work being tested for
 * them. The Customer Dashboard is built from these, not from PDT.
 *
 * @param {object} [filters] - { customer (issue key), search }
 * @returns {Promise<object[]>}
 */
export async function getCustomerCards(filters = {}) {
  await initDatabase();

  const all = await getAll(STORES.ISSUES);
  const wanted = String(CUSTOMER_ISSUE_TYPE).toLowerCase();
  const cards = all.filter(i =>
    String(i.issue_type || '').toLowerCase() === wanted
    && (!ENG_KEY || i.project_key === ENG_KEY)
  );

  const resolved = await Promise.all(cards.map(async (issue) => ({
    key: issue.key,
    title: issue.summary || issue.key,
    status: issue.status || null,
    status_category: issue.status_category || null,
    priority: issue.priority || null,
    assignee_name: issue.assignee_name || null,
    reporter_name: issue.reporter_name || null,
    updated_at: issue.updated_at || null,
    linked_issues: await withEpicChildren(await getLinkedIssues(issue.key))
  })));

  let out = resolved;

  if (filters.customer) {
    out = out.filter(c => c.key === filters.customer);
  }
  if (filters.search) {
    out = out.filter(c => customerMatchesSearch(c, filters.search));
  }

  // Most recently touched customer first.
  return out.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

/**
 * Attach child work items to any epic in a list of linked issues.
 *
 * Only epics are expanded: they are the containers, and pulling children for
 * every link would multiply the reads for no benefit.
 *
 * @param {object[]} links
 * @returns {Promise<object[]>}
 */
export async function withEpicChildren(links) {
  return Promise.all(links.map(async (link) => (
    link.is_epic ? { ...link, children: await getChildIssues(link.key) } : link
  )));
}

/**
 * Does a customer card match a search query?
 *
 * Same two-pass shape as cardMatchesSearch: substring-only against the full
 * blob, subsequence matching reserved for the short key + title. Running
 * subsequence matching over the whole blob finds almost any short query's
 * letters somewhere in order and matches everything.
 *
 * @param {object} card
 * @param {string} query
 * @returns {boolean}
 */
export function customerMatchesSearch(card, query) {
  if (!query || !String(query).trim()) return true;

  if (fuzzyMatch(customerSearchText(card), query, { allowSubsequence: false })) return true;

  const headline = [card.key, card.title].filter(Boolean).join(' ');
  return fuzzyMatch(headline, query);
}

/**
 * Everything on a customer card that search should look at.
 * @param {object} card
 * @returns {string}
 */
export function customerSearchText(card) {
  const linked = card.linked_issues || [];
  return [
    card.key, card.title, card.status, card.assignee_name, card.reporter_name,
    ...linked.flatMap(l => [
      l.key, l.summary, l.description,
      ...(l.children || []).flatMap(c => [c.key, c.summary])
    ])
  ].filter(Boolean).join(' ');
}

// ==================== Documentation workflow ====================

/**
 * Move a card's documentation to a new state.
 *
 * Settling documentation (done / not needed) also acknowledges the `released`
 * milestone: the prompt exists to get the document written, so once that
 * question is answered it should stop asking.
 *
 * @param {number} cardId
 * @param {string} status - a key from DOC_STATUSES
 * @returns {Promise<object|null>} the updated card
 */
export async function setDocStatus(cardId, status) {
  if (!DOC_STATUSES.some(s => s.key === status)) {
    logger.warn(`[ProductBoard] Unknown documentation status: ${status}`);
    return null;
  }

  const card = await getProductCard(cardId);
  if (!card) return null;

  const patch = { doc_status: status, doc_updated_at: new Date().toISOString() };

  if (DOC_SETTLED.includes(status) && card.milestones?.released) {
    patch.milestones = {
      ...card.milestones,
      released: {
        ...card.milestones.released,
        acknowledged: true,
        acknowledged_at: new Date().toISOString()
      }
    };
  }

  return updateProductCard(cardId, patch);
}

/**
 * Does this card still owe documentation?
 *
 * True once its Eng card has been released and the documentation has not been
 * settled either way.
 *
 * @param {object} card
 * @returns {boolean}
 */
export function needsDocumentation(card) {
  if (!card?.milestones?.released) return false;
  return !DOC_SETTLED.includes(card.doc_status || 'not_started');
}

// ==================== Milestone Triggers ====================

/**
 * Which milestone, if any, an Engineering status represents.
 * @param {object} engIssue - record from the `issues` store
 * @returns {string|null} milestone key
 */
export function milestoneForStatus(engIssue) {
  const status = (engIssue?.status || '').toLowerCase().trim();
  if (!status) return null;

  // "Ready to test" is checked first: a workflow can legitimately match both
  // lists, and the earlier milestone should not be masked by the later one.
  if (MILESTONE_STATUSES.ready_to_test.includes(status)) return 'ready_to_test';
  if (MILESTONE_STATUSES.released.includes(status)) return 'released';

  // No status-CATEGORY fallback on purpose — see MILESTONE_STATUSES. TSM2 files
  // "Tested", "Ready for Regression" and "Ready To Test" under the Done
  // category, none of which mean released.
  return null;
}

/**
 * Compute the milestone state for a card given its linked Eng issue.
 *
 * Milestones are STICKY and recorded once: `reached_at` is stamped the first
 * time a status matches and is not overwritten on later syncs, so a card that
 * moves Ready to Test -> In Progress -> Ready to Test keeps its original
 * timestamp and does not re-alert. `acknowledged` is owned by the UI.
 *
 * The `changelog` store is deliberately not used here — sync clears it every
 * run, so it cannot answer "has this card ever been released?".
 *
 * @param {object} card
 * @param {object} engIssue
 * @returns {object} the new `milestones` map
 */
export function detectMilestones(card, engIssue) {
  const milestones = { ...(card.milestones || {}) };
  const reached = milestoneForStatus(engIssue);
  if (!reached) return milestones;

  if (!milestones[reached]) {
    milestones[reached] = {
      reached_at: new Date().toISOString(),
      eng_issue_key: engIssue.key,
      status: engIssue.status || null,
      acknowledged: false
    };
    logger.info(
      `[ProductBoard] Milestone "${MILESTONE_LABELS[reached]}" reached via ${engIssue.key}`
    );
  }
  return milestones;
}

/**
 * Cards with at least one milestone the user has not acknowledged yet.
 * Intended to drive a badge / notification list on the Product Board.
 *
 * @param {string} [milestoneKey] - restrict to one milestone
 * @returns {Promise<object[]>} [{ card, milestone, label, reached_at, eng_issue_key }]
 */
export async function getPendingMilestones(milestoneKey = null) {
  const cards = await getProductCards();
  const pending = [];

  for (const card of cards) {
    for (const [key, value] of Object.entries(card.milestones || {})) {
      if (milestoneKey && key !== milestoneKey) continue;
      if (value?.acknowledged) continue;
      pending.push({
        card,
        milestone: key,
        label: MILESTONE_LABELS[key] || key,
        reached_at: value.reached_at,
        eng_issue_key: value.eng_issue_key
      });
    }
  }

  return pending.sort((a, b) => new Date(b.reached_at) - new Date(a.reached_at));
}

/**
 * Mark a milestone as seen so it stops appearing in getPendingMilestones().
 * @param {number} cardId
 * @param {string} milestoneKey
 * @returns {Promise<object|null>} the updated card
 */
export async function acknowledgeMilestone(cardId, milestoneKey) {
  const card = await getProductCard(cardId);
  if (!card?.milestones?.[milestoneKey]) return null;

  const milestones = {
    ...card.milestones,
    [milestoneKey]: {
      ...card.milestones[milestoneKey],
      acknowledged: true,
      acknowledged_at: new Date().toISOString()
    }
  };
  return updateProductCard(cardId, { milestones });
}

// ==================== Documentation Drafts ====================

/**
 * Create a documentation draft for a product card.
 * @param {number} productCardId
 * @param {string} markdown
 * @param {object} [meta] - { title, confluence_page_id }
 * @returns {Promise<number>} generated local ID
 */
export async function createDocumentationDraft(productCardId, markdown = '', meta = {}) {
  await initDatabase();
  const id = await put(STORES.DOC_DRAFTS, {
    product_card_id: Number(productCardId),
    title: meta.title || null,
    markdown,
    confluence_page_id: meta.confluence_page_id || null,
    last_saved: new Date().toISOString()
  });
  return id;
}

/**
 * Save Markdown content onto an existing draft, stamping `last_saved`.
 * @param {number} id
 * @param {string} markdown
 * @param {object} [meta]
 * @returns {Promise<object|null>}
 */
export async function saveDocumentationDraft(id, markdown, meta = {}) {
  await initDatabase();
  const numericId = Number(id);
  const existing = await get(STORES.DOC_DRAFTS, numericId);
  if (!existing) {
    logger.warn(`[ProductBoard] saveDocumentationDraft: no draft with id ${numericId}`);
    return null;
  }
  const updated = {
    ...existing,
    ...meta,
    id: numericId,
    markdown,
    last_saved: new Date().toISOString()
  };
  await put(STORES.DOC_DRAFTS, updated);
  return updated;
}

/**
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getDocumentationDraft(id) {
  await initDatabase();
  return get(STORES.DOC_DRAFTS, Number(id));
}

/**
 * All drafts for a card, most recently saved first.
 * @param {number} productCardId
 * @returns {Promise<object[]>}
 */
export async function getDraftsForCard(productCardId) {
  await initDatabase();
  const drafts = await getByIndex(STORES.DOC_DRAFTS, 'product_card_id', Number(productCardId));
  return drafts.sort((a, b) => new Date(b.last_saved) - new Date(a.last_saved));
}

/**
 * @param {number} id
 */
export async function deleteDocumentationDraft(id) {
  await initDatabase();
  await del(STORES.DOC_DRAFTS, Number(id));
}
