import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// These tests use fake-indexeddb to simulate IndexedDB in jsdom
import 'fake-indexeddb/auto';

const STORE_NAMES = ['projects', 'boards', 'sprints', 'issues', 'users', 'tags', 'views', 'metadata'];

describe('IndexedDB Storage', () => {
  let dbModule;

  beforeEach(async () => {
    dbModule = await import('../db/indexeddb.js');
    await dbModule.initDatabase();
  });

  afterEach(async () => {
    // Clear all stores to reset state between tests
    for (const storeName of STORE_NAMES) {
      try {
        await dbModule.clear(storeName);
      } catch {
        // Store may not exist yet
      }
    }
  });

  it('initDatabase creates the database and returns a promise', async () => {
    const result = await dbModule.initDatabase();
    expect(result).toBeDefined();
  });

  it('put stores a record and returns the key', async () => {
    const key = await dbModule.put('projects', { id: 1, name: 'Test Project' });
    expect(key).toBe(1);
  });

  it('get retrieves a stored record', async () => {
    await dbModule.put('projects', { id: 2, name: 'Another Project' });
    const result = await dbModule.get('projects', 2);
    expect(result).toEqual({ id: 2, name: 'Another Project' });
  });

  it('get returns undefined for non-existent key', async () => {
    const result = await dbModule.get('projects', 999);
    expect(result).toBeUndefined();
  });

  it('putBulk stores multiple records', async () => {
    await dbModule.putBulk('boards', [
      { id: 1, name: 'Board 1' },
      { id: 2, name: 'Board 2' }
    ]);
    const all = await dbModule.getAll('boards');
    expect(all).toHaveLength(2);
    expect(all.map(b => b.name).sort()).toEqual(['Board 1', 'Board 2']);
  });

  it('getAll returns all records from a store', async () => {
    await dbModule.putBulk('projects', [
      { id: 10, name: 'A' },
      { id: 20, name: 'B' }
    ]);
    const all = await dbModule.getAll('projects');
    expect(all).toHaveLength(2);
  });

  it('getByIndex finds records by indexed field', async () => {
    await dbModule.putBulk('issues', [
      { key: 'KEY-1', status: 'To Do' },
      { key: 'KEY-2', status: 'In Progress' },
      { key: 'KEY-3', status: 'To Do' }
    ]);
    const todoIssues = await dbModule.getByIndex('issues', 'status', 'To Do');
    expect(todoIssues).toHaveLength(2);
    expect(todoIssues.map(i => i.key)).toEqual(['KEY-1', 'KEY-3']);
  });

  it('getAllFiltered returns records matching filter function', async () => {
    await dbModule.putBulk('issues', [
      { key: 'KEY-1', status: 'Done' },
      { key: 'KEY-2', status: 'To Do' },
      { key: 'KEY-3', status: 'Done' }
    ]);
    const doneIssues = await dbModule.getAllFiltered('issues', i => i.status === 'Done');
    expect(doneIssues).toHaveLength(2);
  });

  it('del removes a record', async () => {
    await dbModule.put('projects', { id: 5, name: 'Delete Me' });
    await dbModule.del('projects', 5);
    const result = await dbModule.get('projects', 5);
    expect(result).toBeUndefined();
  });

  it('clear removes all records from a store', async () => {
    await dbModule.putBulk('projects', [{ id: 1 }, { id: 2 }]);
    await dbModule.clear('projects');
    const all = await dbModule.getAll('projects');
    expect(all).toHaveLength(0);
  });

  it('setMetadata and getMetadata store/retrieve key-value pairs', async () => {
    await dbModule.setMetadata('last_sync', '2026-05-05T10:00:00Z');
    const value = await dbModule.getMetadata('last_sync');
    expect(value).toBe('2026-05-05T10:00:00Z');
  });

  it('getMetadata returns null for unknown key', async () => {
    const value = await dbModule.getMetadata('nonexistent');
    expect(value).toBeNull();
  });
});
