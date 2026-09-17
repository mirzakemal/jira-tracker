/**
 * Issue keys mentioned inside free text.
 *
 * Bug titles here routinely cite the support ticket they came from —
 * "PO list Purchaser column falls back to GR-workflow approver (TTS-477)" —
 * without anyone adding a Jira issue link. The relationship exists in the
 * words and nowhere else, so traceability has to read the words.
 */

const KEY_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,7})\b/g;

/**
 * Every distinct issue key in `text`, in order of first appearance.
 *
 * @param {string} text
 * @param {string[]|null} [projects=null] - restrict to these project keys
 * @returns {string[]}
 */
export function issueKeysIn(text, projects = null) {
  const out = [];
  const seen = new Set();
  const allow = projects ? new Set(projects.map(p => p.toUpperCase())) : null;
  for (const match of String(text || '').matchAll(KEY_RE)) {
    const key = `${match[1]}-${match[2]}`;
    if (allow && !allow.has(match[1])) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Index of "which issues mention key X" across a set of issues.
 *
 * @param {object[]} issues - cached issue records (key, summary)
 * @param {string[]|null} [projects] - only index mentions of these projects
 * @returns {Map<string, string[]>} mentioned key → keys of issues mentioning it
 */
export function mentionIndex(issues, projects = null) {
  const index = new Map();
  for (const issue of issues || []) {
    for (const mentioned of issueKeysIn(issue.summary, projects)) {
      if (mentioned === issue.key) continue;
      const list = index.get(mentioned) || [];
      list.push(issue.key);
      index.set(mentioned, list);
    }
  }
  return index;
}
