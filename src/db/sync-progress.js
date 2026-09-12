/**
 * Sync checkpointing
 *
 * A full sync walks every board, every sprint on every board, and every page
 * of issues in every sprint. On a real instance that is thousands of requests
 * and several minutes. Before this module, none of that progress was recorded
 * until the very last step wrote `last_sync` — so any interruption (a closed
 * tab, a dropped connection, a laptop lid) threw the entire run away and the
 * next sync restarted from board one.
 *
 * The checkpoint is deliberately coarse. It records which *work units* have
 * finished (a unit is one sprint, or one board's issue sweep) plus how far
 * pagination got inside the unit currently in flight. Re-running a unit is
 * cheap and idempotent — issues are upserted by key — so the worst case on
 * resume is repeating a single page.
 */

import logger from '../utils/logger.js';
import { setMetadata, getMetadata, del, STORE_NAMES as STORES } from './indexeddb.js';

/**
 * Checkpoints are stored per mode.
 *
 * A single shared key looked simpler, but the 5-minute background incremental
 * sync would then overwrite the checkpoint of an interrupted full sync — and
 * an incremental run only fetches recently-updated issues, so it can never
 * fill the gaps the full run left behind. Keeping them apart means a partial
 * full sync stays resumable while background refreshes carry on.
 */
const PROGRESS_KEYS = {
  full: 'sync_progress_full',
  incremental: 'sync_progress_incremental'
};

/** Pre-split key, retired in favour of PROGRESS_KEYS. Cleaned up on sight. */
const LEGACY_PROGRESS_KEY = 'sync_progress';

/**
 * @param {'full'|'incremental'} mode
 * @returns {string}
 */
function keyFor(mode) {
  const key = PROGRESS_KEYS[mode];
  if (!key) throw new Error(`Unknown sync mode: ${mode}`);
  return key;
}

/**
 * How long a checkpoint stays resumable.
 *
 * Past this, the data a partial run collected is stale enough that resuming
 * would stitch together two very different views of Jira, so we start over.
 */
const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Read the stored checkpoint, if there is a usable one.
 *
 * @param {'full'|'incremental'} mode - only a checkpoint from the same mode
 *   can be resumed; a full sync cannot adopt an incremental run's progress.
 * @returns {Promise<{runId: string, mode: string, startedAt: string,
 *   done: Set<string>, cursor: object|null, sinceTimestamp: string|null}|null>}
 */
export async function loadProgress(mode) {
  let stored;
  try {
    stored = await getMetadata(keyFor(mode));
    // Adopt a checkpoint written before the per-mode split, so an upgrade
    // mid-sync does not silently throw away a run's progress.
    if (!stored) {
      const legacy = await getMetadata(LEGACY_PROGRESS_KEY);
      if (legacy?.mode === mode) stored = legacy;
    }
  } catch (error) {
    logger.warn('[Sync] Could not read checkpoint:', error.message);
    return null;
  }

  if (!stored || stored.mode !== mode) return null;

  const age = Date.now() - new Date(stored.startedAt).getTime();
  if (!Number.isFinite(age) || age > MAX_RESUME_AGE_MS) {
    logger.info('[Sync] Discarding stale checkpoint');
    return null;
  }

  return {
    ...stored,
    done: new Set(stored.done || []),
    cursor: stored.cursor || null
  };
}

/**
 * Start a new run, or adopt the checkpoint from an interrupted one.
 *
 * @param {'full'|'incremental'} mode
 * @param {object} [options]
 * @param {string|null} [options.sinceTimestamp] - carried through a resume so
 *   an interrupted incremental sync keeps its original window instead of
 *   silently narrowing it to "since the failure".
 * @returns {Promise<object>} the live progress record
 */
export async function beginRun(mode, { sinceTimestamp = null } = {}) {
  const existing = await loadProgress(mode);

  if (existing) {
    logger.info(
      `[Sync] Resuming ${mode} sync ${existing.runId} — ${existing.done.size} unit(s) already done`
    );
    return { ...existing, resumed: true };
  }

  const run = {
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    startedAt: new Date().toISOString(),
    done: new Set(),
    cursor: null,
    sinceTimestamp,
    resumed: false
  };

  await persist(run);
  return run;
}

/**
 * Has this unit already completed, in this run or an earlier interrupted one?
 *
 * @param {object} run
 * @param {string} unit
 * @returns {boolean}
 */
export function isDone(run, unit) {
  return run.done.has(unit);
}

/**
 * Where to resume pagination for a unit.
 *
 * Returns 0 unless this is the exact unit that was in flight when the previous
 * attempt stopped.
 *
 * @param {object} run
 * @param {string} unit
 * @returns {number}
 */
export function resumeOffset(run, unit) {
  return run.cursor?.unit === unit ? (run.cursor.startAt || 0) : 0;
}

/**
 * Record mid-unit pagination progress.
 *
 * @param {object} run
 * @param {string} unit
 * @param {number} startAt
 */
export async function setCursor(run, unit, startAt) {
  run.cursor = { unit, startAt };
  await persist(run);
}

/**
 * Mark a unit finished and clear the cursor.
 *
 * @param {object} run
 * @param {string} unit
 */
export async function markDone(run, unit) {
  run.done.add(unit);
  run.cursor = null;
  await persist(run);
}

/**
 * Drop the checkpoint. Called once a run finishes cleanly — leaving it behind
 * would make the next sync think it had work to skip.
 */
export async function clearProgress(mode = null) {
  // Clearing every mode by default: a completed full sync has, by definition,
  // also done everything an interrupted incremental run was still owed.
  // The legacy key is only dropped on a clear-everything call — a mode-scoped
  // clear must not delete a pre-split checkpoint belonging to the other mode.
  const keys = mode
    ? [keyFor(mode)]
    : [...Object.values(PROGRESS_KEYS), LEGACY_PROGRESS_KEY];
  for (const key of keys) {
    try {
      await del(STORES.METADATA, key);
    } catch (error) {
      logger.warn('[Sync] Could not clear checkpoint:', error.message);
    }
  }
}

/**
 * Write the checkpoint.
 *
 * Never throws: failing to checkpoint should cost resumability, not the sync
 * itself. A Set is not structured-cloneable in every engine, so `done` is
 * stored as an array.
 *
 * @param {object} run
 */
async function persist(run) {
  try {
    await setMetadata(keyFor(run.mode), {
      runId: run.runId,
      mode: run.mode,
      startedAt: run.startedAt,
      done: Array.from(run.done),
      cursor: run.cursor,
      sinceTimestamp: run.sinceTimestamp ?? null
    });
  } catch (error) {
    logger.warn('[Sync] Could not write checkpoint:', error.message);
  }
}

/**
 * Human-readable state of an interrupted run, for the UI.
 *
 * @returns {Promise<{mode: string, doneCount: number, startedAt: string}|null>}
 */
export async function pendingRun() {
  const full = await loadProgress('full');
  const incremental = full ? null : await loadProgress('incremental');
  const run = full || incremental;
  if (!run) return null;

  return { mode: run.mode, doneCount: run.done.size, startedAt: run.startedAt };
}
