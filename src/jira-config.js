/**
 * Jira Instance Configuration
 * Customize these field IDs to match your Jira instance's custom fields.
 * Each team may have different custom field IDs for the same logical fields.
 */

export const CUSTOM_FIELDS = {
  // Story Points. Verified as customfield_10014 on this instance — the common
  // customfield_10016/10026 defaults do NOT exist here. Override per instance.
  storyPoints: 'customfield_10014',

  // Customer field used for multi-value customer tracking
  customer: 'customfield_10043',

  // Code reviewer fields (Jira user-type custom fields)
  codeReviewer1: 'customfield_10044',
  codeReviewer2: 'customfield_10313'
};

/**
 * Pattern-based custom field detection.
 *
 * Matched against the field's DISPLAY NAME (lowercased), resolved from
 * /rest/api/3/field at sync time — NOT against the "customfield_NNNNN" key,
 * which never contains a human word. Used when the exact CUSTOM_FIELDS mapping
 * above doesn't name a field id.
 *
 * Verified names on this instance: "Story Points" (customfield_10014),
 * "QA Tester" (customfield_10040), "QA Reviewer" (customfield_10041).
 */
export const FIELD_PATTERNS = {
  // If a custom field NAME contains any of these, map it to product
  product: ['product'],

  // If a custom field NAME contains any of these, map it to QA tester.
  // Ordered most- to least-specific: the first pattern to match a field wins,
  // so "QA Tester" is preferred over a bare "QA ..." field.
  qaTester: ['qa tester', 'tester', 'qa'],

  // Story Points, so a renamed or re-created field still resolves.
  storyPoints: ['story points', 'story point']
};
