/**
 * Product Radar — what only a product manager can unblock.
 *
 * Five signals, each with a concrete queue behind it:
 *
 *   decisions  PDT cards in Plan / Feedback / Validation. Engineering cannot
 *              start until a PM moves them.
 *   hot        Highest / High engineering work still open after 30 days.
 *              Either it isn't really that priority, or it's stuck; both are
 *              a PM call.
 *   rework     Cards bounced back from testing (Test Comments / Test Run
 *              Failed). A cluster usually means the spec was unclear.
 *   flow       Created vs completed over 90 days, per team area. Which area
 *              is being starved — completing far less than arrives.
 *   customers  Named customers with open high-priority work.
 *
 * Parked work (see utils/parked.js) and anything a PM has parked by hand
 * (a local `triage:parked` tag) is excluded by default, because "left alone
 * on purpose" must not read as "neglected".
 *
 * buildRadar() is pure so it can be tested on fixtures; loadRadar() does the
 * IndexedDB reads and calls it.
 */

import { initDatabase, getAll, STORE_NAMES as STORES } from './indexeddb.js';
import { addTag, removeTag, getTags } from './queries.js';
import { PRODUCT_PROJECT_KEY, ENG_PROJECT_KEY } from '../product-config.js';
import { isCompleted, completedWithin, createdWithin } from '../utils/completion.js';
import { parkedReason } from '../utils/parked.js';
import { teamAreaFor, TEAM_AREA_ORDER } from '../utils/team-area.js';

/** PDT statuses that mean "waiting on a product decision". Lowercased. */
export const DECISION_STATUSES = ['plan', 'feedback', 'validation'];

/** TSM2 statuses that mean "QA sent it back". Lowercased. */
export const REWORK_STATUSES = ['test comments', 'test run failed'];

export const HIGH_PRIORITIES = ['highest', 'high'];

/** A High/Highest card older than this is "still open after too long". */
export const HIGH_PRIORITY_AGE_DAYS = 30;

/** Inflow / outflow window. */
export const FLOW_WINDOW_DAYS = 90;

/** Completing less than this share of what arrives counts as starved. */
export const STARVED_RATIO = 0.6;

/** Customer-field values that are not customers. */
const NOT_A_CUSTOMER = new Set(['internal', 'productionfix', 'archived', 'archive']);

export const TRIAGE_STATES = ['reviewed', 'decision', 'parked'];
const TRIAGE_PREFIX = 'triage:';

const lower = s => String(s || '').toLowerCase().trim();

/**
 * Whole days between an ISO timestamp and now, or null if unparseable.
 *
 * @param {string} iso
 * @param {number} now
 * @returns {number|null}
 */
export function daysSince(iso, now) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * The triage state encoded in an issue's local tags, or null.
 *
 * @param {string[]} [tags]
 * @returns {'reviewed'|'decision'|'parked'|null}
 */
export function triageFromTags(tags) {
  for (const tag of tags || []) {
    if (!tag.startsWith(TRIAGE_PREFIX)) continue;
    const state = tag.slice(TRIAGE_PREFIX.length);
    if (TRIAGE_STATES.includes(state)) return state;
  }
  return null;
}

/**
 * Split the free-text customer field into names.
 *
 * "SIM, internal" → ['SIM', 'internal']; "SAMH/SACS" → ['SAMH', 'SACS'].
 *
 * @param {string} value
 * @returns {string[]}
 */
export function customerNames(value) {
  return String(value || '')
    .split(/\s*[,/]\s*/)
    .map(c => c.trim())
    .filter(Boolean);
}

/**
 * Compute every radar signal from a list of cached issues.
 *
 * @param {object[]} issues - cached issue records
 * @param {Record<string, string[]>} [tagsByKey] - local tags per issue key
 * @param {object} [options]
 * @param {'all'|'project'|'integration'|'core'} [options.area='all']
 * @param {boolean} [options.includeParked=false]
 * @param {number} [options.now=Date.now()]
 * @returns {object}
 */
export function buildRadar(issues, tagsByKey = {}, { area = 'all', includeParked = false, now = Date.now() } = {}) {
  const rows = (issues || []).map(issue => ({
    ...issue,
    area: teamAreaFor(issue),
    triage: triageFromTags(tagsByKey[issue.key]),
    parked: parkedReason(issue),
    ageDays: daysSince(issue.created_at, now),
    idleDays: daysSince(issue.updated_at, now),
    completed: isCompleted(issue)
  }));

  const inArea = r => area === 'all' || r.area === area;
  const setAside = r => Boolean(r.parked) || r.triage === 'parked';
  const shown = r => inArea(r) && (includeParked || !setAside(r));
  const byAgeDesc = (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0);

  const open = rows.filter(r => !r.completed);
  const eng = open.filter(r => r.project_key === ENG_PROJECT_KEY);
  const product = open.filter(r => r.project_key === PRODUCT_PROJECT_KEY);

  // Candidates before the parked filter, so the UI can say how many it hid.
  const decisionCandidates = product.filter(r => DECISION_STATUSES.includes(lower(r.status)) && inArea(r));
  const hotCandidates = eng.filter(r =>
    HIGH_PRIORITIES.includes(lower(r.priority)) &&
    (r.ageDays ?? 0) >= HIGH_PRIORITY_AGE_DAYS &&
    inArea(r)
  );
  const reworkCandidates = eng.filter(r => REWORK_STATUSES.includes(lower(r.status)) && inArea(r));

  const decisions = decisionCandidates.filter(shown)
    .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0));
  const hot = hotCandidates.filter(shown).sort(byAgeDesc);
  const rework = reworkCandidates.filter(shown);
  const reworkHigh = rework.filter(r => HIGH_PRIORITIES.includes(lower(r.priority))).sort(byAgeDesc);

  const parkedCount = new Set(
    [...decisionCandidates, ...hotCandidates, ...reworkCandidates]
      .filter(setAside)
      .map(r => r.key)
  ).size;

  // Inflow vs outflow, engineering project only, per team area.
  const flow = {};
  let totalIn = 0, totalOut = 0, totalOpen = 0;
  for (const key of TEAM_AREA_ORDER) {
    const scoped = rows.filter(r => r.project_key === ENG_PROJECT_KEY && r.area === key);
    const created = scoped.filter(r => createdWithin(r, FLOW_WINDOW_DAYS, now)).length;
    const completed = scoped.filter(r => completedWithin(r, FLOW_WINDOW_DAYS, now)).length;
    const openNow = scoped.filter(r => !r.completed && (includeParked || !setAside(r))).length;
    const ratio = created ? completed / created : null;
    const state = created === 0 ? 'quiet'
      : ratio < STARVED_RATIO ? 'starved'
        : completed < created ? 'growing'
          : 'keeping-up';
    flow[key] = { created, completed, open: openNow, ratio, state };
    totalIn += created; totalOut += completed; totalOpen += openNow;
  }
  flow.total = { created: totalIn, completed: totalOut, open: totalOpen };

  // Customers with open high-priority work, from the hot list.
  const customerMap = new Map();
  for (const r of hot) {
    for (const name of customerNames(r.customer)) {
      if (NOT_A_CUSTOMER.has(name.toLowerCase())) continue;
      const entry = customerMap.get(name) || { name, count: 0, oldestDays: 0, keys: [] };
      entry.count += 1;
      entry.oldestDays = Math.max(entry.oldestDays, r.ageDays ?? 0);
      entry.keys.push(r.key);
      customerMap.set(name, entry);
    }
  }
  const customers = [...customerMap.values()]
    .sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays || a.name.localeCompare(b.name));

  return {
    area,
    includeParked,
    now,
    decisions,
    hot,
    rework: { count: rework.length, high: reworkHigh },
    flow,
    customers,
    parkedCount,
    thresholds: { HIGH_PRIORITY_AGE_DAYS, FLOW_WINDOW_DAYS, STARVED_RATIO }
  };
}

/**
 * Read the cache and build the radar.
 *
 * @param {object} [options] - see buildRadar()
 * @returns {Promise<object>}
 */
export async function loadRadar(options = {}) {
  await initDatabase();
  const [issues, tags] = await Promise.all([getAll(STORES.ISSUES), getAll(STORES.TAGS)]);

  const tagsByKey = {};
  for (const tag of tags) {
    (tagsByKey[tag.issue_key] ||= []).push(tag.tag_name);
  }

  return buildRadar(issues, tagsByKey, options);
}

/**
 * Set, change or clear an issue's triage state. Stored as a local tag; never
 * written to Jira.
 *
 * @param {string} issueKey
 * @param {'reviewed'|'decision'|'parked'|null} state - null clears
 */
export async function setTriage(issueKey, state) {
  if (state !== null && !TRIAGE_STATES.includes(state)) {
    throw new Error(`Unknown triage state: ${state}`);
  }
  const existing = (await getTags(issueKey)).filter(t => t.startsWith(TRIAGE_PREFIX));
  for (const tag of existing) {
    await removeTag(issueKey, tag);
  }
  if (state) await addTag(issueKey, TRIAGE_PREFIX + state);
}
