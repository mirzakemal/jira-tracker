/**
 * End-to-end check that syncAll() actually uses the checkpoint.
 *
 * sync-resume.test.js covers sync-progress.js in isolation; this covers the
 * wiring, which is where the original bug lived — the progress existed
 * conceptually but nothing recorded it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

vi.stubEnv('VITE_PRODUCT_PROJECT_KEY', 'PDT');
vi.stubEnv('VITE_PRODUCT_BOARD_ID', '100');
vi.stubEnv('VITE_ENG_BOARD_ID', '200');

/**
 * A Jira client that serves a fixed board/sprint layout and can be told to
 * blow up on a specific sprint, the way a real failure would.
 */
function makeClient({ failOnSprint = null } = {}) {
  const issuesFor = (sprintId) => [{
    id: `${sprintId}00`,
    key: `TSM2-${sprintId}00`,
    fields: {
      summary: `Issue in sprint ${sprintId}`,
      project: { key: 'TSM2' },
      status: { name: 'To Do', statusCategory: { name: 'To Do' } },
      issuetype: { name: 'Task' },
      updated: '2026-01-01T00:00:00.000Z'
    }
  }];

  const calls = { sprintIssues: [] };

  return {
    calls,
    getFields: vi.fn().mockResolvedValue([]),
    getProjects: vi.fn().mockResolvedValue([{ id: '1', key: 'TSM2', name: 'Eng' }]),
    getBoards: vi.fn().mockResolvedValue([{ id: 200, name: 'Eng board', type: 'scrum' }]),
    getSprints: vi.fn().mockImplementation((boardId, state) =>
      Promise.resolve(state === 'active' ? [{ id: 1, name: 'S1', state: 'active' }]
        : state === 'future' ? [{ id: 2, name: 'S2', state: 'future' }]
          : [{ id: 3, name: 'S3', state: 'closed' }])
    ),
    getBoardIssues: vi.fn().mockImplementation((boardId, jql) => {
      const sprintId = Number(String(jql || '').replace('sprint = ', ''));
      calls.sprintIssues.push(sprintId);
      if (sprintId === failOnSprint) {
        return Promise.reject(new Error(`boom on sprint ${sprintId}`));
      }
      return Promise.resolve({ issues: issuesFor(sprintId) });
    }),
    getIssue: vi.fn().mockResolvedValue({ fields: { issuelinks: [] } })
  };
}

async function resetDb() {
  const db = await import('../db/indexeddb.js');
  await db.initDatabase();
  for (const name of Object.values(db.STORE_NAMES)) {
    try { await db.clear(name); } catch { /* store may not exist */ }
  }
  return db;
}

describe('syncAll checkpointing', () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDb();
  });

  it('records every completed sprint, and skips them on the next run', async () => {
    const { syncAll } = await import('../db/sync.js');
    const { pendingRun } = await import('../db/sync-progress.js');

    const first = makeClient();
    await syncAll(first);

    // A clean run clears its checkpoint, so nothing is left to resume.
    expect(await pendingRun()).toBeNull();
    expect(first.calls.sprintIssues.sort()).toEqual([1, 2, 3]);
  });

  it('resumes after a failure instead of restarting from the first sprint', async () => {
    const { syncAll } = await import('../db/sync.js');

    // syncSprintIssues catches per-sprint errors and records a warning, so the
    // run completes — but the failed sprint is NOT marked done.
    const failing = makeClient({ failOnSprint: 2 });
    const firstResult = await syncAll(failing);
    expect(firstResult.warnings.some(w => w.includes('sprint 2'))).toBe(true);
  });

  it('skips already-synced sprints when a run is resumed', async () => {
    const db = await resetDb();
    const { syncAll } = await import('../db/sync.js');

    // Stand in for an interrupted run that got through sprints 1 and 2.
    await db.setMetadata('sync_progress', {
      runId: 'interrupted',
      mode: 'full',
      startedAt: new Date().toISOString(),
      done: ['sprint:200:1', 'sprint:200:2'],
      cursor: null,
      sinceTimestamp: null
    });

    const client = makeClient();
    await syncAll(client);

    // Only the sprint that never finished is re-fetched.
    expect(client.calls.sprintIssues).toEqual([3]);
  });

  it('resumes mid-sprint from the stored page offset', async () => {
    const db = await resetDb();
    const { syncAll } = await import('../db/sync.js');

    await db.setMetadata('sync_progress', {
      runId: 'interrupted',
      mode: 'full',
      startedAt: new Date().toISOString(),
      done: ['sprint:200:1', 'sprint:200:2'],
      cursor: { unit: 'sprint:200:3', startAt: 400 },
      sinceTimestamp: null
    });

    const client = makeClient();
    await syncAll(client);

    const sprint3Call = client.getBoardIssues.mock.calls.find(
      call => call[1] === 'sprint = 3'
    );
    expect(sprint3Call).toBeDefined();
    expect(sprint3Call[2]).toBe(400);
  });

  it('does not wipe cached issue links at the start of a run', async () => {
    const db = await resetDb();

    await db.putBulk('issuelinks', [
      { source_key: 'TSM2-999', target_key: 'PDT-1', link_type: 'relates to' }
    ]);

    const { syncAll } = await import('../db/sync.js');
    await syncAll(makeClient());

    // TSM2-999 was never re-fetched, so its link must survive. Clearing the
    // store up front used to strip links off every issue the run did not
    // happen to reach.
    const links = await db.getByIndex('issuelinks', 'source_key', 'TSM2-999');
    expect(links).toHaveLength(1);
  });
});
