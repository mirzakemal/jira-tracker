/**
 * Product Card → Jira handoff
 *
 * The app does not write to Jira (see AGENTS.md "Read-Only Rule"). To get a
 * locally drafted product card onto the Product Board, we hand the draft to a
 * human: build a prefilled Jira "create issue" URL they click, plus the REST
 * payload they can paste if they'd rather use the API themselves.
 *
 * Nothing here performs a network request or mutates Jira. The card is joined
 * back up to the created issue on the next sync — see `adoptHandedOffDrafts()`
 * in `db/product-sync.js`.
 */

import logger from './logger.js';
import { PRODUCT_PROJECT, CONFLUENCE_SPACE_KEY } from '../product-config.js';

// Jira rejects very long GET URLs (and proxies cap lower still). Past this we
// drop the description from the link and tell the caller to paste it instead.
const MAX_URL_LENGTH = 1800;

/**
 * Normalise a Jira site domain the same way JiraClient does.
 * @param {string} domain
 * @returns {string}
 */
function cleanDomain(domain) {
  return String(domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Build the Jira REST payload for a product card.
 *
 * Returned for the user to copy — this app never POSTs it. The description is
 * plain text; Jira's v3 API expects ADF, so `descriptionAdf` is provided too.
 *
 * @param {object} card - a `product_cards` record
 * @param {object} [options] - { projectKey, issueTypeId }
 * @returns {object} payload shaped like POST /rest/api/3/issue
 */
export function buildIssuePayload(card, options = {}) {
  const projectKey = options.projectKey || PRODUCT_PROJECT.key;
  const issueTypeId = options.issueTypeId || PRODUCT_PROJECT.issueTypeId;

  const description = card?.description || '';

  return {
    fields: {
      project: projectKey ? { key: projectKey } : undefined,
      issuetype: issueTypeId ? { id: String(issueTypeId) } : undefined,
      summary: card?.title || '',
      description: {
        type: 'doc',
        version: 1,
        content: description
          ? [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
          : []
      }
    }
  };
}

/**
 * Build a prefilled Jira "create issue" URL for a locally drafted card.
 *
 * @param {object} card - a `product_cards` record
 * @param {string} domain - Jira site, e.g. "tenderboard.atlassian.net"
 * @param {object} [options] - { projectId, issueTypeId, projects }
 *   `projects` is the cached `projects` list, used to resolve the numeric
 *   project id from PRODUCT_PROJECT.key without a network call.
 * @returns {{url: string|null, descriptionOmitted: boolean, missing: string[]}}
 */
export function buildCreateIssueUrl(card, domain, options = {}) {
  const site = cleanDomain(domain);
  const missing = [];

  if (!site) missing.push('domain');
  // The title is optional: the "New Product Card" button opens Jira's create
  // screen with nothing drafted yet, and Jira is happy with a blank summary.

  // Resolve the numeric project id: explicit override → the synced project
  // matching the configured key → the configured default id.
  //
  // The cache lookup outranks the configured id because the KEY is what
  // identifies the project; a stale or mismatched numeric id would otherwise
  // silently win and point the create screen at the wrong project.
  let projectId = options.projectId || null;
  if (!projectId && PRODUCT_PROJECT.key && Array.isArray(options.projects)) {
    const match = options.projects.find(p => p.key === PRODUCT_PROJECT.key);
    projectId = match?.id || null;
  }
  if (!projectId) projectId = PRODUCT_PROJECT.id || null;
  if (!projectId) missing.push('VITE_PRODUCT_PROJECT_KEY or VITE_PRODUCT_PROJECT_ID');

  const issueTypeId = options.issueTypeId || PRODUCT_PROJECT.issueTypeId || null;
  if (!issueTypeId) missing.push('VITE_PRODUCT_ISSUE_TYPE_ID');

  if (missing.length > 0) {
    logger.warn('[Handoff] Cannot build create-issue URL, missing:', missing.join(', '));
    return { url: null, descriptionOmitted: false, missing };
  }

  const build = (includeDescription) => {
    const params = new URLSearchParams({
      pid: String(projectId),
      issuetype: String(issueTypeId)
    });
    if (card?.title) {
      params.set('summary', card.title);
    }
    if (includeDescription && card?.description) {
      params.set('description', card.description);
    }
    return `https://${site}/secure/CreateIssueDetails!init.jspa?${params}`;
  };

  let url = build(true);
  let descriptionOmitted = false;

  if (url.length > MAX_URL_LENGTH) {
    url = build(false);
    descriptionOmitted = true;
    logger.debug('[Handoff] Description too long for URL — omitted from prefill');
  }

  return { url, descriptionOmitted, missing: [] };
}

/**
 * Confluence "create page" URL for a product card's documentation.
 *
 * Opens Confluence's own create screen rather than writing anything — same
 * handoff shape as the Jira create link, and the app stays read-only.
 *
 * With no space configured this is the generic create entry point, where the
 * space is chosen in Confluence. Setting VITE_CONFLUENCE_SPACE_KEY pins it.
 *
 * @param {object} card
 * @param {string} domain
 * @param {object} [options] - { spaceKey }
 * @returns {{url: string|null, title: string, spaceKey: string|null}}
 */
export function buildCreateDocUrl(card, domain, options = {}) {
  const site = cleanDomain(domain);
  const spaceKey = options.spaceKey ?? CONFLUENCE_SPACE_KEY ?? null;

  // Prefix with the issue key so the page is findable from the card and back.
  const title = [card?.product_issue_key, card?.title].filter(Boolean).join(': ')
    || 'Product documentation';

  if (!site) {
    logger.warn('[Handoff] Cannot build Confluence URL without a domain');
    return { url: null, title, spaceKey };
  }

  const params = new URLSearchParams({ title });
  if (spaceKey) params.set('spaceKey', spaceKey);

  return {
    url: `https://${site}/wiki/create-content/page?${params}`,
    title,
    spaceKey
  };
}

/**
 * Everything the UI needs to hand one card off to Jira.
 *
 * @param {object} card
 * @param {string} domain
 * @param {object} [options]
 * @returns {object} { url, descriptionOmitted, missing, payload, payloadJson, description }
 */
export function buildHandoff(card, domain, options = {}) {
  const link = buildCreateIssueUrl(card, domain, options);
  const payload = buildIssuePayload(card, options);

  return {
    ...link,
    payload,
    payloadJson: JSON.stringify(payload, null, 2),
    // Surfaced separately so the UI can offer "copy description" when the link
    // had to drop it.
    description: card?.description || ''
  };
}
