/**
 * When is an issue "done", and when did that happen?
 *
 * The obvious answer — Jira's `resolutiondate`, cached as `resolved_at` — is
 * wrong for this instance. TSM2's workflow never sets a resolution: 5,627 of
 * its 5,628 Done-category issues have none, so `resolved_at` is null across
 * effectively the whole project. Anything computed from it (throughput, cycle
 * time, flow) silently reads as zero.
 *
 * Completion is therefore decided by STATUS CATEGORY, which Jira maintains for
 * every status regardless of workflow, and dated from `resolved_at` when it is
 * present, falling back to `updated_at`. The fallback is a good approximation
 * rather than an exact one — the move into a Done status is, in practice, the
 * last change made to a finished ticket — and it is honest about being
 * derived: nothing here pretends to be a resolution date.
 */

import { isDoneCategory, isDoneStatus } from './status.js';

/**
 * @param {object} issue - cached issue record
 * @returns {boolean}
 */
export function isCompleted(issue) {
  if (!issue) return false;
  return isDoneCategory(issue.status_category) || isDoneStatus(issue.status);
}

/**
 * ISO timestamp of completion, or null while the issue is still open.
 *
 * @param {object} issue
 * @returns {string|null}
 */
export function completedAt(issue) {
  if (!isCompleted(issue)) return null;
  return issue.resolved_at || issue.updated_at || null;
}

/**
 * Was the issue completed within the last `days` days?
 *
 * @param {object} issue
 * @param {number} days
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function completedWithin(issue, days, now = Date.now()) {
  const at = completedAt(issue);
  if (!at) return false;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now - days * 86400000;
}

/**
 * Was the issue created within the last `days` days?
 *
 * Paired with completedWithin() so inflow and outflow are measured over the
 * same window with the same edge handling.
 *
 * @param {object} issue
 * @param {number} days
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function createdWithin(issue, days, now = Date.now()) {
  if (!issue?.created_at) return false;
  const t = new Date(issue.created_at).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now - days * 86400000;
}
