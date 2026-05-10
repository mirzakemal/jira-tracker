/**
 * Sync Engine
 * Fetches and caches Jira data locally using IndexedDB
 */

import logger from '../utils/logger.js';
import {
  initDatabase,
  putBulk,
  getAll,
  setMetadata,
  getMetadata,
  clear,
  STORE_NAMES as STORES
} from './indexeddb.js';

import { CUSTOM_FIELDS, FIELD_PATTERNS } from '../jira-config.js';

/**
 * Sync all data from Jira
 */
export async function syncAll(client) {
  logger.info('[Sync] Starting full sync...');
  const warnings = [];

  try {
    await initDatabase();
    await clear(STORES.CHANGELOG);
    await clear(STORES.ISSUELINKS);

    await syncProjects(client);
    await syncAllBoards(client);
    await syncAllSprints(client, warnings);

    await setMetadata('last_full_sync', new Date().toISOString());
    await setMetadata('last_sync', new Date().toISOString());

    const changeCount = await countChangelogEntries();

    logger.info(`[Sync] Full sync completed with ${changeCount} changes`);
    return { success: true, timestamp: new Date(), changeCount, warnings };
  } catch (error) {
    logger.error('[Sync] Full sync failed:', error);
    throw error;
  }
}

/**
 * Incremental sync
 */
export async function syncIncremental(client) {
  logger.info('[Sync] Starting incremental sync...');
  const warnings = [];

  try {
    await initDatabase();
    await clear(STORES.CHANGELOG);
    await clear(STORES.ISSUELINKS);

    const lastSync = await getMetadata('last_sync');

    await syncProjects(client);
    await syncAllBoards(client);
    await syncUpdatedIssues(client, lastSync, warnings);

    await setMetadata('last_sync', new Date().toISOString());

    const changeCount = await countChangelogEntries();

    logger.info(`[Sync] Incremental sync completed with ${changeCount} changes`);
    return { success: true, timestamp: new Date(), changeCount, warnings };
  } catch (error) {
    logger.error('[Sync] Incremental sync failed:', error);
    throw error;
  }
}

/**
 * Sync projects
 */
async function syncProjects(client) {
  const projectsData = await client.getProjects();
  const projects = projectsData.values || projectsData || [];

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
async function syncAllSprints(client, warnings) {
  const boards = await getAll(STORES.BOARDS);

  for (const board of boards) {
    await syncSprintsForBoard(client, board.id, warnings);
  }
}

/**
 * Sync sprints for a specific board
 */
async function syncSprintsForBoard(client, boardId, warnings) {
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
      await syncSprintIssues(client, boardId, sprint.id, warnings);
    }
  } else {
    // Board doesn't have sprints - sync all issues directly from the board
    await syncBoardIssues(client, boardId, warnings);
  }
}

/**
 * Sync all issues from a board (for boards without sprints)
 */
async function syncBoardIssues(client, boardId, warnings) {
  try {
    let startAt = 0;
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
    }

    logger.debug(`[Sync] Synced ${totalIssues} issues for board ${boardId} (no sprints)`);
  } catch (error) {
    logger.error(`[Sync] Failed to sync issues for board ${boardId} (no sprints):`, error);
    warnings.push(`Failed to sync issues for board ${boardId}: ${error.message}`);
  }
}

/**
 * Sync issues for a specific sprint
 */
async function syncSprintIssues(client, boardId, sprintId, warnings) {
  try {
    const jql = `sprint = ${sprintId}`;
    let startAt = 0;
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
    }

    logger.debug(`[Sync] Synced ${totalIssues} issues for sprint ${sprintId}`);
  } catch (error) {
    logger.error(`[Sync] Failed to sync issues for sprint ${sprintId}:`, error);
    warnings.push(`Failed to sync sprint ${sprintId}: ${error.message}`);
  }
}

/**
 * Sync updated issues since a given timestamp
 */
async function syncUpdatedIssues(client, sinceTimestamp, warnings) {
  const boards = await getAll(STORES.BOARDS);

  for (const board of boards) {
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

      let startAt = 0;
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
      }

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

  // Build map of existing issues for diff tracking
  const oldIssuesList = await getAll(STORES.ISSUES);
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

    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_')) {
        const fieldName = key.toLowerCase();
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
        if (FIELD_PATTERNS.product.some(p => fieldName.includes(p)) && typeof value === 'string') {
          product = value;
        }
        if (FIELD_PATTERNS.qaTester.some(p => fieldName.includes(p))) {
          qaTesterId = value?.accountId || null;
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
      sprint_id: sprintId,
      board_id: boardId,
      jira_url: `/browse/${issue.key}`,
      raw_data: JSON.stringify(issue),
      syncedAt
    };
  });

  await putBulk(STORES.ISSUES, issuesToUpdate);

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
          direction_label: linkTypeOutward || linkType
        });
      }
      if (link.inwardIssue) {
        linkEntries.push({
          source_key: rawIssue.key,
          target_key: link.inwardIssue.key,
          link_type: linkType,
          direction: 'inward',
          direction_label: linkTypeInward || linkType
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
    const issues = await getAll(STORES.ISSUES);
    const lastFullSync = await getMetadata('last_full_sync');
    const lastSync = await getMetadata('last_sync');

    return {
      lastFullSync: lastFullSync,
      lastSync: lastSync,
      issueCount: issues.length
    };
  } catch (error) {
    logger.warn('[Sync] Could not get sync status:', error.message);
    return {
      lastFullSync: null,
      lastSync: null,
      issueCount: 0
    };
  }
}
