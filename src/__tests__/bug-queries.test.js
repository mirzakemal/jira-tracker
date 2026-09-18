import { describe, it, expect } from 'vitest';
import { productAreaFor, phraseFrequency, PRODUCT_AREAS } from '../utils/product-area.js';
import { buildBugPatterns, sortAreas, trendDelta, monthBuckets, SORT_OPTIONS } from '../db/bug-queries.js';

const DAY = 86400000;
const NOW = new Date('2026-09-17T12:00:00Z').getTime();
const ago = days => new Date(NOW - days * DAY).toISOString();

const bug = (key, over = {}) => ({
  key, project_key: 'TSM2', issue_type: 'Bug', status: 'To Do', status_category: 'To Do',
  priority: 'Medium', summary: `Bug ${key}`, customer: '',
  created_at: ago(10), updated_at: ago(1), resolved_at: null, ...over
});

describe('productAreaFor — real TSM2 titles', () => {
  const cases = [
    ['Gateway data uses Organisation Name instead of Company Name for API-created POs', 'gateway'],
    ['reduce MAH payment sync processed per call and increase api timeout', 'gateway'],
    ['Race condition allows concurrent unauthenticated invoice form access to overwrite draft invoice data', 'invoicing'],
    ['Bulk Update Payment Status: fire-and-forget writes cause stale list status', 'invoicing'],
    ['Contract list "Create Variation" button ignores Contract Variation functionality toggle', 'contracts'],
    ['Fix supplier invite mail for PR with no description', 'suppliers'],
    ['[evaluation type "number"] Incorrect required proposed item validation when another score field is empty', 'evaluation'],
    ['PO list Purchaser column falls back to GR-workflow approver instead of imported purchaser (TTS-477)', 'po'],
    ['[Item Master] Export Items button does not export all items', 'sourcing'],
    ['tenderboard_inbound_log.data TEXT column overflow crashes inbound.php on verbose email replies', 'email'],
    ['Report Designer: Line Item PO Report reindex stalls on Non-Purchase POs', 'po'],
    ['NAFA logo on tender search page still shows old image', 'sourcing'],
    ['View Internal Requisition Form ignores Form Designer \'Visible When\' conditional settings', 'sourcing'],
    ['Something entirely unrecognisable happened', 'other']
  ];
  for (const [title, expected] of cases) {
    it(`${expected.padEnd(10)} ← ${title.slice(0, 60)}`, () => {
      expect(productAreaFor(title)).toBe(expected);
    });
  }

  it('accepts an issue record as well as a bare title', () => {
    expect(productAreaFor({ summary: 'Direct Invoice PDF renders raw Unix timestamp' })).toBe('invoicing');
  });

  it('every area has a label, a hint and at least one pattern', () => {
    for (const a of PRODUCT_AREAS) {
      expect(a.label).toBeTruthy();
      expect(a.hint).toBeTruthy();
      expect(a.patterns.length).toBeGreaterThan(0);
    }
  });
});

describe('phraseFrequency', () => {
  it('surfaces the phrases that recur, ignoring keys, brackets and stopwords', () => {
    const titles = [
      '[Bid Submission -> Submit Item Master Details popup] Fields with "Visible When" conditional settings are not displayed',
      '[ITEM MASTER] Custom fields "Visible When" conditionals cannot read values in "Item Status" Field.',
      "View Internal Requisition Form ignores Form Designer 'Visible When' conditional settings",
      '[Item Master] Export Items button does not export all items (TSM2-8215)'
    ];
    const top = phraseFrequency(titles, { min: 2 });
    const phrases = top.map(p => p.phrase.toLowerCase());
    expect(phrases).toContain('visible when');
    expect(phrases).toContain('item master');
    expect(top.find(p => p.phrase.toLowerCase() === 'visible when').count).toBe(3);
    expect(phrases.some(p => /tsm2/.test(p))).toBe(false);
  });

  it('counts a phrase once per title and honours exclusions', () => {
    const titles = ['sync sync sync', 'sync again'];
    expect(phraseFrequency(titles).find(p => p.phrase === 'sync').count).toBe(2);
    expect(phraseFrequency(titles, { exclude: [/\bsync\b/i] }).find(p => p.phrase === 'sync')).toBeUndefined();
  });
});

describe('buildBugPatterns', () => {
  it('buckets bugs by month and computes trend, escape ratio and bounce per area', () => {
    const issues = [
      // Invoicing: 3 bugs (one old), 1 defect, 1 bounced
      bug('TSM2-1', { summary: 'Invoice total wrong', created_at: ago(5), status: 'Test Comments' }),
      bug('TSM2-2', { summary: 'Invoice PDF blank', created_at: ago(40) }),
      bug('TSM2-3', { summary: 'Invoice duplicate', created_at: ago(300), status: 'Delivered / Released', status_category: 'Done' }),
      bug('TSM2-4', { summary: 'Invoice rounding', created_at: ago(20), issue_type: 'Defect' }),
      // Gateway: 2 bugs, no defects
      bug('TSM2-5', { summary: 'Gateway timeout', created_at: ago(3), customer: 'MAH' }),
      bug('TSM2-6', { summary: 'SAP export fails', created_at: ago(8), customer: 'MAH, internal' }),
      // Not a bug type, ignored
      bug('TSM2-7', { summary: 'Invoice task', issue_type: 'Task' }),
      // Other project, ignored
      bug('PDT-1', { project_key: 'PDT', summary: 'Invoice request' })
    ];
    const result = buildBugPatterns(issues, { now: NOW, months: 12 });

    const inv = result.areas.find(a => a.key === 'invoicing');
    expect(inv.total).toBe(4);
    expect(inv.open).toBe(3);
    expect(inv.bugsInWindow).toBe(3);
    expect(inv.defectsInWindow).toBe(1);
    expect(inv.escapeRatio).toBe(3);
    expect(inv.bounce).toBe(1);
    expect(inv.monthly).toHaveLength(12);
    expect(inv.monthly.reduce((a, b) => a + b, 0)).toBe(3);

    const gw = result.areas.find(a => a.key === 'gateway');
    expect(gw.escapeRatio).toBeNull(); // bugs but no defects: nothing to divide by
    expect(gw.customers).toEqual([{ name: 'MAH', count: 2 }]); // internal dropped

    expect(result.totals).toMatchObject({ open: 5, bounce: 1, considered: 6, unclassified: 0 });
    expect(result.areas.find(a => a.key === 'other')).toBeUndefined(); // empty areas are omitted
  });

  it('respects the type toggles, team-area scope, and the parked filter', () => {
    const issues = [
      bug('TSM2-1', { summary: 'Invoice total wrong' }),
      bug('TSM2-2', { summary: 'Invoice PDF blank', issue_type: 'Defect' }),
      bug('TSM2-3', { summary: 'Gateway timeout' }),
      bug('TSM2-4', { summary: '[Archived] Invoice ancient' })
    ];
    expect(buildBugPatterns(issues, { now: NOW, types: { bug: true, defect: false } }).totals.considered).toBe(2);
    expect(buildBugPatterns(issues, { now: NOW, teamArea: 'integration' }).totals.considered).toBe(1);
    expect(buildBugPatterns(issues, { now: NOW, includeParked: true }).totals.considered).toBe(4);
  });

  it('exposes recent open bugs per area, newest first, capped', () => {
    const issues = Array.from({ length: 10 }, (_, i) => bug(`TSM2-${i}`, { summary: `Invoice bug ${i}`, created_at: ago(i) }));
    const inv = buildBugPatterns(issues, { now: NOW }).areas.find(a => a.key === 'invoicing');
    expect(inv.recent).toHaveLength(8);
    expect(inv.recent[0].key).toBe('TSM2-0');
  });
});

describe('sorting and helpers', () => {
  const areas = [
    { key: 'a', open: 5, trend: 0.5, escapeRatio: null, bounce: 0 },
    { key: 'b', open: 9, trend: -0.2, escapeRatio: 4, bounce: 3 },
    { key: 'c', open: 2, trend: null, escapeRatio: 1, bounce: 1 }
  ];
  it('sorts by each option and sinks nulls', () => {
    expect(sortAreas(areas, 'count').map(a => a.key)).toEqual(['b', 'a', 'c']);
    expect(sortAreas(areas, 'trend').map(a => a.key)).toEqual(['a', 'b', 'c']);
    expect(sortAreas(areas, 'escape').map(a => a.key)).toEqual(['b', 'c', 'a']);
    expect(sortAreas(areas, 'bounce').map(a => a.key)).toEqual(['b', 'c', 'a']);
  });

  it('every sort option carries an explanation for the UI', () => {
    expect(SORT_OPTIONS.map(o => o.key)).toEqual(['count', 'trend', 'escape', 'bounce']);
    for (const o of SORT_OPTIONS) expect(o.explain.length).toBeGreaterThan(30);
  });

  it('trendDelta compares first and last thirds', () => {
    expect(trendDelta([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])).toBeCloseTo(2);
    expect(trendDelta([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0])).toBe(0);
    expect(trendDelta([0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2])).toBeNull();
    expect(trendDelta([1, 2])).toBeNull();
  });

  it('monthBuckets ends on the current month, oldest first', () => {
    const b = monthBuckets(3, NOW);
    expect(b.map(x => x.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(b[2].start).toBeLessThanOrEqual(NOW);
    expect(b[2].end).toBeGreaterThan(NOW);
  });
});
