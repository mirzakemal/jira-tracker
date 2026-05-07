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

describe('queries - getAllIssues', () => {
  let queries;
  let indexeddb;

  beforeEach(async () => {
    vi.resetModules();
    indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('returns all issues with no filters', async () => {
    const result = await queries.getAllIssues({});
    expect(result).toHaveLength(6);
  });

  it('filters by single status', async () => {
    const result = await queries.getAllIssues({ status: ['In Progress'] });
    expect(result).toHaveLength(3);
    expect(result.map(i => i.key)).toEqual(['TEST-1', 'TEST-4', 'TEST-6']);
  });

  it('filters by multiple statuses', async () => {
    const result = await queries.getAllIssues({ status: ['To Do', 'Done'] });
    expect(result).toHaveLength(3);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-2', 'TEST-3', 'TEST-5']);
  });

  it('filters by single fixVersion', async () => {
    const result = await queries.getAllIssues({ fixVersion: 'v1.0' });
    expect(result).toHaveLength(3);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-2', 'TEST-6']);
  });

  it('filters by multiple fixVersions', async () => {
    const result = await queries.getAllIssues({ fixVersion: ['v1.0', 'v3.0'] });
    expect(result).toHaveLength(4);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-2', 'TEST-5', 'TEST-6']);
  });

  it('filters by customer', async () => {
    const result = await queries.getAllIssues({ customer: 'Beta Inc' });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-3', 'TEST-5']);
  });

  it('filters by product', async () => {
    const result = await queries.getAllIssues({ product: 'API' });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-2', 'TEST-4']);
  });

  it('filters by assignee', async () => {
    const result = await queries.getAllIssues({ assigneeId: 'user1' });
    expect(result).toHaveLength(3);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-2', 'TEST-5']);
  });

  it('enriches issues with user display names', async () => {
    const result = await queries.getAllIssues({ status: ['In Progress'] });
    const test1 = result.find(i => i.key === 'TEST-1');
    expect(test1.assignee_name).toBe('Alice');
    expect(test1.reporter_name).toBe('Bob');
  });

  it('handles status + fixVersion combo filter', async () => {
    const result = await queries.getAllIssues({ status: ['In Progress'], fixVersion: ['v1.0'] });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-6']);
  });

  it('handles status + assignee combo filter', async () => {
    const result = await queries.getAllIssues({ status: ['To Do'], assigneeId: ['user1'] });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TEST-5');
  });

  it('returns empty array for no match filter', async () => {
    const result = await queries.getAllIssues({ status: ['Nonexistent'] });
    expect(result).toHaveLength(0);
  });

  it('filters by boardId', async () => {
    const result = await queries.getAllIssues({ boardId: 2 });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-5', 'TEST-6']);
  });

  it('filters by sprintId', async () => {
    const result = await queries.getAllIssues({ sprintId: 11 });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-3', 'TEST-4']);
  });

  it('filters by search query (key)', async () => {
    const result = await queries.getAllIssues({ searchQuery: 'TEST-3' });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TEST-3');
  });

  it('filters by search query (summary)', async () => {
    const result = await queries.getAllIssues({ searchQuery: 'login' });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TEST-1');
  });
});

describe('queries - filter options cache', () => {
  let queries;
  let indexeddb;

  beforeEach(async () => {
    vi.resetModules();
    indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('getStatuses returns distinct sorted statuses', async () => {
    const statuses = await queries.getStatuses();
    expect(statuses).toEqual(['Done', 'In Progress', 'To Do']);
  });

  it('getFixVersions returns distinct sorted versions', async () => {
    const versions = await queries.getFixVersions();
    expect(versions).toEqual(['v1.0', 'v2.0', 'v3.0']);
  });

  it('getCustomers returns distinct sorted customers', async () => {
    const customers = await queries.getCustomers();
    expect(customers).toEqual(['Acme Corp', 'Beta Inc']);
  });

  it('getProducts returns distinct sorted products', async () => {
    const products = await queries.getProducts();
    expect(products).toEqual(['API', 'Mobile', 'Web']);
  });

  it('getAllUsers returns sorted users', async () => {
    const users = await queries.getAllUsers();
    expect(users).toHaveLength(3);
    expect(users[0].display_name).toBe('Alice');
  });

  it('invalidateFilterCache resets cache', async () => {
    await queries.getStatuses();
    await indexeddb.put('issues', { key: 'TEST-7', summary: 'New', status: 'New Status', board_id: 1, project_key: 'TEST' });

    queries.invalidateFilterCache();
    const statuses = await queries.getStatuses();
    expect(statuses).toContain('New Status');
  });
});

describe('queries - utility functions', () => {
  let queries;
  let indexeddb;

  beforeEach(async () => {
    vi.resetModules();
    indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('getIssuesByBoard returns board-scoped issues', async () => {
    const result = await queries.getIssuesByBoard(2);
    expect(result).toHaveLength(2);
  });

  it('getIssuesBySprint returns sprint-scoped issues', async () => {
    const result = await queries.getIssuesBySprint(10);
    expect(result).toHaveLength(3);
    expect(result.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-2', 'TEST-6']);
  });

  it('getIssuesByStatus returns status-filtered issues', async () => {
    const result = await queries.getIssuesByStatus('Done');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TEST-2');
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

describe('queries - roadmap', () => {
  let queries;

  beforeEach(async () => {
    vi.resetModules();
    const indexeddb = await import('../db/indexeddb.js');
    queries = await import('../db/queries.js');
    await seedData(indexeddb, SAMPLE_ISSUES, SAMPLE_USERS);
  });

  it('getRoadmapIssues returns issues within default date range', async () => {
    const result = await queries.getRoadmapIssues({});
    expect(Array.isArray(result)).toBe(true);
  });

  it('getRoadmapIssues filters by status', async () => {
    const result = await queries.getRoadmapIssues({ status: ['Done'] });
    const doneIssues = result.filter(i => i.status === 'Done');
    expect(doneIssues.length).toBeGreaterThanOrEqual(1);
  });
});
