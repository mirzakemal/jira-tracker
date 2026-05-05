/**
 * Jira Instance Configuration
 * Customize these field IDs to match your Jira instance's custom fields.
 * Each team may have different custom field IDs for the same logical fields.
 */

export const CUSTOM_FIELDS = {
  // Customer field used for multi-value customer tracking
  customer: 'customfield_10043',

  // Code reviewer fields (Jira user-type custom fields)
  codeReviewer1: 'customfield_10044',
  codeReviewer2: 'customfield_10313'
};

/**
 * Pattern-based custom field detection.
 * These search the field name (lowercased) to find the right field.
 * Only used when the exact CUSTOM_FIELDS mapping doesn't match.
 */
export const FIELD_PATTERNS = {
  // If a custom field name contains any of these strings, map it to product
  product: ['product'],

  // If a custom field name contains any of these strings, map it to QA tester
  qaTester: ['qa', 'tester']
};
