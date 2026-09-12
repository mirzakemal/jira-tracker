/**
 * Product Board Configuration
 *
 * Dual-board setup: a Product board (discovery / requirements) and an
 * Engineering board (delivery). Board IDs come from env at build time so each
 * environment can point at different boards without a code change.
 *
 * Only VITE_-prefixed vars are readable here, and anything read here is
 * INLINED INTO THE CLIENT BUNDLE. Board IDs and space keys are fine — they are
 * not secrets. Never read an API token through import.meta.env.
 */

/** Jira board IDs for each half of the dual-board system. */
export const BOARD_IDS = {
  product: import.meta.env?.VITE_PRODUCT_BOARD_ID
    ? Number(import.meta.env.VITE_PRODUCT_BOARD_ID)
    : null,
  engineering: import.meta.env?.VITE_ENG_BOARD_ID
    ? Number(import.meta.env.VITE_ENG_BOARD_ID)
    : null
};

/**
 * Project key whose issues make up the Product Board.
 *
 * Cards are selected by PROJECT rather than by numeric board id: the key is
 * stable, readable, and visible in every issue key (PDT-62), whereas board ids
 * differ per environment and are easy to get wrong. VITE_PRODUCT_BOARD_ID is
 * still used for the "open in Jira" link when set.
 */
export const PRODUCT_PROJECT_KEY =
  import.meta.env?.VITE_PRODUCT_PROJECT_KEY || 'PDT';

/**
 * Project key holding the Engineering cards — TSM2 ("TenderBoard Sprints").
 *
 * Used to decide whether a linked issue is really the delivery ticket. Keyed on
 * project rather than board id for the same reason as PRODUCT_PROJECT_KEY, and
 * because a project can span several boards.
 */
export const ENG_PROJECT_KEY =
  import.meta.env?.VITE_ENG_PROJECT_KEY || 'TSM2';

/**
 * Jira issue-link types that mean "this product item is delivered by that eng
 * item". Compared lowercased against `link_type` in the `issuelinks` store.
 * Adjust to match the link types configured on your Jira instance.
 */
export const ENG_LINK_TYPES = [
  // Jira Product Discovery's delivery link — by far the most common on PDT
  // (48 of 57 links). Created when a product idea is pushed to a delivery
  // project, so it is the strongest "this ships that" signal available.
  'polaris work item link',
  'implements',
  'is implemented by',
  'delivers',
  'blocks',
  'relates'
];

/** Custom field IDs specific to the Product board. */
export const PRODUCT_CUSTOM_FIELDS = {
  // Jira custom field holding the user persona. Set to your instance's field ID.
  userPersona: import.meta.env?.VITE_USER_PERSONA_FIELD || null,

  // Custom field on the PRODUCT issue whose value is the Engineering issue key
  // (e.g. a "Delivery Ticket" text field containing "ENG-42"). When an
  // Engineering Lead fills this in, it is the most explicit signal we have, so
  // it outranks issue links and epic parentage during resolution.
  engIssueKey: import.meta.env?.VITE_ENG_LINK_FIELD || null
};

/**
 * Engineering milestones worth flagging on the Product Board.
 *
 * Matched case-insensitively against the Eng issue's status NAME. These are the
 * real TSM2 statuses.
 *
 * Deliberately NOT inferred from Jira's status CATEGORY: TSM2 puts "Tested",
 * "Ready for Regression" and even "Ready To Test" in the Done category, so a
 * category check would report most in-flight work as Released and bury you in
 * false "write documentation" alerts. Only an explicit name counts.
 *
 * TSM2's full vocabulary, for reference when extending this:
 *   To Do, In Progress, In Review, Review Approval, Code Quality Check,
 *   Ready To Test, Testing, TESTING IN PROGRESS, TEST RUN PASSED,
 *   TEST RUN FAILED, Test Comments, Tested, Ready for Regression,
 *   Delivered / Released
 */
export const MILESTONE_STATUSES = {
  ready_to_test: ['ready to test', 'ready for test', 'ready for qa'],
  released: ['delivered / released', 'delivered/released', 'released', 'shipped', 'live']
};

/** Human-readable labels for milestone keys (UI + notifications). */
export const MILESTONE_LABELS = {
  ready_to_test: 'Ready to Test',
  released: 'Released'
};

/**
 * Kanban columns, in board order — the real PDT workflow statuses.
 *
 * Jira's board column configuration is not exposed by the REST endpoints this
 * app uses, so this order is maintained by hand to match the PDT board. Note it
 * is NOT status-category order: Validation sits third, before the two "Ready
 * for ..." columns, because validation happens before spec work.
 *
 * A status seen on an issue but missing from this list still gets a column,
 * appended at the end — no card is ever dropped for having an unknown status.
 */
export const PRODUCT_STATUSES = [
  'Plan',
  'Feedback',
  'Validation',
  'Ready for Technical Specification',
  'Ready for Development',
  'Development Process',
  'Delivered / Released'
];

/**
 * Jira priorities from most to least severe, used to order the Priority filter.
 * Values not listed here are appended alphabetically, so a renamed scheme still
 * works — it just falls back to alphabetical for the unknown names.
 */
export const PRIORITY_ORDER = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

/** Status category per column, used for the column accent colour. */
export const STATUS_CATEGORIES = {
  'Plan': 'todo',
  'Feedback': 'todo',
  'Ready for Technical Specification': 'todo',
  'Ready for Development': 'todo',
  'Validation': 'inprogress',
  'Development Process': 'inprogress',
  'Delivered / Released': 'done'
};

/**
 * Statuses that are derived from the linked Engineering card rather than set on
 * the product card itself. A card can sit in "Eng WIP" while its Eng card is
 * already "Ready to Test", so the Status filter matches EITHER value — see
 * `matchesStatus()` in db/product-queries.js.
 */
export const ENG_DERIVED_STATUSES = {
  ready_to_test: 'Ready to Test',
  released: 'Released'
};

/**
 * Product project identifiers, used to build the prefilled Jira "create issue"
 * link that a human clicks. `projectKey` is resolved to a numeric project id
 * from the local `projects` cache at call time; set `projectId` only to
 * override that lookup.
 */
export const PRODUCT_PROJECT = {
  key: import.meta.env?.VITE_PRODUCT_PROJECT_KEY || 'PDT',
  // Numeric id of the Product Development Team project.
  id: import.meta.env?.VITE_PRODUCT_PROJECT_ID || '10085',
  // Default issue type for a new product card. PDT offers:
  //   10267 Customer Request  (feature from a customer request — most common)
  //   10268 Product Expansion (feature from an internal idea)
  //   10370 Simple Change     (simple product update)
  issueTypeId: import.meta.env?.VITE_PRODUCT_ISSUE_TYPE_ID || '10267'
};

/**
 * Issue types shown as a type chip instead of a status.
 *
 * Some Jira types say more about a linked issue than its workflow position
 * does: an epic is a container, and a "Customer" card is a customer, not a unit
 * of work. Their status moves to the tooltip.
 */
export const TYPE_CHIPS = [
  // Epic is matched loosely so a renamed "Delivery Epic" still counts.
  { match: /\bepic\b/i, label: 'EPIC', tone: 'epic' },
  // Customer is matched EXACTLY: PDT's product cards are type
  // "Customer Request", which is a request, not a customer card.
  { match: /^\s*customer\s*$/i, label: 'CUSTOMER', tone: 'customer' }
];

/**
 * @param {string|null} issueType
 * @returns {{label: string, tone: string}|null}
 */
export function typeChip(issueType) {
  const name = String(issueType || '');
  if (!name) return null;
  return TYPE_CHIPS.find(c => c.match.test(name)) || null;
}

/** Jira issue type used for customer cards on the Customer Testing Board. */
export const CUSTOMER_ISSUE_TYPE =
  import.meta.env?.VITE_CUSTOMER_ISSUE_TYPE || 'Customer';

/**
 * Customer Testing Board id, used for the "open in Jira" link.
 * https://tenderboard.atlassian.net/jira/software/c/projects/TSM2/boards/22
 */
export const CUSTOMER_BOARD_ID =
  import.meta.env?.VITE_CUSTOMER_BOARD_ID || '22';

/**
 * Documentation workflow for a product card, in order.
 *
 * `not_needed` is a real outcome, not an absence: without it a card that never
 * warrants documentation sits as outstanding work forever.
 */
export const DOC_STATUSES = [
  { key: 'not_started', label: 'Not started', icon: '📝' },
  { key: 'in_progress', label: 'In progress', icon: '✍️' },
  { key: 'done', label: 'Done', icon: '✅' },
  { key: 'not_needed', label: 'Not needed', icon: '🚫' }
];

/** Statuses that mean documentation needs no further attention. */
export const DOC_SETTLED = ['done', 'not_needed'];

/** @param {string} key @returns {object|undefined} */
export function docStatus(key) {
  return DOC_STATUSES.find(s => s.key === key);
}

/** Confluence space that documentation drafts are published into. */
export const CONFLUENCE_SPACE_KEY = import.meta.env?.VITE_CONFLUENCE_SPACE_KEY || null;
