/**
 * Is this card intentionally set aside?
 *
 * "Untouched for a long time" is a poor neglect signal on its own, because a
 * lot of untouched work is untouched on purpose. This instance marks that
 * fairly consistently — just not in a dedicated field:
 *
 *   - the customer field carries the literal value "Archived" (on 80 of the
 *     100 oldest customer-tagged open items when this was written)
 *   - titles are prefixed with bracketed tags: [Archived], [KIV], [On Hold],
 *     [WIP], [Duplicated], sometimes several in a row
 *
 * Anything that matches is excluded from "needs attention" lists by default.
 * The Product Radar also lets a PM park a card by hand (a local triage tag);
 * that is handled at the query layer, not here.
 */

/** Bracketed title tags (lowercased, brackets stripped) that mean "parked". */
export const PARKED_TITLE_TAGS = [
  'archived', 'archive', 'kiv', 'on hold', 'on-hold', 'onhold', 'wip',
  'duplicated', 'duplicate', 'parked', 'deferred'
];

/** Customer-field values (lowercased) that mean "parked". */
export const PARKED_CUSTOMER_VALUES = ['archived', 'archive'];

/**
 * The leading bracketed tags of a title, lowercased and trimmed.
 *
 * "[Archived] [Purchase Date] Purchase Date not showing" → ['archived', 'purchase date']
 * "[RAW][NetSuite] Handle RESTlet" → ['raw', 'netsuite']
 *
 * Only LEADING tags count: a bracket later in the title is content, not a
 * flag ("Fix [Line Items] tab" is not parked).
 *
 * @param {string} title
 * @returns {string[]}
 */
export function leadingTitleTags(title) {
  const tags = [];
  let rest = String(title || '');
  for (;;) {
    const match = rest.match(/^\s*\[([^\]]*)\]/);
    if (!match) break;
    tags.push(match[1].trim().toLowerCase());
    rest = rest.slice(match[0].length);
  }
  return tags;
}

/**
 * Why the card counts as parked, or null if it does not.
 *
 * @param {object} issue - cached issue record (summary, customer)
 * @returns {{source: 'title'|'customer', value: string}|null}
 */
export function parkedReason(issue) {
  const tags = leadingTitleTags(issue?.summary);
  const tag = tags.find(t => PARKED_TITLE_TAGS.includes(t));
  if (tag) return { source: 'title', value: `[${tag}]` };

  const customers = String(issue?.customer || '')
    .split(/\s*[,/]\s*/)
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);
  const customer = customers.find(c => PARKED_CUSTOMER_VALUES.includes(c));
  if (customer) return { source: 'customer', value: customer };

  return null;
}

/**
 * @param {object} issue
 * @returns {boolean}
 */
export function isParked(issue) {
  return parkedReason(issue) !== null;
}
