/**
 * Bug Pattern Explorer — where bugs cluster, whether they're rising, and how
 * many escaped testing.
 *
 * Works from titles because bugs carry almost no metadata here (see
 * utils/product-area.js). For each product area:
 *
 *   open        bugs open right now
 *   trend       bugs created per month over the window, and the change from
 *               the first third of the window to the last third
 *   escape      Bug (found in production) per Defect (found during
 *               development) — high means testing isn't catching this area
 *   bounce      cards currently in Test Comments / Test Run Failed
 *   customers   who reports the bugs in this area
 *   phrases     recurring title phrases the dictionary does not name yet
 *
 * buildBugPatterns() is pure; loadBugPatterns() reads the cache.
 */

import { initDatabase, getAll, STORE_NAMES as STORES } from './indexeddb.js';
import { ENG_PROJECT_KEY } from '../product-config.js';
import { isCompleted, createdWithin } from '../utils/completion.js';
import { parkedReason } from '../utils/parked.js';
import { teamAreaFor } from '../utils/team-area.js';
import { PRODUCT_AREAS, OTHER_AREA, productAreaFor, phraseFrequency } from '../utils/product-area.js';
import { customerNames, REWORK_STATUSES } from './radar-queries.js';

/** Issue types, lowercased, and what they mean for the escape ratio. */
export const BUG_TYPES = ['bug'];        // found in production
export const DEFECT_TYPES = ['defect'];  // found during development
export const INCIDENT_TYPES = ['incident'];

export const DEFAULT_MONTHS = 12;

/**
 * The sort choices, with the explanation shown in the UI. The user asked for
 * these to be spelled out, so the text lives with the definition.
 */
export const SORT_OPTIONS = [
  {
    key: 'count',
    label: 'Open bugs',
    explain: 'How many bugs in this area are open right now. The biggest piles first.'
  },
  {
    key: 'trend',
    label: 'Trend',
    explain: 'Change in bugs created: the last third of the window compared with the first third. Rising means the area is getting worse, not just busy.'
  },
  {
    key: 'escape',
    label: 'Escape ratio',
    explain: 'Bugs found in production for every Defect caught during development. A high ratio means testing is not catching this area before release.'
  },
  {
    key: 'bounce',
    label: 'Bounce-backs',
    explain: 'Cards currently in Test Comments or Test Run Failed — work QA sent back. A cluster usually points at unclear specs rather than bad code.'
  }
];

const lower = s => String(s || '').toLowerCase().trim();
const NOT_A_CUSTOMER = new Set(['internal', 'productionfix', 'archived', 'archive']);

/**
 * Month buckets, oldest first, ending with the current month.
 *
 * @param {number} months
 * @param {number} now
 * @returns {Array<{key: string, label: string, start: number, end: number}>}
 */
export function monthBuckets(months, now) {
  const d = new Date(now);
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
    out.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en', { month: 'short' }),
      start: start.getTime(),
      end: end.getTime()
    });
  }
  return out;
}

/**
 * Relative change between the first and last third of a monthly series.
 *
 * @param {number[]} series
 * @returns {number|null} e.g. 0.5 = +50%; null when the first third is empty
 */
export function trendDelta(series) {
  const n = series.length;
  if (n < 3) return null;
  const third = Math.floor(n / 3);
  const first = series.slice(0, third).reduce((a, b) => a + b, 0);
  const last = series.slice(n - third).reduce((a, b) => a + b, 0);
  if (first === 0) return last === 0 ? 0 : null;
  return (last - first) / first;
}

/**
 * @param {object[]} issues - cached issue records
 * @param {object} [options]
 * @param {number} [options.months=12]
 * @param {number} [options.now=Date.now()]
 * @param {'all'|'project'|'integration'|'core'} [options.teamArea='all']
 * @param {{bug?: boolean, defect?: boolean, incident?: boolean}} [options.types]
 * @param {boolean} [options.includeParked=false]
 * @returns {object}
 */
export function buildBugPatterns(issues, {
  months = DEFAULT_MONTHS,
  now = Date.now(),
  teamArea = 'all',
  types = { bug: true, defect: true, incident: false },
  includeParked = false
} = {}) {
  const buckets = monthBuckets(months, now);
  const windowDays = Math.ceil((now - buckets[0].start) / 86400000);

  const typeOf = i => {
    const t = lower(i.issue_type);
    if (BUG_TYPES.includes(t)) return 'bug';
    if (DEFECT_TYPES.includes(t)) return 'defect';
    if (INCIDENT_TYPES.includes(t)) return 'incident';
    return null;
  };

  const rows = (issues || [])
    .filter(i => i.project_key === ENG_PROJECT_KEY)
    .map(i => ({ ...i, kind: typeOf(i), area: productAreaFor(i), team: teamAreaFor(i), parked: parkedReason(i), completed: isCompleted(i) }))
    .filter(r => r.kind && types[r.kind])
    .filter(r => teamArea === 'all' || r.team === teamArea)
    .filter(r => includeParked || !r.parked);

  const areaDefs = [...PRODUCT_AREAS, OTHER_AREA];
  const areas = areaDefs.map(def => {
    const inArea = rows.filter(r => r.area === def.key);
    const bugs = inArea.filter(r => r.kind === 'bug');
    const defects = inArea.filter(r => r.kind === 'defect');
    const inWindow = r => createdWithin(r, windowDays, now);

    const monthly = buckets.map(b => bugs.filter(r => {
      const t = new Date(r.created_at).getTime();
      return t >= b.start && t < b.end;
    }).length);

    const bugsInWindow = bugs.filter(inWindow).length;
    const defectsInWindow = defects.filter(inWindow).length;
    const open = inArea.filter(r => !r.completed);
    const bounce = open.filter(r => REWORK_STATUSES.includes(lower(r.status)));

    const customerMap = new Map();
    for (const r of inArea) {
      for (const name of customerNames(r.customer)) {
        if (NOT_A_CUSTOMER.has(name.toLowerCase())) continue;
        customerMap.set(name, (customerMap.get(name) || 0) + 1);
      }
    }
    const customers = [...customerMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6);

    const exclude = def.patterns || [];
    const phrases = phraseFrequency(inArea.map(r => r.summary), { min: 2, limit: 10, exclude });

    const recent = open
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);

    return {
      key: def.key,
      label: def.label,
      hint: def.hint,
      total: inArea.length,
      open: open.length,
      bugsInWindow,
      defectsInWindow,
      // null when there is nothing to divide by — the UI says "no defects
      // logged" rather than showing a fake infinity.
      escapeRatio: defectsInWindow ? bugsInWindow / defectsInWindow : (bugsInWindow ? null : 0),
      bounce: bounce.length,
      monthly,
      trend: trendDelta(monthly),
      customers,
      phrases,
      recent
    };
  }).filter(a => a.total > 0);

  const totals = {
    open: rows.filter(r => !r.completed).length,
    bugsInWindow: rows.filter(r => r.kind === 'bug' && createdWithin(r, windowDays, now)).length,
    defectsInWindow: rows.filter(r => r.kind === 'defect' && createdWithin(r, windowDays, now)).length,
    bounce: rows.filter(r => !r.completed && REWORK_STATUSES.includes(lower(r.status))).length,
    unclassified: rows.filter(r => r.area === OTHER_AREA.key).length,
    considered: rows.length
  };

  return { areas, totals, months: buckets.map(b => b.label), windowDays, teamArea, types, includeParked, now };
}

/**
 * Sort areas by one of SORT_OPTIONS. Null values (no trend / no defects) sink.
 *
 * @param {object[]} areas
 * @param {string} key
 * @returns {object[]}
 */
export function sortAreas(areas, key) {
  const val = a => key === 'count' ? a.open
    : key === 'trend' ? a.trend
      : key === 'escape' ? a.escapeRatio
        : key === 'bounce' ? a.bounce
          : a.open;
  return areas.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null && vb === null) return b.open - a.open;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va || b.open - a.open;
  });
}

/**
 * Read the cache and build the explorer.
 *
 * @param {object} [options] - see buildBugPatterns()
 * @returns {Promise<object>}
 */
export async function loadBugPatterns(options = {}) {
  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  return buildBugPatterns(issues, options);
}
