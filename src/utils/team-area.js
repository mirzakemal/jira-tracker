/**
 * Which product-team area a card belongs to: Project, Integration or Core.
 *
 * The product team is organised in these three areas, but nothing in Jira
 * records the assignment — people just know. So it is inferred, by rules in
 * priority order, from what the card says about itself:
 *
 *   1. Integration — the title names an integration surface (Gateway, SAP,
 *      NetSuite, Xero, Workday, SFTP, SOAP …). Checked first because an
 *      integration card is usually also a customer's card, and "Integration"
 *      is the more specific answer.
 *   2. Core — internal improvement work: the Improvement / Setup issue types,
 *      PDT's Product Expansion / Simple Change types, or a customer field that
 *      says only "internal".
 *   3. Project — everything else, which in practice is work for a named
 *      customer: new requests, new functionality, projects.
 *
 * The keyword list is exported and deliberately small so it can be tuned as
 * misclassifications show up. Should the team ever record the area in Jira
 * (a component, a label), this becomes a one-line lookup.
 */

export const TEAM_AREAS = {
  project: {
    key: 'project',
    label: 'Project',
    description: 'New customer requests, new features and functionality, projects'
  },
  integration: {
    key: 'integration',
    label: 'Integration',
    description: 'Gateway, SAP, NetSuite, Xero, Workday, SFTP, SOAP, payment sync'
  },
  core: {
    key: 'core',
    label: 'Core',
    description: 'Internal improvements and enhancements'
  }
};

/** Tab order for the area filter. */
export const TEAM_AREA_ORDER = ['project', 'integration', 'core'];

/**
 * Words in a title that mark integration work. Matched as whole words,
 * case-insensitively, so "SAP-RFC" and "tb-gateway" match but "sapling"
 * does not.
 */
export const INTEGRATION_KEYWORDS = [
  'gateway', 'api', 'sync', 'sap', 'netsuite', 'xero', 'workday', 'sftp',
  'soap', 'restlet', 'plugin', 'inbound', 'integration', 'sso', 'invoicenow',
  'webhook', 'peppol'
];

const INTEGRATION_RE = new RegExp(`\\b(?:${INTEGRATION_KEYWORDS.join('|')})\\b`, 'i');

/** Issue types that are internal improvement work by definition. */
export const CORE_ISSUE_TYPES = ['Improvement', 'Setup', 'Product Expansion', 'Simple Change'];

/**
 * @param {object} issue - cached issue record (summary, issue_type, customer)
 * @returns {'project'|'integration'|'core'}
 */
export function teamAreaFor(issue) {
  const title = issue?.summary || '';
  if (INTEGRATION_RE.test(title)) return 'integration';

  if (CORE_ISSUE_TYPES.includes(issue?.issue_type || '')) return 'core';

  // The customer field is free text and sometimes lists several values
  // ("Makino, internal"). Only a card that is *purely* internal is Core; one
  // that also names a customer is that customer's work.
  const customers = String(issue?.customer || '')
    .split(/\s*[,/]\s*/)
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);
  if (customers.length > 0 && customers.every(c => c === 'internal')) return 'core';

  return 'project';
}

/**
 * Group a list of issues by area.
 *
 * @param {object[]} issues
 * @returns {{project: object[], integration: object[], core: object[]}}
 */
export function groupByTeamArea(issues) {
  const groups = { project: [], integration: [], core: [] };
  for (const issue of issues || []) {
    groups[teamAreaFor(issue)].push(issue);
  }
  return groups;
}
