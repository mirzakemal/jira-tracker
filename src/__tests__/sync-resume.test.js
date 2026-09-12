/**
 * Regression tests for the production sync failure: a run that stopped part
 * way through and restarted from scratch on the next attempt.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import 'fake-indexeddb/auto';

async function freshDb() {
  const db = await import('../db/indexeddb.js');
  await db.initDatabase();
  for (const name of ['issues', 'metadata', 'issuelinks']) {
    try { await db.clear(name); } catch { /* store may not exist yet */ }
  }
  return db;
}

describe('sync checkpointing', () => {
  let progress;

  beforeEach(async () => {
    await freshDb();
    progress = await import('../db/sync-progress.js');
    await progress.clearProgress();
  });

  it('remembers completed units across an interrupted run', async () => {
    const first = await progress.beginRun('full');
    expect(first.resumed).toBe(false);

    await progress.markDone(first, 'sprint:1:10');
    await progress.markDone(first, 'sprint:1:11');

    // Simulate the tab dying here — nothing cleared the checkpoint.
    const second = await progress.beginRun('full');

    expect(second.resumed).toBe(true);
    expect(progress.isDone(second, 'sprint:1:10')).toBe(true);
    expect(progress.isDone(second, 'sprint:1:11')).toBe(true);
    expect(progress.isDone(second, 'sprint:1:12')).toBe(false);
  });

  it('resumes pagination mid-unit', async () => {
    const first = await progress.beginRun('full');
    await progress.setCursor(first, 'board:7', 300);

    const second = await progress.beginRun('full');

    expect(progress.resumeOffset(second, 'board:7')).toBe(300);
    // A different unit starts from the beginning.
    expect(progress.resumeOffset(second, 'board:8')).toBe(0);
  });

  it('clears the cursor once its unit completes', async () => {
    const run = await progress.beginRun('full');
    await progress.setCursor(run, 'board:7', 300);
    await progress.markDone(run, 'board:7');

    const next = await progress.beginRun('full');
    expect(progress.resumeOffset(next, 'board:7')).toBe(0);
    expect(progress.isDone(next, 'board:7')).toBe(true);
  });

  it('does not let a full sync adopt an incremental run\'s progress', async () => {
    const incremental = await progress.beginRun('incremental');
    await progress.markDone(incremental, 'updated:1');

    const full = await progress.beginRun('full');
    expect(full.resumed).toBe(false);
    expect(progress.isDone(full, 'updated:1')).toBe(false);
  });

  it('carries the incremental window through a resume', async () => {
    const first = await progress.beginRun('incremental', { sinceTimestamp: '2026-01-01T00:00:00.000Z' });
    await progress.markDone(first, 'updated:1');

    // A later attempt must not narrow the window to "since the failure".
    const second = await progress.beginRun('incremental', { sinceTimestamp: '2026-06-01T00:00:00.000Z' });

    expect(second.resumed).toBe(true);
    expect(second.sinceTimestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('discards a checkpoint older than the resume window', async () => {
    const db = await import('../db/indexeddb.js');
    await db.setMetadata('sync_progress', {
      runId: 'ancient',
      mode: 'full',
      startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      done: ['sprint:1:10'],
      cursor: null
    });

    const run = await progress.beginRun('full');
    expect(run.resumed).toBe(false);
    expect(progress.isDone(run, 'sprint:1:10')).toBe(false);
  });

  it('keeps full and incremental checkpoints apart', async () => {
    const full = await progress.beginRun('full');
    await progress.markDone(full, 'sprint:200:1');

    // The background incremental sync must not clobber the full run's progress.
    const incremental = await progress.beginRun('incremental');
    await progress.markDone(incremental, 'updated:200');
    await progress.clearProgress('incremental');

    const resumedFull = await progress.beginRun('full');
    expect(resumedFull.resumed).toBe(true);
    expect(progress.isDone(resumedFull, 'sprint:200:1')).toBe(true);
  });

  it('reports an interrupted run, and stops once it is cleared', async () => {
    const run = await progress.beginRun('full');
    await progress.markDone(run, 'sprint:1:10');

    expect(await progress.pendingRun()).toMatchObject({ mode: 'full', doneCount: 1 });

    await progress.clearProgress();
    expect(await progress.pendingRun()).toBeNull();
  });
});

describe('getMany', () => {
  it('reads only the requested keys', async () => {
    const db = await freshDb();
    await db.putBulk('issues', [
      { key: 'A-1', summary: 'one' },
      { key: 'A-2', summary: 'two' },
      { key: 'A-3', summary: 'three' }
    ]);

    const found = await db.getMany('issues', ['A-1', 'A-3', 'A-999']);

    expect(found.map(i => i.key).sort()).toEqual(['A-1', 'A-3']);
  });

  it('returns an empty array for no keys', async () => {
    const db = await freshDb();
    expect(await db.getMany('issues', [])).toEqual([]);
  });

  it('counts without materialising records', async () => {
    const db = await freshDb();
    await db.putBulk('issues', [{ key: 'A-1' }, { key: 'A-2' }]);
    expect(await db.count('issues')).toBe(2);
  });
});

describe('JiraClient retry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  /** Drive fake timers until `promise` settles, so backoff sleeps resolve. */
  async function runWithTimers(promise) {
    const settled = promise.then(
      value => ({ ok: true, value }),
      error => ({ ok: false, error })
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  function client(JiraClient) {
    return new JiraClient({
      domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true
    });
  }

  it('retries a 500 and succeeds', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: 1 }) });

    const result = await runWithTimers(client(JiraClient).request('/rest/api/3/myself'));

    expect(result).toEqual({ ok: true, value: { ok: 1 } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a network error', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: 1 }) });

    const result = await runWithTimers(client(JiraClient).request('/rest/api/3/myself'));

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 401 — the credential will not fix itself', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, json: () => Promise.resolve({})
    });

    const result = await runWithTimers(client(JiraClient).request('/rest/api/3/myself'));

    expect(result.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 404', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({})
    });

    const result = await runWithTimers(client(JiraClient).request('/rest/api/3/nope'));

    expect(result.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget and surfaces the last error', async () => {
    const { JiraClient, JiraError } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 503, json: () => Promise.resolve({})
    });

    const result = await runWithTimers(
      client(JiraClient).request('/rest/api/3/myself', { attempts: 3 })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(JiraError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe('JiraClient pagination', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('walks past the 50-item page cap on boards', async () => {
    const { JiraClient } = await import('../api/jira.js');
    const page = (start, size) =>
      Array.from({ length: size }, (_, i) => ({ id: start + i, name: `Board ${start + i}` }));

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: page(0, 50), isLast: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: page(50, 50), isLast: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: page(100, 7), isLast: true }) });

    const client = new JiraClient({
      domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true
    });
    const boards = await client.getBoards();

    expect(boards).toHaveLength(107);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('stops on a short page when isLast is absent', async () => {
    const { JiraClient } = await import('../api/jira.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: [{ id: 1 }, { id: 2 }] })
    });

    const client = new JiraClient({
      domain: 'd.atlassian.net', email: 'a@b.com', apiToken: 'tok', useProxy: true
    });
    const sprints = await client.getSprints(5, 'closed');

    expect(sprints).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('state=closed');
  });
});
