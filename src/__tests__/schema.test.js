import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, TABLES, getAllTables, getAllIndexes } from '../db/schema.js';

describe('schema', () => {
  it('exports schema version', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('defines all expected tables', () => {
    expect(TABLES).toHaveProperty('projects');
    expect(TABLES).toHaveProperty('boards');
    expect(TABLES).toHaveProperty('sprints');
    expect(TABLES).toHaveProperty('users');
    expect(TABLES).toHaveProperty('issues');
    expect(TABLES).toHaveProperty('issue_tags');
    expect(TABLES).toHaveProperty('saved_views');
    expect(TABLES).toHaveProperty('sync_metadata');
  });

  it('getAllTables returns array of CREATE TABLE statements', () => {
    const tables = getAllTables();
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBe(8);

    tables.forEach(sql => {
      expect(sql).toContain('CREATE TABLE');
    });
  });

  it('getAllIndexes returns array of CREATE INDEX statements', () => {
    const indexes = getAllIndexes();
    expect(Array.isArray(indexes)).toBe(true);
    expect(indexes.length).toBeGreaterThan(0);

    indexes.forEach(sql => {
      expect(sql.trim()).toContain('CREATE INDEX');
    });
  });

  it('each table SQL contains IF NOT EXISTS', () => {
    const tables = getAllTables();
    tables.forEach(sql => {
      expect(sql).toContain('IF NOT EXISTS');
    });
  });

  it('issues table has expected columns', () => {
    const issuesSql = TABLES.issues;
    expect(issuesSql).toContain('key TEXT UNIQUE NOT NULL');
    expect(issuesSql).toContain('status TEXT');
    expect(issuesSql).toContain('assignee_id TEXT');
    expect(issuesSql).toContain('sprint_id INTEGER');
    expect(issuesSql).toContain('board_id INTEGER');
  });
});
