import { describe, it, expect } from 'vitest';
import { isCompleted, completedAt, completedWithin, createdWithin } from '../utils/completion.js';

const DAY = 86400000;
const NOW = new Date('2026-09-17T12:00:00Z').getTime();
const ago = days => new Date(NOW - days * DAY).toISOString();

describe('completion — derived from status category, not resolution', () => {
  it('treats a Done-category issue with NO resolution as completed', () => {
    // The TSM2 reality: "Delivered / Released" with an empty resolutiondate.
    const issue = { status: 'Delivered / Released', status_category: 'Done', resolved_at: null, updated_at: ago(3) };
    expect(isCompleted(issue)).toBe(true);
    expect(completedAt(issue)).toBe(ago(3));
  });

  it('prefers the real resolution date when Jira did set one', () => {
    const issue = { status: 'Done', status_category: 'Done', resolved_at: ago(10), updated_at: ago(1) };
    expect(completedAt(issue)).toBe(ago(10));
  });

  it('returns null for open work, whatever its updated_at says', () => {
    const issue = { status: 'In Progress', status_category: 'In Progress', resolved_at: null, updated_at: ago(0) };
    expect(isCompleted(issue)).toBe(false);
    expect(completedAt(issue)).toBeNull();
  });

  it('does not mistake "Ready To Test" for finished work', () => {
    // Filed under the Done CATEGORY in TSM2 but named as testing; the standup
    // handles that by name. Here the category rules, and that is deliberate:
    // completion follows Jira's own bookkeeping so the numbers reconcile with
    // Jira's reports. The test pins the behaviour so a change is a decision.
    const issue = { status: 'Ready To Test', status_category: 'Done', updated_at: ago(2) };
    expect(isCompleted(issue)).toBe(true);
  });

  it('falls back to the status NAME when no category is cached', () => {
    expect(isCompleted({ status: 'Closed' })).toBe(true);
    expect(isCompleted({ status: 'To Do' })).toBe(false);
  });

  it('tolerates a missing issue', () => {
    expect(isCompleted(null)).toBe(false);
    expect(completedAt(undefined)).toBeNull();
  });
});

describe('window helpers', () => {
  it('completedWithin uses the derived completion date', () => {
    const issue = { status_category: 'Done', resolved_at: null, updated_at: ago(20) };
    expect(completedWithin(issue, 30, NOW)).toBe(true);
    expect(completedWithin(issue, 10, NOW)).toBe(false);
  });

  it('completedWithin is false for open work', () => {
    expect(completedWithin({ status_category: 'To Do', updated_at: ago(1) }, 90, NOW)).toBe(false);
  });

  it('createdWithin and completedWithin share edge handling', () => {
    const issue = { created_at: ago(90), status_category: 'Done', updated_at: ago(90) };
    // Exactly on the boundary counts as inside the window for both.
    expect(createdWithin(issue, 90, NOW)).toBe(true);
    expect(completedWithin(issue, 90, NOW)).toBe(true);
  });

  it('rejects unparseable timestamps rather than throwing', () => {
    expect(createdWithin({ created_at: 'not a date' }, 30, NOW)).toBe(false);
    expect(completedWithin({ status_category: 'Done', updated_at: 'nope' }, 30, NOW)).toBe(false);
  });
});
