/**
 * Which part of the product a bug is about.
 *
 * Bugs here carry almost no structured metadata — labels on 7%, components on
 * under 1% — so the only thing that says "this is an invoicing bug" is the
 * title. This is a hand-maintained dictionary matched against summaries.
 *
 * It is deliberately a list in PRIORITY ORDER: the first area whose pattern
 * matches wins. More specific areas come first (Gateway before Invoicing,
 * because "Gateway payment sync" is integration work that happens to mention
 * payments), and the generic catch-alls come last.
 *
 * It will be wrong sometimes. The Bug Pattern Explorer shows which frequent
 * phrases the dictionary does not yet name, so the list can be tuned from
 * evidence rather than guesswork.
 */

export const PRODUCT_AREAS = [
  {
    key: 'gateway',
    label: 'Gateway & Integrations',
    hint: 'API-created POs, SAP, NetSuite, Xero, Workday, SFTP, SOAP, payment sync',
    patterns: [/\bgateway\b/i, /\bAPIs?\b/, /\bSAP\b/, /netsuite/i, /\bxero\b/i, /workday/i, /\bsftp\b/i, /\bsoap\b/i, /restlet/i, /webhook/i, /\bplugin\b/i, /\bsync\b/i, /\bMAH\b/, /invoicenow/i, /peppol/i]
  },
  {
    key: 'invoicing',
    label: 'Invoicing & Payments',
    hint: 'Direct Invoice, Credit Note, Claims, payment status, Bulk Update',
    patterns: [/invoice/i, /credit note/i, /\bpayment/i, /\bclaims?\b/i, /bulk update/i]
  },
  {
    key: 'contracts',
    label: 'Contracts',
    hint: 'Contract creation, variations, renewals, covering officer',
    patterns: [/contract/i, /\bvariation/i, /renewal/i]
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    hint: 'Supplier invite, relationship page, Supplier Form Designer, resubmission',
    patterns: [/supplier/i, /\bvendor/i, /resubmission/i]
  },
  {
    key: 'evaluation',
    label: 'Evaluation',
    hint: 'Evaluation forms, scoring, assessment, evaluation PDF',
    patterns: [/evaluat/i, /\bscor(?:e|es|ing)\b/i, /assessment/i]
  },
  {
    key: 'po',
    label: 'Purchase Orders & Receipts',
    hint: 'PO, Goods Receipt, replacement, GST on line items',
    patterns: [/\bPOs?\b/, /purchase order/i, /\bGRs?\b/, /goods receipt/i, /replacement/i, /\bGST\b/i]
  },
  {
    key: 'sourcing',
    label: 'Sourcing & Purchase Requests',
    hint: 'PR, Item Master, Internal Requisition, Manage Deal, tenders, bids, quotations, allocation',
    patterns: [/\bPRs?\b/, /purchase request/i, /item master/i, /internal requisition/i, /\bIRs?\b/, /manage deal/i, /\btenders?\b/i, /\bbids?\b/i, /quotation/i, /sourcing/i, /\bEOI\b/, /\bRFQ\b/, /allocation/i, /award/i]
  },
  {
    key: 'email',
    label: 'Email & Communications',
    hint: 'Outbound mail, inbound parsing, notifications, clarifications',
    patterns: [/\be-?mail/i, /\bmail\b/i, /inbound/i, /notification/i, /clarification/i, /communication/i]
  },
  {
    key: 'reports',
    label: 'Reports, Import & Export',
    hint: 'Report Designer, reindex, Excel import/export, MsSQL plugin',
    patterns: [/\breport/i, /\bexport/i, /\bimport/i, /excel/i, /\bcsv\b/i, /mssql/i, /reindex/i, /\bPDF\b/i]
  },
  {
    key: 'platform',
    label: 'Users, Forms & Settings',
    hint: 'Users, roles, SSO, organisation settings, Form Designer, conditional fields, approvals',
    patterns: [/\busers?\b/i, /permission/i, /\brole/i, /\blogin/i, /\bSSO\b/, /organi[sz]ation/i, /settings?/i, /approv/i, /workflow/i, /placeholder/i, /form designer/i, /conditional/i, /visible when/i, /custom field/i]
  }
];

/** Where a title that matches nothing lands. */
export const OTHER_AREA = { key: 'other', label: 'Unclassified', hint: 'Nothing in the dictionary matched the title' };

/**
 * @param {object|string} issueOrTitle - cached issue record, or a bare title
 * @returns {string} area key (one of PRODUCT_AREAS, or 'other')
 */
export function productAreaFor(issueOrTitle) {
  const title = typeof issueOrTitle === 'string' ? issueOrTitle : (issueOrTitle?.summary || '');
  for (const area of PRODUCT_AREAS) {
    if (area.patterns.some(re => re.test(title))) return area.key;
  }
  return OTHER_AREA.key;
}

/** Area definition by key, including 'other'. */
export function productAreaDef(key) {
  return PRODUCT_AREAS.find(a => a.key === key) || OTHER_AREA;
}

const STOPWORDS = new Set(('a an the and or of to in on for with when after before from by at as is are was were be been not no does do did ' +
  'this that these those it its into via than then also still only just even into over under out up down off per each any all some ' +
  'if while where which who whose what how why should would could can cannot will shall may might must ' +
  'issue issues bug bugs fix fixes fixed error errors fail fails failed failing wrong incorrect incorrectly missing unable able ' +
  'page pages field fields form forms list lists button value values data new old add added remove removed show shows shown showing display displays displayed ' +
  'when user users cannot').split(/\s+/));

/**
 * Words and two-word phrases that recur across titles, most frequent first.
 *
 * Used to surface what the dictionary doesn't name yet: run it over the titles
 * that landed in one area (or in 'other') and the top entries are candidate
 * patterns. Issue keys and stopwords are ignored; bracketed words are kept.
 *
 * @param {string[]} titles
 * @param {object} [options]
 * @param {number} [options.min=2] - minimum occurrences to report
 * @param {number} [options.limit=12]
 * @param {RegExp[]} [options.exclude=[]] - patterns already in the dictionary
 * @returns {Array<{phrase: string, count: number}>}
 */
export function phraseFrequency(titles, { min = 2, limit = 12, exclude = [] } = {}) {
  const counts = new Map();
  const seenIn = new Map(); // phrase → set of title indexes, so one title counts once

  (titles || []).forEach((title, idx) => {
    // Issue keys go; bracket and parenthesis CHARACTERS go but their words
    // stay — "[Item Master]" and "(NCL)" are precisely the tags worth learning.
    const cleaned = String(title || '')
      .replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, ' ')
      .replace(/[[\]()]/g, ' ');
    const words = cleaned
      .split(/[^A-Za-z0-9']+/)
      .map(w => w.replace(/^'+|'+$/g, ''))
      .filter(w => w.length >= 2 && !/^\d+$/.test(w));
    const isStop = w => STOPWORDS.has(w.toLowerCase());

    const candidates = new Set();
    for (const w of words) {
      if (w.length >= 3 && !isStop(w)) candidates.add(w);
    }
    // Bigrams may END with a stopword ("Visible When") but not start with one
    // ("of Invoice"), and never consist of stopwords alone.
    for (let i = 0; i < words.length - 1; i += 1) {
      const a = words[i], b = words[i + 1];
      if (isStop(a)) continue;
      if (a.length < 3 && b.length < 3) continue;
      candidates.add(`${a} ${b}`);
    }

    for (const phrase of candidates) {
      const norm = phrase.toLowerCase();
      if (exclude.some(re => re.test(phrase))) continue;
      const set = seenIn.get(norm) || new Set();
      if (set.has(idx)) continue;
      set.add(idx);
      seenIn.set(norm, set);
      counts.set(norm, { phrase, count: (counts.get(norm)?.count || 0) + 1 });
    }
  });

  return [...counts.values()]
    .filter(e => e.count >= min)
    // Prefer phrases over single words at equal frequency — they name things.
    .sort((a, b) => b.count - a.count || (b.phrase.includes(' ') ? 1 : 0) - (a.phrase.includes(' ') ? 1 : 0) || a.phrase.localeCompare(b.phrase))
    .slice(0, limit);
}
