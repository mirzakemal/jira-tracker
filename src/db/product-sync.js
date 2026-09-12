/**
 * Product Board Sync
 *
 * Reconciles the local Product Board against the Jira mirror that `sync.js`
 * has already written into the `issues` store. Runs AFTER a normal sync.
 *
 * Division of labour:
 *   sync.js         — talks to Jira, fills `issues` / `issuelinks` (all boards)
 *   product-sync.js — pure local reconciliation, makes no network calls
 *
 * Because it never calls Jira, this stays inside the app's read-only rule and
 * is safe to re-run at any time (it is idempotent).
 *
 * Field ownership on a linked card:
 *   Jira-owned  — title, description, status, customer, user_persona,
 *                 eng_issue_key, assigned_engineer_*, eng_status
 *                 (refreshed every run; edit them in Jira, not here)
 *   Locally owned — milestone acknowledgements, documentation drafts, local id
 *                 (never overwritten)
 * A card with no `product_issue_key` is a pure local draft and is left alone.
 */

import logger from '../utils/logger.js';
import {
  initDatabase,
  getByIndex,
  getAll,
  STORE_NAMES as STORES
} from './indexeddb.js';
import {
  getProductCards,
  getProductCardByIssueKey,
  createProductCard,
  updateProductCard,
  resolveAssignedEngineer,
  getPendingMilestones,
  getAwaitingAdoption
} from './product-queries.js';
import { PRODUCT_PROJECT_KEY, PRODUCT_CUSTOM_FIELDS, BOARD_IDS } from '../product-config.js';
import { adfToText } from '../utils/adf.js';

/**
 * Pull a custom field value off a cached issue's raw Jira payload.
 * @param {object} issue
 * @param {string|null} fieldId
 * @returns {string|null}
 */
function readCustomField(issue, fieldId) {
  if (!fieldId || !issue?.raw_data) return null;
  let raw;
  try {
    raw = JSON.parse(issue.raw_data);
  } catch {
    return null;
  }
  const value = raw?.fields?.[fieldId];
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(v => v?.value || v?.name || v).filter(Boolean).join(', ') || null;
  }
  return value.value || value.name || null;
}

/**
 * Normalise a title for comparison: case, punctuation and whitespace-insensitive.
 * @param {string} value
 * @returns {string}
 */
function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Join handed-off local drafts to the Jira issues a human actually created.
 *
 * Because the app cannot create the issue itself, a draft and its Jira issue
 * start life unconnected. After the Product board syncs, match them on title
 * and attach the key — from then on the card behaves like any imported card.
 *
 * Matching is deliberately conservative: an exact normalised title match, and
 * only when exactly ONE unclaimed Jira issue matches. Anything ambiguous is
 * left for the user to link by hand rather than guessed at.
 *
 * @param {object[]} productIssues - issues cached for the Product board
 * @returns {Promise<number>} number of drafts adopted
 */
async function adoptHandedOffDrafts(productIssues) {
  const drafts = await getAwaitingAdoption();
  if (drafts.length === 0) return 0;

  // Issue keys already claimed by a card must not be stolen by a draft.
  const cards = await getProductCards();
  const claimed = new Set(cards.map(c => c.product_issue_key).filter(Boolean));

  let adopted = 0;

  for (const draft of drafts) {
    const target = normalizeTitle(draft.title);
    if (!target) continue;

    const matches = productIssues.filter(
      issue => !claimed.has(issue.key) && normalizeTitle(issue.summary) === target
    );

    if (matches.length !== 1) {
      if (matches.length > 1) {
        logger.warn(
          `[ProductSync] Draft ${draft.id} matches ${matches.length} Jira issues — ` +
          'left unlinked for manual resolution'
        );
      }
      continue;
    }

    const issue = matches[0];
    await updateProductCard(draft.id, {
      product_issue_key: issue.key,
      status: issue.status || draft.status,
      handed_off_at: null
    });
    claimed.add(issue.key);
    adopted += 1;
    logger.info(`[ProductSync] Adopted draft ${draft.id} as ${issue.key}`);
  }

  return adopted;
}

/**
 * Create/refresh local product cards from the issues cached for the Product board.
 *
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
export async function importProductBoardIssues() {
  await initDatabase();

  // Select by project key rather than board id — see PRODUCT_PROJECT_KEY.
  let issues;
  try {
    issues = await getByIndex(STORES.ISSUES, 'project_key', PRODUCT_PROJECT_KEY);
  } catch (error) {
    // Databases created before DB_VERSION 10 lack the project_key index.
    logger.warn('[ProductSync] project_key index unavailable, scanning:', error.message);
    const all = await getAll(STORES.ISSUES);
    issues = all.filter(i => i.project_key === PRODUCT_PROJECT_KEY);
  }

  // Claim handed-off drafts first, so their issues update the existing card
  // instead of creating a duplicate below.
  const adopted = await adoptHandedOffDrafts(issues);

  let created = 0;
  let updated = 0;

  for (const issue of issues) {
    const jiraFields = {
      title: issue.summary || null,
      // Jira v3 returns ADF, not a string — flatten it so the value is
      // readable, searchable, and safe to render.
      description: adfToText(issue.description),
      status: issue.status || null,
      customer: issue.customer || null,
      user_persona: readCustomField(issue, PRODUCT_CUSTOM_FIELDS.userPersona),
      reporter_name: issue.reporter_name || null,
      assignee_name: issue.assignee_name || null,
      priority: issue.priority || null,
      jira_updated_at: issue.updated_at || null
    };

    const existing = await getProductCardByIssueKey(issue.key);
    if (existing) {
      await updateProductCard(existing.id, jiraFields);
      updated += 1;
    } else {
      await createProductCard({ product_issue_key: issue.key, ...jiraFields });
      created += 1;
    }
  }

  logger.info(
    `[ProductSync] Imported project ${PRODUCT_PROJECT_KEY}: ${created} created, ` +
    `${updated} updated, ${adopted} draft(s) adopted`
  );
  return { created, updated, adopted, skipped: 0 };
}

/**
 * Full Product Board reconciliation: import product issues, then re-detect the
 * Engineering link, engineer, status and milestones for every card.
 *
 * Cards are processed independently — one bad card does not abort the run.
 *
 * @returns {Promise<object>} summary including newly-pending milestones
 */
export async function syncProductBoard() {
  await initDatabase();

  const warnings = [];
  let imported = { created: 0, updated: 0, adopted: 0, skipped: 0 };

  try {
    imported = await importProductBoardIssues();
  } catch (error) {
    logger.error('[ProductSync] Product board import failed:', error);
    warnings.push(`Product board import failed: ${error.message}`);
  }

  const cards = await getProductCards();
  let linked = 0;
  let unlinked = 0;

  for (const card of cards) {
    if (!card.product_issue_key) {
      // Local-only draft, nothing in Jira to reconcile against.
      continue;
    }
    try {
      const refreshed = await resolveAssignedEngineer(card.id);
      if (refreshed?.eng_issue_key) linked += 1;
      else unlinked += 1;
    } catch (error) {
      logger.error(`[ProductSync] Failed to reconcile card ${card.id}:`, error);
      warnings.push(`Card ${card.id}: ${error.message}`);
    }
  }

  const pendingMilestones = await getPendingMilestones();

  const summary = {
    imported,
    cards: cards.length,
    linked,
    unlinked,
    pendingMilestones,
    warnings,
    timestamp: new Date().toISOString()
  };

  logger.info(
    `[ProductSync] Reconciled ${cards.length} card(s): ${linked} linked, ` +
    `${unlinked} unlinked, ${pendingMilestones.length} pending milestone(s)`
  );

  return summary;
}

/**
 * Board IDs that a full sync must cover for the dual-board workflow.
 * `sync.js` already walks every accessible board, so this exists to surface a
 * misconfiguration rather than to drive fetching.
 *
 * @returns {{configured: boolean, missing: string[]}}
 */
export function getDualBoardConfig() {
  const missing = [];
  if (!PRODUCT_PROJECT_KEY) missing.push('VITE_PRODUCT_PROJECT_KEY');
  if (!BOARD_IDS.engineering) missing.push('VITE_ENG_BOARD_ID');
  return { configured: missing.length === 0, missing, projectKey: PRODUCT_PROJECT_KEY };
}
