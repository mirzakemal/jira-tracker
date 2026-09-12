/**
 * Sync Engine
 * Fetches and caches Jira data locally using IndexedDB
 */

import logger from '../utils/logger.js';
import {
  initDatabase,
  putBulk,
  getAll,
  getMany,
  getByIndex,
  count,
  setMetadata,
  getMetadata,
  clear,
  deleteByIndex,
  STORE_NAMES as STORES
} from './indexeddb.js';
import {
  beginRun,
  isDone,
  markDone,
  setCursor,
  resumeOffset,
  clearProgress,
  pendingRun
} from './sync-progress.js';

import { CUSTOM_FIELDS } from '../jira-config.js';
import { resolveCustomFieldIds, defaultCustomFieldIds } from './field-resolver.js';
import { PRODUCT_PROJECT_KEY } from '../product-config.js';
import { syncProductBoard } from './product-sync.js';

/**
 * Sync all data from Jira
 */
export async function syncAll(client) {
  const warnings = [];

  try {
    await initDatabase();

    // Resumes an interrupted run when there is a recent checkpoint, otherwise
    // starts fresh. See sync-progress.js for why this exists.
    const run = await beginRun('full');
    logger.info(`[Sync] ${run.resumed ? 'Resuming' : 'Starting'} full sync...`);

    if (!run.resumed) {
      // Derived data, safe to rebuild — but only on a fresh run. Wiping it at
      // the start of a resume would discard changes the interrupted attempt
      // already recorded.
      await clear(STORES.CHANGELOG);
      // NOTE: issuelinks is deliberately NOT cleared. upsertIssues() replaces
      // links per issue, so a full sync still ends with an accurate store —
      // and an interrupted run no longer leaves every issue link-less.
    }

    await loadFieldIds(client);
    await syncProjects(client);
    await syncAllBoards(client);
    await syncAllSprints(client, warnings, run);

    // syncAllBoards() walks every accessible board, so both the Product and
    // Engineering boards are already cached by this point. Refresh the product
    // issues' links authoritatively, then reconcile the Product Board.
    await syncProductIssueLinks(client, warnings);
    const productBoard = await reconcileProductBoard(warnings);

    await setMetadata('last_full_sync', new Date().toISOString());
    await setMetadata('last_sync', new Date().toISOString());
    await clearProgress();

    const changeCount = await countChangelogEntries();

    logger.info(`[Sync] Full sync completed with ${changeCount} changes`);
    return { success: true, timestamp: new Date(), changeCount, warnings, productBoard };
  } catch (error) {
    // The checkpoint is left in place on purpose: it is what lets the next
    // attempt pick up from here instead of starting over.
    logger.error('[Sync] Full sync failed (progress checkpointed):', error);
    throw error;
  }
}

/**
 * Incremental sync
 */
export async function syncIncremental(client) {
  const warnings = [];

  try {
    await initDatabase();

    const lastSync = await getMetadata('last_sync');
    // An interrupted incremental run keeps its ORIGINAL window. Recomputing it
    // from `last_sync` on resume would be the same value here, but making the
    // window part of the checkpoint keeps it correct if last_sync ever moves
    // for another reason.
    const run = await beginRun('incremental', { sinceTimestamp: lastSync });
    logger.info(`[Sync] ${run.resumed ? 'Resuming' : 'Starting'} incremental sync...`);

    if (!run.resumed) {
      await clear(STORES.CHANGELOG);
    }
    // NOTE: issuelinks is deliberately NOT cleared here. An incremental sync
    // only refetches issues updated since the last run, so wiping the whole
    // store would strip the links off every issue that happened not to change
    // — and they would never come back without a full sync. upsertIssues()
    // replaces links per issue instead.

    await loadFieldIds(client);
    await syncProjects(client);
    await syncAllBoards(client);
    await syncUpdatedIssues(client, run.sinceTimestamp, warnings, run);

    await syncProductIssueLinks(client, warnings);
    const productBoard = await reconcileProductBoard(warnings);

    // Only advances once the whole run succeeded. Moving it earlier would let
    // a failed run narrow the next window and permanently skip issues.
    await setMetadata('last_sync', new Date().toISOString());
    // Scoped to this mode on purpose. An incremental run only fetches recently
    // updated issues, so it cannot stand in for an interrupted full sync —
    // clearing that checkpoint here would strand the gaps it left behind.
    await clearProgress('incremental');

    const changeCount = await countChangelogEntries();

    logger.info(`[Sync] Incremental sync completed with ${changeCount} changes`);
    return { success: true, timestamp: new Date(), changeCount, warnings, productBoard };
  } catch (error) {
    logger.error('[Sync] Incremental sync failed (progress checkpointed):', error);
    throw error;
  }
}

/**
 * Custom field ids for this sync run, resolved from the instance's field list.
 *
 * Module-level so upsertIssues() can read it without threading the value
 * through every call site.
 */
let resolvedFieldIds = defaultCustomFieldIds();

/**
 * Fetch the field list and resolve the ids we detect by name.
 *
 * Never throws: field metadata is a nicety, and losing it should degrade to the
 * configured ids rather than fail the whole sync.
 *
 * @param {object} client
 */
async function loadFieldIds(client) {
  try {
    const fields = await client.getFields();
    resolvedFieldIds = resolveCustomFieldIds(fields);
  } catch (error) {
    logger.warn('[Sync] Could not fetch field metadata, using configured ids:', error.message);
    resolvedFieldIds = defaultCustomFieldIds();
  }
}

/**
 * Fields Jira embeds about the issue at the other end of a link.
 *
 * @param {object} other - link.outwardIssue or link.inwardIssue
 * @returns {object}
 */
function linkTargetSnapshot(other) {
  const fields = other?.fields || {};
  return {
    target_summary: fields.summary || null,
    target_status: fields.status?.name || null,
    target_status_category: fields.status?.statusCategory?.name || null,
    target_type: fields.issuetype?.name || null
  };
}

/**
 * Re-fetch issue links for every Product project issue, straight from the
 * issue endpoint.
 *
 * The board/sprint sweep is not a reliable source of links for these: a board
 * that has sprints only returns issues assigned to a sprint, and the field set
 * the agile endpoint returns is not guaranteed to carry `issuelinks`. PDT-39
 * has four Polaris links in Jira but was showing one — the single row written
 * from the other end, by whichever linked TSM2 issue happened to sync.
 *
 * Scoped to the Product project (tens of issues, not thousands) and asking for
 * one field, so this stays cheap. Failures are per-issue and non-fatal.
 *
 * @param {object} client
 * @param {string[]} warnings - mutated in place
 * @returns {Promise<number>} issues whose links were refreshed
 */
async function syncProductIssueLinks(client, warnings) {
  let productIssues = [];
  try {
    // Via the project_key index, so this reads only the Product project's
    // issues rather than materialising every cached issue (and its raw_data)
    // to throw almost all of them away.
    productIssues = await getByIndex(STORES.ISSUES, 'project_key', PRODUCT_PROJECT_KEY);
  } catch (error) {
    warnings.push(`Could not read cached issues for link refresh: ${error.message}`);
    return 0;
  }

  if (productIssues.length === 0) return 0;

  let refreshed = 0;
  for (const cached of productIssues) {
    try {
      const fresh = await client.getIssue(cached.key, ['issuelinks']);
      const links = fresh?.fields?.issuelinks;
      if (!Array.isArray(links)) continue;

      await deleteByIndex(STORES.ISSUELINKS, 'source_key', cached.key);

      const entries = [];
      for (const link of links) {
        const linkType = link.type?.name || 'relates to';
        const other = link.outwardIssue || link.inwardIssue;
        if (!other?.key) continue;
        entries.push({
          source_key: cached.key,
          target_key: other.key,
          link_type: linkType,
          direction: link.outwardIssue ? 'outward' : 'inward',
          direction_label: (link.outwardIssue ? link.type?.outward : link.type?.inward) || linkType,
          // Snapshot of the linked issue, straight from the link payload. Jira
          // embeds its summary/status/type here, so a linked issue that was
          // never synced on its own still has something to show — without this
          // an unsynced epic reads as "Not synced" instead of "Epic".
          ...linkTargetSnapshot(other)
        });
      }

      if (entries.length > 0) await putBulk(STORES.ISSUELINKS, entries);
      refreshed += 1;
    } catch (error) {
      logger.warn(`[Sync] Could not refresh links for ${cached.key}:`, error.message);
    }
  }

  logger.info(`[Sync] Refreshed links for ${refreshed}/${productIssues.length} ${PRODUCT_PROJECT_KEY} issues`);
  return refreshed;
}

/**
 * Reconcile the Product Board after issues have been cached.
 *
 * Never throws: a Product Board problem must not fail an otherwise good Jira
 * sync, matching how the rest of this module degrades (log + warn).
 *
 * @param {string[]} warnings - mutated in place
 * @returns {Promise<object|null>}
 */
async function reconcileProductBoard(warnings) {
  try {
    const summary = await syncProductBoard();
    warnings.push(...summary.warnings);
    return summary;
  } catch (error) {
    logger.error('[Sync] Product board reconciliation failed:', error);
    warnings.push(`Product board reconciliation failed: ${error.message}`);
    return null;
  }
}

/**
 * Sync projects
 */
async function syncProjects(client) {
  const projectsData = await client.getProjects();
  // getProjects() returns a fully-paginated array. The older shape was the raw
  // {values: [...]} envelope, still accepted here.
  //
  // Note the Array.isArray check comes first on purpose: `[].values` is
  // Array.prototype.values, a function — so the obvious
  // `projectsData.values || projectsData` picks the method, not the array.
  const projects = Array.isArray(projectsData)
    ? projectsData
    : (projectsData?.values || []);

  const projectsToUpdate = projects.map(project => ({
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description || null,
    lead: project.lead?.accountId || null,
    syncedAt: new Date().toISOString()
  }));

  await putBulk(STORES.PROJECTS, projectsToUpdate);
  logger.debug(`[Sync] Synced ${projects.length} projects`);
}

/**
 * Sync all boards
 */
async function syncAllBoards(client) {
  const allBoards = await client.getBoards();

  const boardsToUpdate = allBoards.map(board => ({
    id: board.id,
    name: board.name,
    project_key: board.project?.key || null,
    type: board.type || null,
    syncedAt: new Date().toISOString()
  }));

  await putBulk(STORES.BOARDS, boardsToUpdate);
  logger.debug(`[Sync] Synced ${allBoards.length} boards`);
}

/**
 * Sync all sprints from all boards
 */
async function syncAllSprints(client, warnings, run) {
  const boards = await getAll(STORES.BOARDS);

  for (const board of boards) {
    await syncSprintsForBoard(client, board.id, warnings, run);
  }
}

/**
 * Sync sprints for a specific board
 */
async function syncSprintsForBoard(client, boardId, warnings, run) {
  const allSprints = [];

  try {
    const active = await client.getSprints(boardId, 'active');
    allSprints.push(...active);
  } catch (e) {
    logger.debug(`[Sync] No active sprints for board ${boardId}`);
  }

  try {
    const future = await client.getSprints(boardId, 'future');
    allSprints.push(...future);
  } catch (e) {
    logger.debug(`[Sync] No future sprints for board ${boardId}`);
  }

  try {
    const completed = await client.getSprints(boardId, 'closed');
    allSprints.push(...completed);
  } catch (e) {
    logger.debug(`[Sync] No completed sprints for board ${boardId}`);
  }

  const sprintsToUpdate = allSprints.map(sprint => {
    return ({
      id: sprint.id,
      board_id: boardId,
      name: sprint.name,
      state: sprint.state,
      start_date: sprint.startDate || null,
      end_date: sprint.endDate || null,
      syncedAt: new Date().toISOString()
    });
  });

  await putBulk(STORES.SPRINTS, sprintsToUpdate);
  logger.debug(`[Sync] Synced ${allSprints.length} sprints for board ${boardId}`);

  // If board has sprints, sync issues for each sprint
  if (allSprints.length > 0) {
    for (const sprint of allSprints) {
      await syncSprintIssues(client, boardId, sprint.id, warnings, run);
    }
  } else {
    // Board doesn't have sprints - sync all issues directly from the board
    await syncBoardIssues(client, boardId, warnings, run);
  }
}

/**
 * Sync all issues from a board (for boards without sprints)
 */
async function syncBoardIssues(client, boardId, warnings, run) {
  const unit = `board:${boardId}`;
  if (run && isDone(run, unit)) {
    logger.debug(`[Sync] Skipping ${unit} (already synced this run)`);
    return;
  }

  try {
    // Picks up mid-board if a previous attempt stopped part way through.
    let startAt = run ? resumeOffset(run, unit) : 0;
    const maxResults = 100;
    let totalIssues = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.getBoardIssues(boardId, null, startAt, maxResults);
      const issues = result.issues || [];

      if (issues.length > 0) {
        await upsertIssues(issues, boardId, null);
        totalIssues += issues.length;
      }

      hasMore = issues.length === maxResults;
      startAt += maxResults;
      if (hasMore && run) await setCursor(run, unit, startAt);
    }

    if (run) await markDone(run, unit);
    logger.debug(`[Sync] Synced ${totalIssues} issues for board ${boardId} (no sprints)`);
  } catch (error) {
    logger.error(`[Sync] Failed to sync issues for board ${boardId} (no sprints):`, error);
    warnings.push(`Failed to sync issues for board ${boardId}: ${error.message}`);
  }
}

/**
 * Sync issues for a specific sprint
 */
async function syncSprintIssues(client, boardId, sprintId, warnings, run) {
  // Keyed by board too: the same sprint can be visible from more than one
  // board, and each pairing writes a different board_id onto the issues.
  const unit = `sprint:${boardId}:${sprintId}`;
  if (run && isDone(run, unit)) {
    logger.debug(`[Sync] Skipping ${unit} (already synced this run)`);
    return;
  }

  try {
    const jql = `sprint = ${sprintId}`;
    let startAt = run ? resumeOffset(run, unit) : 0;
    const maxResults = 100;
    let totalIssues = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.getBoardIssues(boardId, jql, startAt, maxResults);
      const issues = result.issues || [];

      if (issues.length > 0) {
        await upsertIssues(issues, boardId, sprintId);
        totalIssues += issues.length;
      }

      hasMore = issues.length === maxResults;
      startAt += maxResults;
      if (hasMore && run) await setCursor(run, unit, startAt);
    }

    if (run) await markDone(run, unit);
    logger.debug(`[Sync] Synced ${totalIssues} issues for sprint ${sprintId}`);
  } catch (error) {
    logger.error(`[Sync] Failed to sync issues for sprint ${sprintId}:`, error);
    warnings.push(`Failed to sync sprint ${sprintId}: ${error.message}`);
  }
}

/**
 * Sync updated issues since a given timestamp
 */
async function syncUpdatedIssues(client, sinceTimestamp, warnings, run) {
  const boards = await getAll(STORES.BOARDS);

  for (const board of boards) {
    const unit = `updated:${board.id}`;
    if (run && isDone(run, unit)) {
      logger.debug(`[Sync] Skipping ${unit} (already synced this run)`);
      continue;
    }

    try {
      let jql = `updated >= -30d`;
      if (sinceTimestamp) {
        // Convert ISO timestamp to Jira format: yyyy-MM-dd HH:mm
        const date = new Date(sinceTimestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const jiraDate = `${year}-${month}-${day} ${hours}:${minutes}`;
        jql = `updated >= "${jiraDate}"`;
      }

      let startAt = run ? resumeOffset(run, unit) : 0;
      const maxResults = 100;
      let totalIssues = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await client.getBoardIssues(board.id, jql, startAt, maxResults);
        const issues = result.issues || [];

        if (issues.length > 0) {
          await upsertIssues(issues, board.id, null);
          totalIssues += issues.length;
        }

        hasMore = issues.length === maxResults;
        startAt += maxResults;
        if (hasMore && run) await setCursor(run, unit, startAt);
      }

      if (run) await markDone(run, unit);
      logger.debug(`[Sync] Synced ${totalIssues} updated issues for board ${board.id}`);
    } catch (error) {
      logger.error(`[Sync] Failed to sync updated issues for board ${board.id}:`, error);
      warnings.push(`Failed to sync updated issues for board ${board.id}: ${error.message}`);
    }
  }
}

/**
 * Insert or update issues with change tracking
 */
async function upsertIssues(issues, boardId, sprintId) {
  const users = new Map();
  const syncedAt = new Date().toISOString();

  for (const issue of issues) {
    const fields = issue.fields || {};
    if (fields.reporter) users.set(fields.reporter.accountId, fields.reporter);
    if (fields.assignee) users.set(fields.assignee.accountId, fields.assignee);
  }

  const usersToUpdate = Array.from(users.values()).map(user => ({
    account_id: user.accountId,
    display_name: user.displayName,
    email: user.emailAddress || null,
    avatar_url: user.avatarUrls?.['24x24'] || null,
    syncedAt
  }));

  await putBulk(STORES.USERS, usersToUpdate);

  // Build map of existing issues for diff tracking.
  //
  // Only the keys in THIS batch — previously this was getAll(ISSUES), which
  // read every cached issue (each carrying a multi-kilobyte `raw_data` blob)
  // once per page of every sprint of every board. On a 7,500-issue instance
  // that is hundreds of full-store reads per sync: the tab slowed to a crawl
  // and eventually died, which is what "the sync stops part way" looked like.
  const batchKeys = issues.map(issue => issue.key).filter(Boolean);
  const oldIssuesList = await getMany(STORES.ISSUES, batchKeys);
  const oldIssueMap = new Map();
  for (const old of oldIssuesList) {
    oldIssueMap.set(old.key, old);
  }

  const issuesToUpdate = issues.map(issue => {
    const fields = issue.fields || {};
    const fixVersion = fields.fixVersions?.[0]?.name || null;
    const parentKey = fields.parent?.key || null;

    let startDate = null;
    let sprintEndDate = null;

    if (issue.sprint) {
      const sprint = Array.isArray(issue.sprint) ? issue.sprint[0] : issue.sprint;
      startDate = sprint?.startDate || sprint?.start_date || null;
      sprintEndDate = sprint?.endDate || sprint?.end_date || null;
      if (startDate || sprintEndDate) {
        logger.debug(`[Sync] Issue ${issue.key}: Found sprint dates - start: ${startDate}, end: ${sprintEndDate}`);
      }
    }

    if (parentKey) {
      logger.debug(`[Sync] Issue ${issue.key}: Has parent_key = ${parentKey}`);
    }

    let customer = null;
    let product = null;
    let qaTesterId = null;
    let storyPoints = null;

    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_')) {
        if (key === CUSTOM_FIELDS.customer) {
          if (Array.isArray(value)) {
            const customerValues = value.map(v => {
              if (typeof v === 'string') return v;
              if (v?.value) return v.value;
              if (v?.id) return v.id;
              if (v?.name) return v.name;
              return null;
            }).filter(v => v);
            customer = customerValues.join(', ');
          } else if (typeof value === 'string') {
            customer = value;
          } else if (value?.value) {
            customer = value.value;
          } else if (value?.id) {
            customer = value.id;
          } else if (value?.name) {
            customer = value.name;
          }
          logger.debug(`[Sync] Issue ${issue.key}: ${CUSTOM_FIELDS.customer} =`, value, '-> customer =', customer);
        }
        // Detected fields are resolved to ids once per sync from the field
        // list — see field-resolver.js. Comparing the patterns against `key`
        // here could never match, since a key holds no human-readable words.
        if (key === resolvedFieldIds.product) {
          if (typeof value === 'string') product = value;
          else if (value?.value) product = value.value;
          else if (value?.name) product = value.name;
        }
        if (key === resolvedFieldIds.qaTester) {
          qaTesterId = value?.accountId || null;
        }
        if (key === resolvedFieldIds.storyPoints && typeof value === 'number') {
          storyPoints = value;
        }
        if (key === CUSTOM_FIELDS.codeReviewer1) {
          issue.code_reviewer_1_id = value?.accountId || null;
          issue.code_reviewer_1_name = value?.displayName || null;
        }
        if (key === CUSTOM_FIELDS.codeReviewer2) {
          issue.code_reviewer_2_id = value?.accountId || null;
          issue.code_reviewer_2_name = value?.displayName || null;
        }
      }
    }

    return {
      key: issue.key,
      id: issue.id,
      project_key: fields.project?.key || null,
      summary: fields.summary || null,
      description: fields.description || null,
      status: fields.status?.name || null,
      status_category: fields.status?.statusCategory?.name || null,
      priority: fields.priority?.name || null,
      issue_type: fields.issuetype?.name || null,
      reporter_id: fields.reporter?.accountId || null,
      reporter_name: fields.reporter?.displayName || null,
      assignee_id: fields.assignee?.accountId || null,
      assignee_name: fields.assignee?.displayName || null,
      code_reviewer_1_id: issue.code_reviewer_1_id || null,
      code_reviewer_1_name: issue.code_reviewer_1_name || null,
      code_reviewer_2_id: issue.code_reviewer_2_id || null,
      code_reviewer_2_name: issue.code_reviewer_2_name || null,
      created_at: fields.created || null,
      updated_at: fields.updated || null,
      resolved_at: fields.resolutiondate || null,
      start_date: startDate,
      due_date: fields.duedate || fields.dueDate || null,
      fix_version: fixVersion,
      parent_key: parentKey,
      customer,
      product,
      qa_tester_id: qaTesterId,
      story_points: storyPoints,
      sprint_id: sprintId,
      board_id: boardId,
      jira_url: `/browse/${issue.key}`,
      raw_data: JSON.stringify(issue),
      syncedAt
    };
  });

  await putBulk(STORES.ISSUES, issuesToUpdate);

  // Replace this batch's links. Scoped per issue rather than globally, so an
  // incremental sync never disturbs links on issues it did not fetch.
  for (const issue of issues) {
    try {
      await deleteByIndex(STORES.ISSUELINKS, 'source_key', issue.key);
    } catch (error) {
      logger.warn(`[Sync] Could not clear old links for ${issue.key}:`, error.message);
    }
  }

  // Extract issue links from raw_data
  const linkEntries = [];
  for (const rawIssue of issues) {
    const rawData = rawIssue.fields?.issuelinks;
    if (!rawData || !Array.isArray(rawData)) continue;

    for (const link of rawData) {
      const linkType = link.type?.name || 'relates to';
      const linkTypeInward = link.type?.inward || null;
      const linkTypeOutward = link.type?.outward || null;

      if (link.outwardIssue) {
        linkEntries.push({
          source_key: rawIssue.key,
          target_key: link.outwardIssue.key,
          link_type: linkType,
          direction: 'outward',
          direction_label: linkTypeOutward || linkType,
          ...linkTargetSnapshot(link.outwardIssue)
        });
      }
      if (link.inwardIssue) {
        linkEntries.push({
          source_key: rawIssue.key,
          target_key: link.inwardIssue.key,
          link_type: linkType,
          direction: 'inward',
          direction_label: linkTypeInward || linkType,
          ...linkTargetSnapshot(link.inwardIssue)
        });
      }
    }
  }

  if (linkEntries.length > 0) {
    await putBulk(STORES.ISSUELINKS, linkEntries);
    logger.debug(`[Sync] Extracted ${linkEntries.length} issue links`);
  }

  // Diff tracking: compare old vs new and log changes
  const changeEntries = [];
  for (const issue of issuesToUpdate) {
    const oldIssue = oldIssueMap.get(issue.key);
    if (!oldIssue) continue; // new issue, not a change

    const changes = [];
    if (oldIssue.status !== issue.status) {
      changes.push({ field: 'status', old: oldIssue.status, new: issue.status });
    }
    if (oldIssue.assignee_name !== issue.assignee_name) {
      changes.push({ field: 'assignee', old: oldIssue.assignee_name, new: issue.assignee_name });
    }
    if (oldIssue.priority !== issue.priority) {
      changes.push({ field: 'priority', old: oldIssue.priority, new: issue.priority });
    }
    if (oldIssue.fix_version !== issue.fix_version) {
      changes.push({ field: 'fix_version', old: oldIssue.fix_version, new: issue.fix_version });
    }

    if (changes.length > 0) {
      changeEntries.push({
        issue_key: issue.key,
        issue_summary: issue.summary || '',
        changes,
        sync_timestamp: syncedAt
      });
    }
  }

  if (changeEntries.length > 0) {
    await putBulk(STORES.CHANGELOG, changeEntries);
    logger.debug(`[Sync] Tracked ${changeEntries.length} changed issues`);
  }
}

/**
 * Count changelog entries
 */
async function countChangelogEntries() {
  try {
    const entries = await getAll(STORES.CHANGELOG);
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus() {
  try {
    await initDatabase();
    // count() rather than getAll().length — this runs on every status refresh,
    // and there is no reason to deserialise thousands of issues to get a number.
    const issueCount = await count(STORES.ISSUES);
    const lastFullSync = await getMetadata('last_full_sync');
    const lastSync = await getMetadata('last_sync');
    const interrupted = await pendingRun();

    return {
      lastFullSync: lastFullSync,
      lastSync: lastSync,
      issueCount,
      // Present when a previous run stopped part way. The next sync resumes
      // from here rather than starting over.
      interrupted
    };
  } catch (error) {
    logger.warn('[Sync] Could not get sync status:', error.message);
    return {
      lastFullSync: null,
      lastSync: null,
      issueCount: 0,
      interrupted: null
    };
  }
}
