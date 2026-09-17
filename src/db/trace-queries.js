/**
 * Traceability Gaps — product intent, engineering work and support tickets
 * that don't point at each other.
 *
 *   pdtWithoutEng   Product cards past the decision stages with no linked
 *                   engineering work: agreed, but nobody is building it.
 *   engWithoutPdt   Engineering work (non-bug by default) with no epic parent
 *                   and no link to a product card: built without, or before,
 *                   a product decision.
 *   tts             Support tickets and how they connect to engineering —
 *                   linked in Jira, mentioned only in a bug title, or not
 *                   connected at all.
 *
 * Read-only: the "Link in Jira" affordance opens the issue for a person to
 * add the link; nothing here writes to Jira.
 *
 * buildTraceability() is pure; loadTraceability() reads the cache.
 */

import { initDatabase, getAll, STORE_NAMES as STORES } from './indexeddb.js';
import { PRODUCT_PROJECT_KEY, ENG_PROJECT_KEY, EXTRA_SYNC_PROJECTS } from '../product-config.js';
import { isCompleted } from '../utils/completion.js';
import { parkedReason } from '../utils/parked.js';
import { mentionIndex, issueKeysIn } from '../utils/mentions.js';

/** PDT statuses where engineering work is expected to exist. Lowercased. */
export const COMMITTED_PRODUCT_STATUSES = [
  'ready for technical specification', 'ready for development', 'development process'
];

/** Engineering issue types that are bugs, excluded from "no PDT parent" by default. */
const BUG_LIKE = new Set(['bug', 'defect', 'incident']);
/** Sub-task types never need their own product parent. */
const SUBTASK_LIKE = new Set(['sub-task', 'subtask', 'sub test execution', 'defect', 'temporary fix']);

/** The support project — first of the JQL-synced projects, TTS by default. */
export const SUPPORT_PROJECT_KEY = EXTRA_SYNC_PROJECTS[0] || 'TTS';

const lower = s => String(s || '').toLowerCase().trim();

/**
 * Build an index: issue key → set of keys it is linked to (either direction).
 *
 * @param {object[]} links - issuelinks store rows
 * @returns {Map<string, Set<string>>}
 */
export function linkIndex(links) {
  const index = new Map();
  const add = (a, b) => {
    if (!a || !b) return;
    (index.get(a) || index.set(a, new Set()).get(a)).add(b);
  };
  for (const l of links || []) {
    add(l.source_key, l.target_key);
    add(l.target_key, l.source_key);
  }
  return index;
}

const projectOf = key => String(key || '').split('-')[0];

/**
 * @param {object[]} issues - cached issue records
 * @param {object[]} links - issuelinks rows
 * @param {object} [options]
 * @param {boolean} [options.includeBugs=false] - include bug-like types in engWithoutPdt
 * @param {boolean} [options.includeParked=false]
 * @param {number} [options.now=Date.now()]
 * @returns {object}
 */
export function buildTraceability(issues, links, { includeBugs = false, includeParked = false, now = Date.now() } = {}) {
  const all = issues || [];
  const byKey = new Map(all.map(i => [i.key, i]));
  const linked = linkIndex(links);
  const mentions = mentionIndex(all.filter(i => i.project_key === ENG_PROJECT_KEY), [SUPPORT_PROJECT_KEY, PRODUCT_PROJECT_KEY]);
  const days = iso => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86400000)); };
  const visible = i => includeParked || !parkedReason(i);
  const decorate = i => ({ ...i, parked: parkedReason(i), ageDays: days(i.created_at), idleDays: days(i.updated_at) });

  const linkedTo = (key, project) => [...(linked.get(key) || [])].filter(k => projectOf(k) === project);
  const childrenOf = key => all.filter(i => i.parent_key === key).map(i => i.key);

  // ── Product cards with no engineering work ──
  const pdtWithoutEng = all
    .filter(i => i.project_key === PRODUCT_PROJECT_KEY && !isCompleted(i))
    .filter(i => COMMITTED_PRODUCT_STATUSES.includes(lower(i.status)))
    .filter(i => linkedTo(i.key, ENG_PROJECT_KEY).length === 0 && childrenOf(i.key).filter(k => projectOf(k) === ENG_PROJECT_KEY).length === 0)
    .filter(visible)
    .map(decorate)
    .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0));

  // ── Engineering work with no product parent ──
  const engCandidates = all
    .filter(i => i.project_key === ENG_PROJECT_KEY && !isCompleted(i))
    .filter(i => !SUBTASK_LIKE.has(lower(i.issue_type)))
    .filter(i => includeBugs || !BUG_LIKE.has(lower(i.issue_type)))
    .filter(i => !i.parent_key)
    .filter(i => linkedTo(i.key, PRODUCT_PROJECT_KEY).length === 0)
    .filter(i => issueKeysIn(i.summary, [PRODUCT_PROJECT_KEY]).length === 0);
  const engWithoutPdt = engCandidates.filter(visible).map(decorate).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  // ── Support tickets ──
  const support = all.filter(i => i.project_key === SUPPORT_PROJECT_KEY && !isCompleted(i)).filter(visible);
  const ttsLinked = [], ttsMentioned = [], ttsNone = [];
  for (const t of support) {
    const viaLink = linkedTo(t.key, ENG_PROJECT_KEY);
    const viaMention = (mentions.get(t.key) || []).filter(k => !viaLink.includes(k));
    const row = { ...decorate(t), engKeys: viaLink, mentionedBy: viaMention.map(k => ({ key: k, summary: byKey.get(k)?.summary || '', status: byKey.get(k)?.status || '' })) };
    if (viaLink.length) ttsLinked.push(row);
    else if (viaMention.length) ttsMentioned.push(row);
    else ttsNone.push(row);
  }
  const byAge = (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0);
  ttsMentioned.sort(byAge); ttsNone.sort(byAge); ttsLinked.sort(byAge);

  // Mentions of support tickets that are NOT in the cache at all (the ticket
  // may be closed, or the support project not synced yet) still tell us the
  // link is missing in Jira. Surface them too.
  const uncachedMentions = [];
  for (const [mentioned, sources] of mentions) {
    if (projectOf(mentioned) !== SUPPORT_PROJECT_KEY || byKey.has(mentioned)) continue;
    const anyLinked = sources.some(s => linkedTo(s, SUPPORT_PROJECT_KEY).includes(mentioned));
    if (anyLinked) continue;
    uncachedMentions.push({ key: mentioned, mentionedBy: sources.map(k => ({ key: k, summary: byKey.get(k)?.summary || '', status: byKey.get(k)?.status || '' })) });
  }

  return {
    now,
    includeBugs,
    includeParked,
    pdtWithoutEng,
    engWithoutPdt,
    engCandidateCount: engCandidates.length,
    tts: {
      linked: ttsLinked,
      mentioned: ttsMentioned,
      none: ttsNone,
      uncachedMentions,
      cached: support.length,
      supportProject: SUPPORT_PROJECT_KEY
    }
  };
}

/**
 * Read the cache and build the report.
 *
 * @param {object} [options] - see buildTraceability()
 * @returns {Promise<object>}
 */
export async function loadTraceability(options = {}) {
  await initDatabase();
  const [issues, links] = await Promise.all([getAll(STORES.ISSUES), getAll(STORES.ISSUELINKS)]);
  return buildTraceability(issues, links, options);
}
