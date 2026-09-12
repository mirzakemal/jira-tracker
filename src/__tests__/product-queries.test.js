import { describe, it, expect, beforeEach } from 'vitest';

import 'fake-indexeddb/auto';

const STORE_NAMES = ['issues', 'issuelinks', 'product_cards', 'doc_drafts'];

async function resetDatabase(indexeddb) {
  await indexeddb.initDatabase();
  for (const name of STORE_NAMES) {
    try { await indexeddb.clear(name); } catch { /* ignore if store missing */ }
  }
}

describe('Product Board queries', () => {
  let db;
  let pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await resetDatabase(db);
  });

  // ==================== Product Cards ====================

  it('createProductCard returns a generated local ID', async () => {
    const id = await pq.createProductCard({ title: 'Bulk tender upload' });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('createProductCard stores all schema fields with defaults', async () => {
    const id = await pq.createProductCard({
      product_issue_key: 'PROD-1',
      title: 'Bulk tender upload',
      description: 'Let buyers upload many tenders at once',
      customer: 'Acme Corp',
      user_persona: 'Procurement Manager'
    });

    const card = await pq.getProductCard(id);
    expect(card).toMatchObject({
      id,
      product_issue_key: 'PROD-1',
      title: 'Bulk tender upload',
      description: 'Let buyers upload many tenders at once',
      customer: 'Acme Corp',
      user_persona: 'Procurement Manager',
      status: 'Draft',
      eng_issue_key: null,
      assigned_engineer_id: null,
      assigned_engineer_name: null
    });
    expect(card.created_at).toBeTruthy();
    expect(card.updated_at).toBeTruthy();
  });

  it('getProductCardByIssueKey finds a card by its Jira product key', async () => {
    await pq.createProductCard({ product_issue_key: 'PROD-7', title: 'Saved searches' });
    const card = await pq.getProductCardByIssueKey('PROD-7');
    expect(card?.title).toBe('Saved searches');
  });

  it('getProductCardByIssueKey returns null when nothing matches', async () => {
    expect(await pq.getProductCardByIssueKey('PROD-999')).toBeNull();
  });

  it('updateProductCard patches fields and preserves created_at', async () => {
    const id = await pq.createProductCard({ title: 'Original', customer: 'Acme Corp' });
    const before = await pq.getProductCard(id);

    const updated = await pq.updateProductCard(id, { title: 'Renamed', status: 'Defined' });

    expect(updated.title).toBe('Renamed');
    expect(updated.status).toBe('Defined');
    expect(updated.customer).toBe('Acme Corp');
    expect(updated.created_at).toBe(before.created_at);
  });

  it('updateProductCard returns null for an unknown id', async () => {
    expect(await pq.updateProductCard(4242, { title: 'x' })).toBeNull();
  });

  it('getProductCards filters by status, customer and persona', async () => {
    await pq.createProductCard({ title: 'A', status: 'Draft', customer: 'Acme Corp', user_persona: 'Buyer' });
    await pq.createProductCard({ title: 'B', status: 'Done', customer: 'Acme Corp', user_persona: 'Supplier' });
    await pq.createProductCard({ title: 'C', status: 'Done', customer: 'Beta Inc', user_persona: 'Buyer' });

    expect((await pq.getProductCards()).length).toBe(3);
    expect((await pq.getProductCards({ status: 'Done' })).length).toBe(2);
    expect((await pq.getProductCards({ customer: 'Acme Corp' })).length).toBe(2);
    expect((await pq.getProductCards({ userPersona: 'Buyer' })).length).toBe(2);
    expect((await pq.getProductCards({ status: ['Draft', 'Done'] })).length).toBe(3);
  });

  it('deleteProductCard removes the card and cascades to its drafts', async () => {
    const id = await pq.createProductCard({ title: 'Doomed' });
    await pq.createDocumentationDraft(id, '# One');
    await pq.createDocumentationDraft(id, '# Two');

    expect((await pq.getDraftsForCard(id)).length).toBe(2);

    await pq.deleteProductCard(id);

    expect(await pq.getProductCard(id)).toBeUndefined();
    expect((await pq.getDraftsForCard(id)).length).toBe(0);
  });

  // ==================== Eng card linking ====================

  it('resolveAssignedEngineer pulls the assignee from the linked Eng issue', async () => {
    await db.put('issues', {
      key: 'TSM2-5',
      project_key: 'TSM2',
      summary: 'Implement bulk upload',
      assignee_id: 'acc-123',
      assignee_name: 'Dana Engineer'
    });
    await db.put('issuelinks', {
      source_key: 'PROD-1',
      target_key: 'TSM2-5',
      link_type: 'implements',
      direction: 'outward'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-1', title: 'Bulk upload' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBe('TSM2-5');
    expect(card.assigned_engineer_id).toBe('acc-123');
    expect(card.assigned_engineer_name).toBe('Dana Engineer');
  });

  it('resolveAssignedEngineer resolves a link recorded in the inward direction', async () => {
    await db.put('issues', { key: 'TSM2-9', project_key: 'TSM2', assignee_id: 'acc-9', assignee_name: 'Sam Dev' });
    await db.put('issuelinks', {
      source_key: 'TSM2-9',
      target_key: 'PROD-2',
      link_type: 'implements',
      direction: 'inward'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-2', title: 'Persona filters' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBe('TSM2-9');
    expect(card.assigned_engineer_name).toBe('Sam Dev');
  });

  // A TSM2-* key is recognised as engineering even before the issue is synced.
  it('resolveAssignedEngineer keeps the link but clears the engineer when the Eng issue is not cached', async () => {
    await db.put('issuelinks', {
      source_key: 'PROD-3',
      target_key: 'TSM2-404',
      link_type: 'implements',
      direction: 'outward'
    });

    const id = await pq.createProductCard({ product_issue_key: 'PROD-3', title: 'Uncached' });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBe('TSM2-404');
    expect(card.assigned_engineer_id).toBeNull();
  });

  it('resolveAssignedEngineer clears the engineer when there is no linked Eng card', async () => {
    const id = await pq.createProductCard({
      product_issue_key: 'PROD-4',
      title: 'Unlinked',
      assigned_engineer_name: 'Stale Name'
    });
    const card = await pq.resolveAssignedEngineer(id);

    expect(card.eng_issue_key).toBeNull();
    expect(card.assigned_engineer_name).toBeNull();
  });

  it('database stays usable after resolveAssignedEngineer (shared connection not closed)', async () => {
    await db.put('issuelinks', { source_key: 'PROD-5', target_key: 'TSM2-5', link_type: 'implements' });
    const id = await pq.createProductCard({ product_issue_key: 'PROD-5', title: 'Still alive' });

    await pq.resolveAssignedEngineer(id);

    // Would throw InvalidStateError if the singleton connection had been closed.
    await expect(pq.getProductCards()).resolves.toBeInstanceOf(Array);
  });

  it('refreshAllAssignedEngineers re-resolves every card', async () => {
    await db.put('issues', { key: 'TSM2-1', project_key: 'TSM2', assignee_id: 'a1', assignee_name: 'Eng One' });
    await db.put('issuelinks', { source_key: 'PROD-A', target_key: 'TSM2-1', link_type: 'implements' });

    const id1 = await pq.createProductCard({ product_issue_key: 'PROD-A', title: 'A' });
    await pq.createProductCard({ product_issue_key: 'PROD-B', title: 'B' });

    const count = await pq.refreshAllAssignedEngineers();

    expect(count).toBe(2);
    expect((await pq.getProductCard(id1)).assigned_engineer_name).toBe('Eng One');
  });

  // ==================== Documentation drafts ====================

  it('createDocumentationDraft associates the draft with a product card', async () => {
    const cardId = await pq.createProductCard({ title: 'Documented' });
    const draftId = await pq.createDocumentationDraft(cardId, '# Heading', { title: 'Release notes' });

    const draft = await pq.getDocumentationDraft(draftId);
    expect(draft).toMatchObject({
      id: draftId,
      product_card_id: cardId,
      title: 'Release notes',
      markdown: '# Heading'
    });
    expect(draft.last_saved).toBeTruthy();
  });

  it('saveDocumentationDraft replaces markdown and advances last_saved', async () => {
    const cardId = await pq.createProductCard({ title: 'Doc card' });
    const draftId = await pq.createDocumentationDraft(cardId, 'v1');
    const original = await pq.getDocumentationDraft(draftId);

    await new Promise(resolve => setTimeout(resolve, 5));
    const updated = await pq.saveDocumentationDraft(draftId, 'v2 content');

    expect(updated.markdown).toBe('v2 content');
    expect(updated.product_card_id).toBe(cardId);
    expect(new Date(updated.last_saved).getTime())
      .toBeGreaterThan(new Date(original.last_saved).getTime());
  });

  it('saveDocumentationDraft returns null for an unknown draft', async () => {
    expect(await pq.saveDocumentationDraft(9999, 'nope')).toBeNull();
  });

  it('getDraftsForCard returns only that card drafts, newest first', async () => {
    const cardA = await pq.createProductCard({ title: 'A' });
    const cardB = await pq.createProductCard({ title: 'B' });

    const first = await pq.createDocumentationDraft(cardA, 'older');
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await pq.createDocumentationDraft(cardA, 'newer');
    await pq.createDocumentationDraft(cardB, 'other card');

    const drafts = await pq.getDraftsForCard(cardA);
    expect(drafts.map(d => d.id)).toEqual([second, first]);
  });

  it('deleteDocumentationDraft removes only the target draft', async () => {
    const cardId = await pq.createProductCard({ title: 'A' });
    const keep = await pq.createDocumentationDraft(cardId, 'keep');
    const drop = await pq.createDocumentationDraft(cardId, 'drop');

    await pq.deleteDocumentationDraft(drop);

    const remaining = await pq.getDraftsForCard(cardId);
    expect(remaining.map(d => d.id)).toEqual([keep]);
  });
});

describe('Product Board default sort', () => {
  let db, pq;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    await resetDatabase(db);
  });

  it('orders by the JIRA updated date, not the local write time', async () => {
    // Created oldest-first; the local updated_at therefore ascends in the same
    // order, so a correct sort must come from jira_updated_at alone.
    await pq.createProductCard({ product_issue_key: 'PDT-1', title: 'Oldest', jira_updated_at: '2026-01-01T00:00:00Z' });
    await pq.createProductCard({ product_issue_key: 'PDT-2', title: 'Newest', jira_updated_at: '2026-09-01T00:00:00Z' });
    await pq.createProductCard({ product_issue_key: 'PDT-3', title: 'Middle', jira_updated_at: '2026-05-01T00:00:00Z' });

    const cards = await pq.getProductCards();
    expect(cards.map(c => c.title)).toEqual(['Newest', 'Middle', 'Oldest']);
  });

  it('falls back to the local time for cards with no Jira issue', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-4', title: 'Synced', jira_updated_at: '2020-01-01T00:00:00Z' });
    await pq.createProductCard({ title: 'Local draft' });

    const cards = await pq.getProductCards();
    // The draft was written just now, so it outranks a 2020 Jira update.
    expect(cards[0].title).toBe('Local draft');
  });

  it('does not let an unparseable date scramble the order', async () => {
    await pq.createProductCard({ product_issue_key: 'PDT-5', title: 'Good', jira_updated_at: '2026-09-01T00:00:00Z' });
    await pq.createProductCard({ product_issue_key: 'PDT-6', title: 'Bad', jira_updated_at: 'not a date' });

    const cards = await pq.getProductCards();
    expect(cards[0].title).toBe('Good');
    expect(cards).toHaveLength(2);
  });

  it('sortByLastUpdated is exported for reuse', async () => {
    const sorted = pq.sortByLastUpdated([
      { title: 'b', jira_updated_at: '2026-01-01T00:00:00Z' },
      { title: 'a', jira_updated_at: '2026-06-01T00:00:00Z' }
    ]);
    expect(sorted.map(c => c.title)).toEqual(['a', 'b']);
  });
});
