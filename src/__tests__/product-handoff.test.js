import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_BOARD_ID', '100');
vi.stubEnv('VITE_ENG_BOARD_ID', '200');
vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PROD');
vi.stubEnv('VITE_PRODUCT_ISSUE_TYPE_ID', '10001');

const PROJECTS = [{ id: '10500', key: 'PROD', name: 'Product' }];
// PRODUCT_PROJECT.id falls back to the real PDT project id when unset.
const DEFAULT_PROJECT_ID = '10085';
const DOMAIN = 'tenderboard.atlassian.net';

describe('Jira handoff (read-only)', () => {
  let handoff;

  beforeEach(async () => {
    handoff = await import('../utils/product-handoff.js');
  });

  it('builds a prefilled create-issue URL from the cached project id', async () => {
    const { url, missing } = handoff.buildCreateIssueUrl(
      { title: 'Bulk tender upload', description: 'Upload many at once' },
      DOMAIN,
      { projects: PROJECTS }
    );

    expect(missing).toEqual([]);
    expect(url).toContain(`https://${DOMAIN}/secure/CreateIssueDetails!init.jspa?`);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('pid')).toBe('10500');
    expect(params.get('issuetype')).toBe('10001');
    expect(params.get('summary')).toBe('Bulk tender upload');
    expect(params.get('description')).toBe('Upload many at once');
  });

  it('encodes characters that would otherwise break the query string', async () => {
    const { url } = handoff.buildCreateIssueUrl(
      { title: 'Filters & sorting = better?', description: 'a/b c' },
      DOMAIN,
      { projects: PROJECTS }
    );
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('summary')).toBe('Filters & sorting = better?');
    expect(url).not.toContain(' ');
  });

  it('strips protocol and trailing slash from the domain', async () => {
    const { url } = handoff.buildCreateIssueUrl(
      { title: 'X' }, 'https://tenderboard.atlassian.net/', { projects: PROJECTS }
    );
    expect(url.startsWith(`https://${DOMAIN}/secure/`)).toBe(true);
  });

  it('drops an over-long description from the URL and says so', async () => {
    const { url, descriptionOmitted } = handoff.buildCreateIssueUrl(
      { title: 'Long one', description: 'x'.repeat(3000) },
      DOMAIN,
      { projects: PROJECTS }
    );
    expect(descriptionOmitted).toBe(true);
    expect(url).not.toContain('description=');
    expect(url.length).toBeLessThan(1800);
  });

  it('falls back to the configured default project id when the cache is empty', async () => {
    const { url, missing } = handoff.buildCreateIssueUrl(
      { title: 'No cached project' }, DOMAIN, { projects: [] }
    );
    expect(missing).toEqual([]);
    expect(url).toContain(`pid=${DEFAULT_PROJECT_ID}`);
  });

  it('reports what is missing instead of building a broken URL', async () => {
    const { url, missing } = handoff.buildCreateIssueUrl(
      { title: 'No domain' }, '', { projects: PROJECTS }
    );
    expect(url).toBeNull();
    expect(missing).toContain('domain');
  });

  it('builds a REST payload with an ADF description', async () => {
    const payload = handoff.buildIssuePayload({ title: 'T', description: 'D' });
    expect(payload.fields.project).toEqual({ key: 'PROD' });
    expect(payload.fields.issuetype).toEqual({ id: '10001' });
    expect(payload.fields.summary).toBe('T');
    expect(payload.fields.description.type).toBe('doc');
    expect(payload.fields.description.content[0].content[0].text).toBe('D');
  });

  it('buildHandoff bundles the link, payload and copyable JSON', async () => {
    const result = handoff.buildHandoff(
      { title: 'T', description: 'D' }, DOMAIN, { projects: PROJECTS }
    );
    expect(result.url).toContain('CreateIssueDetails');
    expect(JSON.parse(result.payloadJson).fields.summary).toBe('T');
    expect(result.description).toBe('D');
  });

  it('makes no network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    handoff.buildHandoff({ title: 'T' }, DOMAIN, { projects: PROJECTS });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Draft adoption after handoff', () => {
  let db, pq, ps;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    pq = await import('../db/product-queries.js');
    ps = await import('../db/product-sync.js');
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks', 'product_cards', 'doc_drafts']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
  });

  const productIssue = (key, summary) => ({
    key, summary, board_id: 100, project_key: 'PROD', status: 'Plan', raw_data: '{}'
  });

  it('markHandedOff flags a draft as awaiting creation', async () => {
    const id = await pq.createProductCard({ title: 'New idea' });
    const card = await pq.markHandedOff(id);

    expect(card.handed_off_at).toBeTruthy();
    expect((await pq.getAwaitingAdoption()).map(c => c.id)).toEqual([id]);
  });

  it('adopts the draft when a matching Jira issue appears', async () => {
    const id = await pq.createProductCard({ title: 'Bulk tender upload' });
    await pq.markHandedOff(id);
    await db.put('issues', productIssue('PROD-30', 'Bulk tender upload'));

    const result = await ps.importProductBoardIssues();

    expect(result.adopted).toBe(1);
    expect(result.created).toBe(0);

    const card = await pq.getProductCard(id);
    expect(card.product_issue_key).toBe('PROD-30');
    expect(card.handed_off_at).toBeNull();
    expect((await pq.getProductCards()).length).toBe(1);
  });

  it('matches titles ignoring case and punctuation', async () => {
    const id = await pq.createProductCard({ title: 'Saved searches & filters' });
    await pq.markHandedOff(id);
    await db.put('issues', productIssue('PROD-31', 'saved searches and filters'));

    await ps.importProductBoardIssues();
    // "and" vs "&" normalise differently, so this must NOT match.
    expect((await pq.getProductCard(id)).product_issue_key).toBeNull();

    await db.put('issues', productIssue('PROD-32', 'Saved Searches   &   Filters'));
    await ps.importProductBoardIssues();
    expect((await pq.getProductCard(id)).product_issue_key).toBe('PROD-32');
  });

  it('refuses to guess when two Jira issues share the draft title', async () => {
    const id = await pq.createProductCard({ title: 'Duplicate name' });
    await pq.markHandedOff(id);
    await db.put('issues', productIssue('PROD-33', 'Duplicate name'));
    await db.put('issues', productIssue('PROD-34', 'Duplicate name'));

    const result = await ps.importProductBoardIssues();

    expect(result.adopted).toBe(0);
    expect((await pq.getProductCard(id)).product_issue_key).toBeNull();
  });

  it('does not steal an issue key already claimed by another card', async () => {
    await pq.createProductCard({ product_issue_key: 'PROD-35', title: 'Taken' });
    const draftId = await pq.createProductCard({ title: 'Taken' });
    await pq.markHandedOff(draftId);
    await db.put('issues', productIssue('PROD-35', 'Taken'));

    const result = await ps.importProductBoardIssues();

    expect(result.adopted).toBe(0);
    expect((await pq.getProductCard(draftId)).product_issue_key).toBeNull();
  });

  it('leaves un-handed-off local drafts alone', async () => {
    const id = await pq.createProductCard({ title: 'Just an idea' });
    await db.put('issues', productIssue('PROD-36', 'Just an idea'));

    const result = await ps.importProductBoardIssues();

    expect(result.adopted).toBe(0);
    expect((await pq.getProductCard(id)).product_issue_key).toBeNull();
    // The Jira issue still gets its own card.
    expect(await pq.getProductCardByIssueKey('PROD-36')).toBeTruthy();
  });
});

describe('Create-flow link with no drafted card', () => {
  it('builds a valid URL when the card has no title yet', async () => {
    const handoff = await import('../utils/product-handoff.js');
    const { url, missing } = handoff.buildCreateIssueUrl(
      { title: '', description: '' }, DOMAIN, { projects: PROJECTS }
    );

    expect(missing).toEqual([]);
    expect(url).toContain('CreateIssueDetails');
    // No empty summary param — Jira opens its create screen blank.
    expect(url).not.toContain('summary=');
  });
});
