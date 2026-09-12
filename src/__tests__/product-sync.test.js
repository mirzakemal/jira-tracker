import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

const STORE_NAMES = ['issues', 'issuelinks', 'product_cards', 'doc_drafts'];

// Board IDs are read from import.meta.env at module load, so stub before import.
vi.stubEnv('VITE_PRODUCT_BOARD_ID', '100');
vi.stubEnv('VITE_ENG_BOARD_ID', '200');
vi.stubEnv('VITE_ENG_LINK_FIELD', 'customfield_99001');
vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_USER_PERSONA_FIELD', 'customfield_99002');

async function reset(db) {
  await db.initDatabase();
  for (const name of STORE_NAMES) {
    try { await db.clear(name); } catch { /* ignore */ }
  }
}

/** Build an issue record shaped like sync.js writes it. */
function issue(key, overrides = {}) {
  const { fields, ...rest } = overrides;
  return {
    key,
    summary: `Summary ${key}`,
    status: 'To Do',
    status_category: 'To Do',
    board_id: 200,
    // Product Board membership is decided by project key, not board id.
    project_key: key.startsWith('PROD') ? 'PDT' : 'ENG',
    parent_key: null,
    assignee_id: null,
    assignee_name: null,
    raw_data: JSON.stringify({ fields: fields || {} }),
    ...rest
  };
}

describe('Eng card link detection', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('prefers an explicit custom field over any issue link', async () => {
    await db.put('issues', issue('PROD-1', {
      board_id: 100,
      fields: { customfield_99001: 'ENG-77' }
    }));
    await db.put('issues', issue('ENG-77'));
    await db.put('issues', issue('ENG-88'));
    await db.put('issuelinks', {
      source_key: 'PROD-1', target_key: 'ENG-88', link_type: 'implements'
    });

    const match = await pq.detectEngIssueLink('PROD-1');
    expect(match).toEqual({ key: 'ENG-77', source: 'custom_field' });
  });

  it('extracts an issue key from a custom field containing prose', async () => {
    await db.put('issues', issue('PROD-2', {
      board_id: 100,
      fields: { customfield_99001: 'delivered by ENG-42' }
    }));
    await db.put('issues', issue('ENG-42'));

    const match = await pq.detectEngIssueLink('PROD-2');
    expect(match.key).toBe('ENG-42');
  });

  it('falls back to a typed issue link', async () => {
    await db.put('issues', issue('PROD-3', { board_id: 100 }));
    await db.put('issues', issue('ENG-10'));
    await db.put('issuelinks', {
      source_key: 'PROD-3', target_key: 'ENG-10', link_type: 'implements'
    });

    const match = await pq.detectEngIssueLink('PROD-3');
    expect(match).toEqual({ key: 'ENG-10', source: 'issue_link' });
  });

  it('detects an epic/parent child on the Engineering board', async () => {
    await db.put('issues', issue('PROD-4', { board_id: 100 }));
    await db.put('issues', issue('ENG-20', { parent_key: 'PROD-4' }));

    const match = await pq.detectEngIssueLink('PROD-4');
    expect(match).toEqual({ key: 'ENG-20', source: 'epic_parent' });
  });

  it('prefers a candidate that lives on the Engineering board', async () => {
    await db.put('issues', issue('PROD-5', { board_id: 100 }));
    await db.put('issues', issue('DESIGN-1', { board_id: 300 }));
    await db.put('issues', issue('ENG-30', { board_id: 200 }));
    await db.put('issuelinks', {
      source_key: 'PROD-5', target_key: 'DESIGN-1', link_type: 'implements'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-5', target_key: 'ENG-30', link_type: 'implements'
    });

    const match = await pq.detectEngIssueLink('PROD-5');
    expect(match.key).toBe('ENG-30');
  });

  it('never returns the product issue itself', async () => {
    await db.put('issues', issue('PROD-6', { board_id: 100 }));
    await db.put('issuelinks', {
      source_key: 'PROD-6', target_key: 'PROD-6', link_type: 'relates'
    });

    expect(await pq.detectEngIssueLink('PROD-6')).toBeNull();
  });

  it('returns null when nothing links the product issue', async () => {
    await db.put('issues', issue('PROD-7', { board_id: 100 }));
    expect(await pq.detectEngIssueLink('PROD-7')).toBeNull();
  });
});

describe('Milestone triggers', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('maps Ready to Test and Released statuses to milestones', async () => {
    expect(pq.milestoneForStatus({ status: 'Ready to Test' })).toBe('ready_to_test');
    expect(pq.milestoneForStatus({ status: 'ready for qa' })).toBe('ready_to_test');
    expect(pq.milestoneForStatus({ status: 'Released' })).toBe('released');
    expect(pq.milestoneForStatus({ status: 'In Progress' })).toBeNull();
  });

  it('recognises the Polaris delivery link as the Eng link', async () => {
    // Jira Product Discovery's link type, the most common on PDT.
    await db.put('issues', {
      key: 'TSM2-4395', project_key: 'TSM2', status: 'Delivered / Released',
      assignee_id: 'a1', assignee_name: 'alfatio', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-60', target_key: 'TSM2-4395',
      link_type: 'Polaris work item link', direction: 'inward'
    });

    const match = await pq.detectEngIssueLink('PROD-60');
    expect(match).toEqual({ key: 'TSM2-4395', source: 'issue_link' });
  });

  it('treats a TSM2 key as an Eng issue even before it is cached', async () => {
    await db.put('issuelinks', {
      source_key: 'PROD-61', target_key: 'TSM2-9999', link_type: 'Relates'
    });

    const match = await pq.detectEngIssueLink('PROD-61');
    expect(match.key).toBe('TSM2-9999');
  });

  it('does NOT treat a Done status category as Released', () => {
    // TSM2 files several in-flight statuses under the Done category. Trusting
    // the category would report most of engineering as shipped.
    expect(pq.milestoneForStatus({ status: 'Tested', status_category: 'Done' })).toBeNull();
    expect(pq.milestoneForStatus({ status: 'Ready for Regression', status_category: 'Done' }))
      .toBeNull();
    expect(pq.milestoneForStatus({ status: 'TEST RUN PASSED', status_category: 'In Progress' }))
      .toBeNull();
  });

  it('maps the real TSM2 milestone statuses', () => {
    // "Ready To Test" is Done-category in TSM2 but is the test prompt, not release.
    expect(pq.milestoneForStatus({ status: 'Ready To Test', status_category: 'Done' }))
      .toBe('ready_to_test');
    expect(pq.milestoneForStatus({ status: 'Delivered / Released', status_category: 'Done' }))
      .toBe('released');
  });

  it('flags the milestone on the card when the Eng card reaches Ready to Test', async () => {
    await db.put('issues', issue('ENG-50', {
      status: 'Ready to Test', assignee_id: 'a1', assignee_name: 'Dana'
    }));
    await db.put('issuelinks', {
      source_key: 'PROD-10', target_key: 'ENG-50', link_type: 'implements'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-10', title: 'Feature' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_status).toBe('Ready to Test');
    expect(card.assigned_engineer_name).toBe('Dana');
    expect(card.milestones.ready_to_test).toMatchObject({
      eng_issue_key: 'ENG-50',
      acknowledged: false
    });
    expect(card.milestones.ready_to_test.reached_at).toBeTruthy();
  });

  it('does not overwrite reached_at when the status persists across syncs', async () => {
    await db.put('issues', issue('ENG-51', { status: 'Ready to Test' }));
    await db.put('issuelinks', {
      source_key: 'PROD-11', target_key: 'ENG-51', link_type: 'implements'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-11', title: 'F' });
    const first = await pq.resolveAssignedEngineer(id);
    await new Promise(r => setTimeout(r, 5));
    const second = await pq.resolveAssignedEngineer(id);

    expect(second.milestones.ready_to_test.reached_at)
      .toBe(first.milestones.ready_to_test.reached_at);
  });

  it('keeps an earlier milestone when the Eng card moves on to Released', async () => {
    await db.put('issues', issue('ENG-52', { status: 'Ready to Test' }));
    await db.put('issuelinks', {
      source_key: 'PROD-12', target_key: 'ENG-52', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PROD-12', title: 'F' });
    await pq.resolveAssignedEngineer(id);

    await db.put('issues', issue('ENG-52', { status: 'Released' }));
    const card = await pq.resolveAssignedEngineer(id);

    expect(Object.keys(card.milestones).sort()).toEqual(['ready_to_test', 'released']);
  });

  it('getPendingMilestones lists unacknowledged milestones and acknowledge clears them', async () => {
    await db.put('issues', issue('ENG-53', { status: 'Released' }));
    await db.put('issuelinks', {
      source_key: 'PROD-13', target_key: 'ENG-53', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PROD-13', title: 'F' });
    await pq.resolveAssignedEngineer(id);

    const pending = await pq.getPendingMilestones();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ milestone: 'released', label: 'Released' });

    await pq.acknowledgeMilestone(id, 'released');
    expect(await pq.getPendingMilestones()).toHaveLength(0);
  });

  it('getPendingMilestones can filter to a single milestone', async () => {
    await db.put('issues', issue('ENG-54', { status: 'Ready to Test' }));
    await db.put('issuelinks', {
      source_key: 'PROD-14', target_key: 'ENG-54', link_type: 'implements'
    });
    const id = await pq.createProductCard({ product_issue_key: 'PROD-14', title: 'F' });
    await pq.resolveAssignedEngineer(id);

    expect(await pq.getPendingMilestones('released')).toHaveLength(0);
    expect(await pq.getPendingMilestones('ready_to_test')).toHaveLength(1);
  });
});

describe('Product board sync reconciliation', () => {
  let db, pq, ps;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ps = await import('../db/product-sync.js');
    await reset(db);
  });

  it('creates local cards from Product board issues', async () => {
    await db.put('issues', issue('PROD-20', {
      board_id: 100,
      summary: 'Bulk upload',
      status: 'Draft',
      customer: 'Acme Corp',
      fields: { customfield_99002: 'Procurement Manager' }
    }));

    const result = await ps.importProductBoardIssues();

    expect(result.created).toBe(1);
    const card = await pq.getProductCardByIssueKey('PROD-20');
    expect(card).toMatchObject({
      title: 'Bulk upload',
      status: 'Draft',
      customer: 'Acme Corp',
      user_persona: 'Procurement Manager'
    });
  });

  it('is idempotent — a second import updates rather than duplicates', async () => {
    await db.put('issues', issue('PROD-21', { board_id: 100 }));

    await ps.importProductBoardIssues();
    const second = await ps.importProductBoardIssues();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect((await pq.getProductCards()).length).toBe(1);
  });

  it('ignores issues that live on the Engineering board', async () => {
    await db.put('issues', issue('ENG-60', { board_id: 200 }));
    const result = await ps.importProductBoardIssues();

    expect(result.created).toBe(0);
    expect((await pq.getProductCards()).length).toBe(0);
  });

  it('syncProductBoard maps the engineer from the Eng card onto the product card', async () => {
    await db.put('issues', issue('PROD-22', { board_id: 100, summary: 'Personas' }));
    await db.put('issues', issue('ENG-61', {
      board_id: 200,
      status: 'Ready to Test',
      assignee_id: 'acc-7',
      assignee_name: 'Sam Dev'
    }));
    await db.put('issuelinks', {
      source_key: 'PROD-22', target_key: 'ENG-61', link_type: 'implements'
    });

    const summary = await ps.syncProductBoard();

    expect(summary.linked).toBe(1);
    expect(summary.pendingMilestones).toHaveLength(1);

    const card = await pq.getProductCardByIssueKey('PROD-22');
    expect(card.assigned_engineer_name).toBe('Sam Dev');
    expect(card.eng_issue_key).toBe('ENG-61');
    expect(card.link_source).toBe('issue_link');
  });

  it('leaves purely local draft cards untouched', async () => {
    const id = await pq.createProductCard({ title: 'Local idea only' });
    const summary = await ps.syncProductBoard();

    const card = await pq.getProductCard(id);
    expect(card.title).toBe('Local idea only');
    expect(summary.linked).toBe(0);
  });

  it('preserves milestone acknowledgements across a re-sync', async () => {
    await db.put('issues', issue('PROD-23', { board_id: 100 }));
    await db.put('issues', issue('ENG-62', { board_id: 200, status: 'Released' }));
    await db.put('issuelinks', {
      source_key: 'PROD-23', target_key: 'ENG-62', link_type: 'implements'
    });

    await ps.syncProductBoard();
    const card = await pq.getProductCardByIssueKey('PROD-23');
    await pq.acknowledgeMilestone(card.id, 'released');

    await ps.syncProductBoard();

    const after = await pq.getProductCardByIssueKey('PROD-23');
    expect(after.milestones.released.acknowledged).toBe(true);
    expect(await pq.getPendingMilestones()).toHaveLength(0);
  });

  it('getDualBoardConfig reports the configured project and board', async () => {
    expect(ps.getDualBoardConfig()).toEqual({
      configured: true, missing: [], projectKey: 'PDT'
    });
  });
});

describe('Eng-link fallback safety', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('does not adopt an off-board linked issue as the Eng card', async () => {
    // A design ticket related to the product issue — not engineering work.
    await db.put('issues', issue('DES-14', { board_id: 300, status: 'Done' }));
    await db.put('issuelinks', {
      source_key: 'PROD-50', target_key: 'DES-14', link_type: 'relates to'
    });

    const match = await pq.detectEngIssueLink('PROD-50');
    expect(match).toBeNull();
  });

  it('raises no milestone alert from an off-board linked issue', async () => {
    await db.put('issues', issue('DES-15', { board_id: 300, status: 'Done' }));
    await db.put('issuelinks', {
      source_key: 'PROD-51', target_key: 'DES-15', link_type: 'relates to'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-51', title: 'Design only' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBeNull();
    expect(await pq.getPendingMilestones()).toHaveLength(0);
    // The link is still listed on the card — it just isn't the Eng card.
    expect(card.linked_issues.map(l => l.key)).toEqual(['DES-15']);
  });

  it('still adopts an untyped link when it IS on the Engineering board', async () => {
    await db.put('issues', issue('ENG-90', { board_id: 200, status: 'In Progress' }));
    await db.put('issuelinks', {
      source_key: 'PROD-52', target_key: 'ENG-90', link_type: 'relates to'
    });

    // 'relates to' is a DIRECTION label, not a type name, so this falls through
    // to the weakest strategy — accepted only because ENG-90 is on the Eng board.
    const match = await pq.detectEngIssueLink('PROD-52');
    expect(match).toEqual({ key: 'ENG-90', source: 'issue_link_any' });
  });
});

describe('Eng card must live in the Engineering project', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('rejects a "Relates" link to a non-engineering project', async () => {
    // PDT really does have a "Relates <- MDP" link; it is a cross-reference,
    // not a delivery ticket, even though Relates is in ENG_LINK_TYPES.
    await db.put('issues', {
      key: 'MDP-12', project_key: 'MDP', status: 'Done',
      status_category: 'Done', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-70', target_key: 'MDP-12', link_type: 'Relates'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-70', title: 'Cross-ref' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBeNull();
    expect(card.linked_issues.map(l => l.key)).toEqual(['MDP-12']);
    expect(await pq.getPendingMilestones()).toHaveLength(0);
  });

  it('accepts a "Relates" link when it points into TSM2', async () => {
    await db.put('issues', {
      key: 'TSM2-8152', project_key: 'TSM2', status: 'Ready To Test',
      assignee_name: 'Indra Firmansyah', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-71', target_key: 'TSM2-8152', link_type: 'Relates'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-71', title: 'Real delivery' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBe('TSM2-8152');
    expect(card.assigned_engineer_name).toBe('Indra Firmansyah');
    expect(card.milestones.ready_to_test).toBeTruthy();
  });

  it('prefers the TSM2 link when a card has both engineering and other links', async () => {
    await db.put('issues', { key: 'MDP-13', project_key: 'MDP', status: 'Done', raw_data: '{}' });
    await db.put('issues', {
      key: 'TSM2-4395', project_key: 'TSM2', status: 'Delivered / Released',
      assignee_name: 'alfatio', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-72', target_key: 'MDP-13', link_type: 'Relates'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-72', target_key: 'TSM2-4395', link_type: 'Polaris work item link'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-72', title: 'Both' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBe('TSM2-4395');
    expect(card.linked_issues.map(l => l.key)).toEqual(['MDP-13', 'TSM2-4395']);
    // Status travels with each link so the card can show it.
    expect(card.linked_issues.find(l => l.key === 'TSM2-4395').status)
      .toBe('Delivered / Released');
  });
});

describe('All linked issues are returned (PDT-39 shape)', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('returns every Polaris link, not just the first scan', async () => {
    // PDT-39 really has four "Polaris work item link" rows to TSM2.
    const eng = [
      ['TSM2-7759', 'To Do', 'To Do'],
      ['TSM2-7761', 'Ready To Test', 'Done'],
      ['TSM2-7779', 'Tested', 'Done'],
      ['TSM2-7780', 'In Progress', 'To Do']
    ];
    for (const [key, status, cat] of eng) {
      await db.put('issues', {
        key, project_key: 'TSM2', status, status_category: cat,
        summary: `Summary ${key}`, raw_data: '{}'
      });
      await db.put('issuelinks', {
        source_key: 'PROD-39', target_key: key,
        link_type: 'Polaris work item link', direction: 'inward'
      });
    }

    const linked = await pq.getLinkedIssues('PROD-39');

    expect(linked.map(l => l.key)).toEqual([
      'TSM2-7759', 'TSM2-7761', 'TSM2-7779', 'TSM2-7780'
    ]);
    expect(linked.find(l => l.key === 'TSM2-7761').status).toBe('Ready To Test');
  });

  it('includes links recorded from the other end too, without duplicates', async () => {
    await db.put('issues', { key: 'TSM2-100', project_key: 'TSM2', status: 'To Do', raw_data: '{}' });
    // The same link stored from both sides, as sync does when both issues sync.
    await db.put('issuelinks', { source_key: 'PROD-40', target_key: 'TSM2-100', link_type: 'Polaris work item link' });
    await db.put('issuelinks', { source_key: 'TSM2-100', target_key: 'PROD-40', link_type: 'Polaris work item link' });

    const linked = await pq.getLinkedIssues('PROD-40');
    expect(linked.map(l => l.key)).toEqual(['TSM2-100']);
  });

  it('carries the linked issue story points through', async () => {
    await db.put('issues', {
      key: 'TSM2-101', project_key: 'TSM2', status: 'In Progress',
      story_points: 3, raw_data: '{}'
    });
    await db.put('issuelinks', { source_key: 'PROD-41', target_key: 'TSM2-101', link_type: 'implements' });

    const linked = await pq.getLinkedIssues('PROD-41');
    expect(linked[0].story_points).toBe(3);
  });

  it('the card ends up with every link after reconciliation', async () => {
    for (const key of ['TSM2-200', 'TSM2-201', 'TSM2-202']) {
      await db.put('issues', { key, project_key: 'TSM2', status: 'To Do', raw_data: '{}' });
      await db.put('issuelinks', { source_key: 'PROD-42', target_key: key, link_type: 'Polaris work item link' });
    }
    const id = await pq.createProductCard({ product_issue_key: 'PROD-42', title: 'Many links' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.linked_issues).toHaveLength(3);
  });
});

describe('Unsynced linked issues still show their type', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await reset(db);
  });

  it('falls back to the link snapshot when the issue is not cached', async () => {
    // TSM2-7759 is a real epic that is not in the local issues store — Jira
    // embeds its type and status in the link payload, so we know both anyway.
    await db.put('issuelinks', {
      source_key: 'PROD-39',
      target_key: 'TSM2-7759',
      link_type: 'Polaris work item link',
      target_type: 'Epic',
      target_status: 'To Do',
      target_status_category: 'To Do',
      target_summary: 'Supplier-Side Combined-GR Invoicing'
    });

    const [link] = await pq.getLinkedIssues('PROD-39');

    expect(link.issue_type).toBe('Epic');
    expect(link.is_epic).toBe(true);
    expect(link.status).toBe('To Do');
    expect(link.summary).toBe('Supplier-Side Combined-GR Invoicing');
  });

  it('prefers the synced issue over the link snapshot', async () => {
    await db.put('issues', {
      key: 'TSM2-7761', project_key: 'TSM2', issue_type: 'Task',
      status: 'Ready To Test', status_category: 'Done', raw_data: '{}'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-40', target_key: 'TSM2-7761', link_type: 'implements',
      target_type: 'Task', target_status: 'To Do'
    });

    const [link] = await pq.getLinkedIssues('PROD-40');
    // The cached record is fresher than the snapshot taken when the link synced.
    expect(link.status).toBe('Ready To Test');
  });

  it('does not use a snapshot recorded from the far side of the link', async () => {
    // This row was written while syncing TSM2-900, so its target_* fields
    // describe PROD-41, not TSM2-900.
    await db.put('issuelinks', {
      source_key: 'TSM2-900', target_key: 'PROD-41', link_type: 'implements',
      target_type: 'Customer Request', target_status: 'Plan'
    });

    const [link] = await pq.getLinkedIssues('PROD-41');
    expect(link.key).toBe('TSM2-900');
    expect(link.issue_type).toBeNull();
    expect(link.status).toBeNull();
  });

  it('still reports unknown when neither source has the type', async () => {
    await db.put('issuelinks', { source_key: 'PROD-42', target_key: 'TSM2-901', link_type: 'implements' });
    const [link] = await pq.getLinkedIssues('PROD-42');
    expect(link.issue_type).toBeNull();
    expect(link.is_epic).toBe(false);
  });
});
