/**
 * Epic hydration — fetching epics and children the board sweep never cached.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

/** TSM2-5515 "Complicated Evaluation Module" and two of its ten real children. */
const EPIC = {
  id: '40050',
  key: 'TSM2-5515',
  fields: {
    project: { key: 'TSM2' },
    summary: 'Complicated Evaluation Module',
    status: { name: 'In Progress', statusCategory: { name: 'To Do' } },
    issuetype: { name: 'Epic' },
    assignee: { accountId: 'a1', displayName: 'alfatio' },
    updated: '2026-09-01T00:00:00Z'
  }
};

const CHILDREN = [
  {
    id: '40051',
    key: 'TSM2-5516',
    fields: {
      project: { key: 'TSM2' },
      summary: 'Evaluation per Line Item',
      status: { name: 'Tested', statusCategory: { name: 'Done' } },
      issuetype: { name: 'Task' },
      assignee: { accountId: 'a1', displayName: 'alfatio' },
      parent: { key: 'TSM2-5515' }
    }
  },
  {
    id: '59839',
    key: 'TSM2-6640',
    fields: {
      project: { key: 'TSM2' },
      summary: '[Evaluation Module Form] popup link duplicated',
      status: { name: 'To Do', statusCategory: { name: 'To Do' } },
      issuetype: { name: 'Bug' },
      assignee: null,
      parent: { key: 'TSM2-5515' }
    }
  }
];

function fakeClient(overrides = {}) {
  return {
    getIssue: vi.fn().mockResolvedValue(EPIC),
    getEpicIssues: vi.fn().mockResolvedValue(CHILDREN),
    ...overrides
  };
}

describe('hydrateEpic', () => {
  let db, hydrator, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    hydrator = await import('../db/epic-hydrator.js');
    pq = await import('../db/product-queries.js');
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
  });

  it('writes an uncached epic and its children into the issues store', async () => {
    const client = fakeClient();
    const result = await hydrator.hydrateEpic(client, 'TSM2-5515');

    expect(result).toEqual({ epic: true, children: 2 });
    expect((await db.get('issues', 'TSM2-5515')).summary).toBe('Complicated Evaluation Module');
    expect((await db.get('issues', 'TSM2-5516')).parent_key).toBe('TSM2-5515');
  });

  it('makes the children findable through the parent_key index', async () => {
    await hydrator.hydrateEpic(fakeClient(), 'TSM2-5515');

    const children = await pq.getChildIssues('TSM2-5515');
    expect(children.map(c => c.key)).toEqual(['TSM2-5516', 'TSM2-6640']);
    expect(children[0].status).toBe('Tested');
    expect(children[0].assignee_name).toBe('alfatio');
  });

  it('does not refetch an epic that is already cached with a summary', async () => {
    await db.put('issues', {
      key: 'TSM2-5515', project_key: 'TSM2', summary: 'Already here', raw_data: '{}'
    });
    const client = fakeClient();

    const result = await hydrator.hydrateEpic(client, 'TSM2-5515');

    expect(client.getIssue).not.toHaveBeenCalled();
    expect(result.epic).toBe(false);
    // Children are still fetched — the epic being cached says nothing about them.
    expect(client.getEpicIssues).toHaveBeenCalled();
  });

  it('refetches an epic cached without a summary', async () => {
    await db.put('issues', { key: 'TSM2-5515', project_key: 'TSM2', raw_data: '{}' });
    const client = fakeClient();

    await hydrator.hydrateEpic(client, 'TSM2-5515');

    expect(client.getIssue).toHaveBeenCalled();
    expect((await db.get('issues', 'TSM2-5515')).summary).toBe('Complicated Evaluation Module');
  });

  it('still writes children when the epic fetch fails', async () => {
    const client = fakeClient({ getIssue: vi.fn().mockRejectedValue(new Error('403')) });

    const result = await hydrator.hydrateEpic(client, 'TSM2-5515');

    expect(result).toEqual({ epic: false, children: 2 });
    expect(await db.get('issues', 'TSM2-5516')).toBeTruthy();
  });

  it('survives a children fetch that fails', async () => {
    const client = fakeClient({ getEpicIssues: vi.fn().mockRejectedValue(new Error('400')) });

    const result = await hydrator.hydrateEpic(client, 'TSM2-5515');

    expect(result).toEqual({ epic: true, children: 0 });
    expect(await db.get('issues', 'TSM2-5515')).toBeTruthy();
  });

  it('does nothing without a client', async () => {
    expect(await hydrator.hydrateEpic(null, 'TSM2-5515')).toEqual({ epic: false, children: 0 });
  });

  it('marks hydrated records so they are distinguishable from synced ones', async () => {
    await hydrator.hydrateEpic(fakeClient(), 'TSM2-5515');
    expect((await db.get('issues', 'TSM2-5515')).hydrated).toBe(true);
  });
});

describe('hydrateEpics', () => {
  let db, hydrator;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    hydrator = await import('../db/epic-hydrator.js');
    await db.initDatabase();
    try { await db.clear('issues'); } catch { /* ignore */ }
  });

  it('skips epics already handled this session', async () => {
    const client = fakeClient();
    const seen = new Set();

    await hydrator.hydrateEpics(client, ['TSM2-5515'], seen);
    await hydrator.hydrateEpics(client, ['TSM2-5515'], seen);

    expect(client.getEpicIssues).toHaveBeenCalledTimes(1);
  });

  it('deduplicates keys within one call', async () => {
    const client = fakeClient();
    await hydrator.hydrateEpics(client, ['TSM2-5515', 'TSM2-5515'], new Set());
    expect(client.getEpicIssues).toHaveBeenCalledTimes(1);
  });

  it('returns how many epics gained data', async () => {
    expect(await hydrator.hydrateEpics(fakeClient(), ['TSM2-5515'], new Set())).toBe(1);
  });
});

describe('Dashboard fills in a bare epic after first paint', () => {
  let db, CustomerDashboardView;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    ({ CustomerDashboardView } = await import('../components/CustomerDashboardView.js'));
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
    document.body.innerHTML = '<div id="issue-board-container"></div>';
  });

  it('renders the epic summary and children once hydration completes', async () => {
    // TSM2-6789 links to an epic that is not in the cache at all.
    await db.put('issues', {
      key: 'TSM2-6789', project_key: 'TSM2', issue_type: 'Customer',
      summary: 'Nam Cheong Customer Card', status: 'Testing',
      status_category: 'In Progress', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'TSM2-6789', target_key: 'TSM2-5515',
      link_type: 'Relates', target_type: 'Epic'
    });

    const view = new CustomerDashboardView(fakeClient(), 'tenderboard.atlassian.net', () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();

    // load() kicks hydration off in the background; wait for that same run
    // rather than starting a second one the dedupe set would short-circuit.
    await view._hydrating;

    expect(document.querySelector('.cd-link-is-epic').textContent)
      .toContain('Complicated Evaluation Module');
    expect(document.querySelectorAll('.cd-link-child')).toHaveLength(2);
    expect(document.querySelector('.cd-children-label').textContent)
      .toContain('2 child work items in TSM2-5515');
  });

  it('does nothing when there is no client', async () => {
    await db.put('issues', {
      key: 'TSM2-6789', project_key: 'TSM2', issue_type: 'Customer',
      summary: 'Nam Cheong Customer Card', raw_data: '{}'
    });
    const view = new CustomerDashboardView(null, 'example.atlassian.net', () => {});
    document.getElementById('issue-board-container').innerHTML = view.render();
    await view.load();

    await expect(view.hydrateVisibleEpics()).resolves.toBeUndefined();
  });
});
