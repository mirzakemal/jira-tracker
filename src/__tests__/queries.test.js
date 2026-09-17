import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORE_NAMES = ['issues', 'users', 'tags', 'views', 'projects', 'boards', 'sprints', 'metadata'];

async function resetDatabase(indexeddb) {
  await indexeddb.initDatabase();
  for (const name of STORE_NAMES) {
    try { await indexeddb.clear(name); } catch { /* ignore if store missing */ }
  }
}

async function seedData(indexeddb, issues, users = [], tags = []) {
  await resetDatabase(indexeddb);
  for (const issue of issues) {
    await indexeddb.put('issues', issue);
  }
  for (const user of users) {
    await indexeddb.put('users', user);
  }
  for (const tag of tags) {
    await indexeddb.put('tags', tag);
  }
}

const SAMPLE_ISSUES = [
  { key: 'TEST-1', summary: 'Login page', status: 'In Progress', board_id: 1, sprint_id: 10, fix_version: 'v1.0', customer: 'Acme Corp', product: 'Web', issue_type: 'Story', assignee_id: 'user1', reporter_id: 'user2', project_key: 'TEST', updated_at: '2026-01-15T10:00:00Z', start_date: '2026-01-01', due_date: '2026-02-01', story_points: 5, epic_link: 'EPIC-1' },
  { key: 'TEST-2', summary: 'API auth', status: 'Done', board_id: 1, sprint_id: 10, fix_version: 'v1.0', customer: 'Acme Corp', product: 'API', issue_type: 'Task', assignee_id: 'user1', reporter_id: 'user3', project_key: 'TEST', updated_at: '2026-01-10T10:00:00Z', start_date: '2026-01-05', due_date: '2026-01-15', story_points: 3 },
  { key: 'TEST-3', summary: 'Dashboard', status: 'To Do', board_id: 1, sprint_id: 11, fix_version: 'v2.0', customer: 'Beta Inc', product: 'Web', issue_type: 'Story', assignee_id: 'user2', reporter_id: 'user1', project_key: 'TEST', updated_at: '2026-02-01T10:00:00Z', story_points: 8, epic_link: 'EPIC-1' },
  { key: 'TEST-4', summary: 'Report export', status: 'In Progress', board_id: 1, sprint_id: 11, fix_version: 'v2.0', customer: 'Acme Corp', product: 'API', issue_type: 'Task', assignee_id: 'user3', reporter_id: 'user2', project_key: 'TEST', updated_at: '2026-02-05T10:00:00Z', story_points: 2 },
  { key: 'TEST-5', summary: 'Mobile app', status: 'To Do', board_id: 2, sprint_id: 12, fix_version: 'v3.0', customer: 'Beta Inc', product: 'Mobile', issue_type: 'Epic', assignee_id: 'user1', reporter_id: 'user3', project_key: 'MOBILE', updated_at: '2026-03-01T10:00:00Z', story_points: 13 },
  { key: 'TEST-6', summary: 'Search', status: 'In Progress', board_id: 2, sprint_id: 10, fix_version: 'v1.0', customer: 'Acme Corp', product: 'Web', issue_type: 'Story', assignee_id: 'user2', reporter_id: 'user1', project_key: 'TEST', updated_at: '2026-01-20T10:00:00Z', story_points: 5 },
];

const SAMPLE_USERS = [
  { account_id: 'user1', display_name: 'Alice' },
  { account_id: 'user2', display_name: 'Bob' },
  { account_id: 'user3', display_name: 'Charlie' },
];

describe('queries - utility functions', () => {
  let queries;
  let indexeddb;

  beforeEach(async () => {
    vi.resetModules();
    indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('getIssueByKey returns single issue with tags', async () => {
    await indexeddb.put('tags', { issue_key: 'TEST-1', tag_name: 'urgent' });
    const result = await queries.getIssueByKey('TEST-1');
    expect(result.key).toBe('TEST-1');
    expect(result.tags).toContain('urgent');
  });

  it('getIssueByKey returns null for missing key', async () => {
    const result = await queries.getIssueByKey('NONEXISTENT');
    expect(result).toBeNull();
  });
});

describe('queries - tag operations', () => {
  let queries;
  let indexeddb;

  beforeEach(async () => {
    vi.resetModules();
    indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('addTag adds a tag to an issue', async () => {
    await queries.addTag('TEST-1', 'frontend');
    const tags = await queries.getTags('TEST-1');
    expect(tags).toContain('frontend');
  });

  it('addTag is idempotent (no duplicate tags)', async () => {
    await queries.addTag('TEST-1', 'frontend');
    await queries.addTag('TEST-1', 'frontend');
    const tags = await queries.getTags('TEST-1');
    expect(tags.filter(t => t === 'frontend')).toHaveLength(1);
  });

  it('removeTag removes a tag', async () => {
    await queries.addTag('TEST-1', 'frontend');
    await queries.addTag('TEST-1', 'urgent');
    await queries.removeTag('TEST-1', 'frontend');
    const tags = await queries.getTags('TEST-1');
    expect(tags).toEqual(['urgent']);
  });

  it('getAllTags returns all distinct tags', async () => {
    await queries.addTag('TEST-1', 'frontend');
    await queries.addTag('TEST-2', 'backend');
    await queries.addTag('TEST-3', 'frontend');
    const tags = await queries.getAllTags();
    expect(tags).toEqual(['backend', 'frontend']);
  });

  it('getIssuesByTag returns issues matching tag', async () => {
    await queries.addTag('TEST-1', 'frontend');
    await queries.addTag('TEST-2', 'backend');
    const result = await queries.getIssuesByTag('frontend');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TEST-1');
  });
});

describe('Link queries leave the shared connection open', () => {
  let db, queries;

  beforeEach(async () => {
    db = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await db.initDatabase();
    for (const s of ['issues', 'issuelinks']) {
      try { await db.clear(s); } catch { /* ignore */ }
    }
  });

  it('getIssueLinks does not close the singleton it did not open', async () => {
    await db.put('issuelinks', { source_key: 'PDT-1', target_key: 'TSM2-1', link_type: 'Relates' });

    const links = await queries.getIssueLinks('PDT-1');
    expect(links).toHaveLength(1);

    // Closing the shared handle used to leave indexeddb.js caching a dead
    // connection, so every later read threw InvalidStateError.
    await expect(db.getAll('issuelinks')).resolves.toHaveLength(1);
    await expect(queries.getIssueLinks('PDT-1')).resolves.toHaveLength(1);
  });


  it('the source file carries no live db.close() call', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/db/queries.js'), 'utf8');
    const calls = src.split('\n').filter(l => /db\.close\(\)/.test(l) && !l.trim().startsWith('//'));
    expect(calls).toEqual([]);
  });
});
