/**
 * Fill in epics and their child work items that the board sweep never cached.
 *
 * `sync.js` walks boards, so an epic that sits on no board — and its children —
 * are simply absent from the local `issues` store. On the Customer Card
 * Dashboard that showed as an epic row with no summary and no children, e.g.
 * TSM2-5515 "Complicated Evaluation Module", which has ten children in Jira.
 *
 * This fetches them on demand for the epics actually on screen and writes them
 * into the issues store, so the data is there for every other view too and
 * survives a reload. Best effort throughout: a failure leaves the cache as it
 * was rather than breaking the view.
 */

import logger from '../utils/logger.js';
import { initDatabase, get, put, putBulk, STORE_NAMES as STORES } from './indexeddb.js';

/**
 * Shape a raw Jira issue the way sync.js stores it.
 *
 * Only the fields this view needs — a partial record is better than no record,
 * and a later full sync overwrites it with everything.
 *
 * @param {object} raw
 * @returns {object|null}
 */
function toIssueRecord(raw) {
  if (!raw?.key) return null;
  const fields = raw.fields || {};
  return {
    key: raw.key,
    id: raw.id,
    project_key: fields.project?.key || raw.key.split('-')[0],
    summary: fields.summary || null,
    status: fields.status?.name || null,
    status_category: fields.status?.statusCategory?.name || null,
    priority: fields.priority?.name || null,
    issue_type: fields.issuetype?.name || null,
    assignee_id: fields.assignee?.accountId || null,
    assignee_name: fields.assignee?.displayName || null,
    parent_key: fields.parent?.key || null,
    updated_at: fields.updated || null,
    raw_data: JSON.stringify(raw),
    syncedAt: new Date().toISOString(),
    // Marks a record that came from here rather than a board sweep, so it is
    // obvious in the store why it has fewer fields than its neighbours.
    hydrated: true
  };
}

/**
 * Is this issue missing from the cache, or cached without a summary?
 *
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function needsHydration(key) {
  const existing = await get(STORES.ISSUES, key);
  return !existing || !existing.summary;
}

/**
 * Fetch one epic and its children into the issues store.
 *
 * @param {object} client - JiraClient
 * @param {string} epicKey
 * @returns {Promise<{epic: boolean, children: number}>} what was written
 */
export async function hydrateEpic(client, epicKey) {
  if (!client || !epicKey) return { epic: false, children: 0 };
  await initDatabase();

  let wroteEpic = false;
  let childCount = 0;

  // The epic itself, when it is missing or has no summary.
  try {
    if (await needsHydration(epicKey)) {
      const raw = await client.getIssue(epicKey, [
        'summary', 'status', 'assignee', 'issuetype', 'parent', 'priority', 'updated'
      ]);
      const record = toIssueRecord(raw);
      if (record) {
        await put(STORES.ISSUES, record);
        wroteEpic = true;
      }
    }
  } catch (error) {
    logger.warn(`[Hydrate] Could not fetch epic ${epicKey}:`, error.message);
  }

  // Its children.
  try {
    const children = await client.getEpicIssues(epicKey);
    const records = children.map(toIssueRecord).filter(Boolean);
    if (records.length > 0) {
      await putBulk(STORES.ISSUES, records);
      childCount = records.length;
    }
  } catch (error) {
    logger.warn(`[Hydrate] Could not fetch children of ${epicKey}:`, error.message);
  }

  if (wroteEpic || childCount) {
    logger.info(`[Hydrate] ${epicKey}: epic=${wroteEpic}, ${childCount} child work item(s)`);
  }
  return { epic: wroteEpic, children: childCount };
}

/**
 * Hydrate several epics, skipping any already handled in this session.
 *
 * @param {object} client
 * @param {string[]} epicKeys
 * @param {Set<string>} [seen] - mutated; pass the caller's set to dedupe
 * @returns {Promise<number>} epics that gained data
 */
export async function hydrateEpics(client, epicKeys, seen = new Set()) {
  if (!client) return 0;

  const todo = [...new Set(epicKeys)].filter(k => k && !seen.has(k));
  if (todo.length === 0) return 0;
  for (const key of todo) seen.add(key);

  const results = await Promise.all(todo.map(key => hydrateEpic(client, key)));
  return results.filter(r => r.epic || r.children).length;
}
