import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  buildRadar, triageFromTags, customerNames, daysSince,
  HIGH_PRIORITY_AGE_DAYS, FLOW_WINDOW_DAYS
} from '../db/radar-queries.js';

const DAY = 86400000;
const NOW = new Date('2026-09-17T12:00:00Z').getTime();
const ago = days => new Date(NOW - days * DAY).toISOString();

/** A TSM2 record shaped like sync.js writes it. */
const eng = (key, over = {}) => ({
  key, project_key: 'TSM2', issue_type: 'Bug', status: 'To Do', status_category: 'To Do',
  priority: 'Medium', summary: `Engineering ${key}`, customer: '',
  created_at: ago(10), updated_at: ago(1), resolved_at: null, ...over
});
const pdt = (key, over = {}) => ({
  key, project_key: 'PDT', issue_type: 'Customer Request', status: 'Plan', status_category: 'To Do',
  priority: 'Medium', summary: `Product ${key}`, customer: '',
  created_at: ago(30), updated_at: ago(5), resolved_at: null, ...over
});

describe('buildRadar — decisions', () => {
  it('lists PDT cards in Plan / Feedback / Validation, idlest first', () => {
    const radar = buildRadar([
      pdt('PDT-1', { status: 'Plan', updated_at: ago(40) }),
      pdt('PDT-2', { status: 'Feedback', updated_at: ago(2) }),
      pdt('PDT-3', { status: 'Validation', status_category: 'In Progress', updated_at: ago(9) }),
      pdt('PDT-4', { status: 'Ready for Development' })
    ], {}, { now: NOW });
    expect(radar.decisions.map(r => r.key)).toEqual(['PDT-1', 'PDT-3', 'PDT-2']);
    expect(radar.decisions[0].idleDays).toBe(40);
  });

  it('hides parked cards by default and counts them, shows them on request', () => {
    const issues = [
      pdt('PDT-15', { summary: '[On Hold]Further improvement for Company Names settings' }),
      pdt('PDT-46', { summary: '[WIP] Extend User Placeholder to Conditional Settings' }),
      pdt('PDT-60', { status: 'Validation' })
    ];
    const hidden = buildRadar(issues, {}, { now: NOW });
    expect(hidden.decisions.map(r => r.key)).toEqual(['PDT-60']);
    expect(hidden.parkedCount).toBe(2);

    const shown = buildRadar(issues, {}, { now: NOW, includeParked: true });
    expect(shown.decisions).toHaveLength(3);
    expect(shown.decisions.find(r => r.key === 'PDT-15').parked).toEqual({ source: 'title', value: '[on hold]' });
  });

  it('respects a hand-parked triage tag', () => {
    const radar = buildRadar([pdt('PDT-1'), pdt('PDT-2')], { 'PDT-2': ['triage:parked'] }, { now: NOW });
    expect(radar.decisions.map(r => r.key)).toEqual(['PDT-1']);
    expect(radar.parkedCount).toBe(1);
  });
});

describe('buildRadar — high priority ageing', () => {
  it(`includes Highest/High open work at or past ${HIGH_PRIORITY_AGE_DAYS} days, oldest first`, () => {
    const radar = buildRadar([
      eng('TSM2-1', { priority: 'High', created_at: ago(31) }),
      eng('TSM2-2', { priority: 'Highest', created_at: ago(400) }),
      eng('TSM2-3', { priority: 'High', created_at: ago(29) }),      // too young
      eng('TSM2-4', { priority: 'Medium', created_at: ago(500) }),   // not high
      eng('TSM2-5', { priority: 'High', created_at: ago(200), status: 'Delivered / Released', status_category: 'Done' }) // done
    ], {}, { now: NOW });
    expect(radar.hot.map(r => r.key)).toEqual(['TSM2-2', 'TSM2-1']);
  });

  it('treats customer = Archived as parked', () => {
    const radar = buildRadar([
      eng('TSM2-1', { priority: 'High', created_at: ago(100), customer: 'Archived' }),
      eng('TSM2-2', { priority: 'High', created_at: ago(100), customer: 'NTUC' })
    ], {}, { now: NOW });
    expect(radar.hot.map(r => r.key)).toEqual(['TSM2-2']);
    expect(radar.parkedCount).toBe(1);
  });
});

describe('buildRadar — rework', () => {
  it('counts every bounced card and lists the high-priority ones', () => {
    const radar = buildRadar([
      eng('TSM2-1', { status: 'Test Comments' }),
      eng('TSM2-2', { status: 'TEST RUN FAILED', priority: 'High', created_at: ago(50) }),
      eng('TSM2-3', { status: 'Testing' })
    ], {}, { now: NOW });
    expect(radar.rework.count).toBe(2);
    expect(radar.rework.high.map(r => r.key)).toEqual(['TSM2-2']);
  });
});

describe('buildRadar — flow by team area', () => {
  it('measures created vs completed in the window, using derived completion', () => {
    const radar = buildRadar([
      // Integration: 3 created in window, 2 completed (Done category, NO resolution)
      eng('TSM2-1', { summary: 'Gateway sync', created_at: ago(20) }),
      eng('TSM2-2', { summary: 'SAP export', created_at: ago(40), status: 'Delivered / Released', status_category: 'Done', updated_at: ago(30) }),
      eng('TSM2-7', { summary: 'Xero payment sync', created_at: ago(50), status: 'Delivered / Released', status_category: 'Done', updated_at: ago(10) }),
      // Project: 3 created, 0 completed → starved
      eng('TSM2-3', { created_at: ago(5), customer: 'NCL' }),
      eng('TSM2-4', { created_at: ago(6), customer: 'NCL' }),
      eng('TSM2-5', { created_at: ago(7), customer: 'NCL' }),
      // Old completed work outside the window does not count as outflow
      eng('TSM2-6', { created_at: ago(400), status: 'Done', status_category: 'Done', updated_at: ago(200), customer: 'NCL' })
    ], {}, { now: NOW });

    expect(radar.flow.integration).toMatchObject({ created: 3, completed: 2, open: 1, state: 'growing' });
    expect(radar.flow.project).toMatchObject({ created: 3, completed: 0, state: 'starved' });
    expect(radar.flow.core).toMatchObject({ created: 0, completed: 0, state: 'quiet' });
    expect(radar.flow.total).toEqual({ created: 6, completed: 2, open: 4 });
  });

  it('reports keeping-up when completions match arrivals', () => {
    const radar = buildRadar([
      eng('TSM2-1', { created_at: ago(10), customer: 'A' }),
      eng('TSM2-2', { created_at: ago(300), status: 'Done', status_category: 'Done', updated_at: ago(3), customer: 'A' })
    ], {}, { now: NOW });
    expect(radar.flow.project.state).toBe('keeping-up');
  });

  it(`uses a ${FLOW_WINDOW_DAYS}-day window`, () => {
    const radar = buildRadar([eng('TSM2-1', { created_at: ago(FLOW_WINDOW_DAYS + 1), customer: 'A' })], {}, { now: NOW });
    expect(radar.flow.total.created).toBe(0);
  });
});

describe('buildRadar — customers and area filter', () => {
  const issues = [
    eng('TSM2-1', { priority: 'High', created_at: ago(60), customer: 'NCL' }),
    eng('TSM2-2', { priority: 'High', created_at: ago(90), customer: 'NCL' }),
    eng('TSM2-3', { priority: 'Highest', created_at: ago(45), customer: 'SIM, internal' }),
    eng('TSM2-4', { priority: 'High', created_at: ago(45), customer: 'internal' }),
    eng('TSM2-5', { priority: 'High', created_at: ago(45), customer: 'productionFix' }),
    eng('TSM2-6', { priority: 'High', created_at: ago(45), summary: 'Gateway Xero disconnects', customer: 'MAH' })
  ];

  it('groups named customers from the hot list and drops the non-customers', () => {
    const radar = buildRadar(issues, {}, { now: NOW });
    expect(radar.customers.map(c => [c.name, c.count, c.oldestDays])).toEqual([
      ['NCL', 2, 90], ['MAH', 1, 45], ['SIM', 1, 45]
    ]);
  });

  it('scopes every signal to the chosen team area', () => {
    const radar = buildRadar(issues, {}, { now: NOW, area: 'integration' });
    expect(radar.hot.map(r => r.key)).toEqual(['TSM2-6']);
    expect(radar.customers.map(c => c.name)).toEqual(['MAH']);
    // Flow always reports all three areas; only the lists are scoped.
    expect(Object.keys(radar.flow)).toEqual(['project', 'integration', 'core', 'total']);
  });
});

describe('helpers', () => {
  it('triageFromTags reads only known states under the prefix', () => {
    expect(triageFromTags(['frontend', 'triage:decision'])).toBe('decision');
    expect(triageFromTags(['triage:bogus'])).toBeNull();
    expect(triageFromTags(undefined)).toBeNull();
  });

  it('customerNames splits on commas and slashes', () => {
    expect(customerNames('SAMH/SACS')).toEqual(['SAMH', 'SACS']);
    expect(customerNames('Makino, internal')).toEqual(['Makino', 'internal']);
    expect(customerNames('')).toEqual([]);
  });

  it('daysSince floors and never goes negative', () => {
    expect(daysSince(ago(3.9), NOW)).toBe(3);
    expect(daysSince(new Date(NOW + DAY).toISOString(), NOW)).toBe(0);
    expect(daysSince('garbage', NOW)).toBeNull();
  });
});

describe('loadRadar / setTriage against the cache', () => {
  let db, radar;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    radar = await import('../db/radar-queries.js');
    await db.initDatabase();
    for (const s of ['issues', 'tags']) { try { await db.clear(s); } catch { /* ignore */ } }
  });

  it('reads issues and tags from IndexedDB and applies triage', async () => {
    await db.putBulk('issues', [pdt('PDT-1'), pdt('PDT-2')]);
    await radar.setTriage('PDT-2', 'parked');

    const result = await radar.loadRadar({ now: NOW });
    expect(result.decisions.map(r => r.key)).toEqual(['PDT-1']);
    expect(result.parkedCount).toBe(1);
  });

  it('setTriage replaces a previous state and clears with null', async () => {
    await db.putBulk('issues', [pdt('PDT-1')]);
    await radar.setTriage('PDT-1', 'reviewed');
    await radar.setTriage('PDT-1', 'decision');
    let tags = (await db.getByIndex('tags', 'issue_key', 'PDT-1')).map(t => t.tag_name);
    expect(tags).toEqual(['triage:decision']);

    await radar.setTriage('PDT-1', null);
    tags = await db.getByIndex('tags', 'issue_key', 'PDT-1');
    expect(tags).toHaveLength(0);
  });

  it('rejects an unknown triage state', async () => {
    await expect(radar.setTriage('PDT-1', 'urgent')).rejects.toThrow('Unknown triage state');
  });
});
