/**
 * Sync Engine
 * Fetches and caches Jira data locally using IndexedDB
 */

import {
  initDatabase,
  put,
  putBulk,
  get,
  getAll,
  getAllFiltered,
  setMetadata,
  getMetadata
} from './indexeddb.js';

const STORES = {
  PROJECTS: 'projects',
  BOARDS: 'boards',
  SPRINTS: 'sprints',
  ISSUES: 'issues',
  USERS: 'users',
  TAGS: 'tags',
  METADATA: 'metadata'
};

/**
 * Sync all data from Jira
 */
export async function syncAll(client) {
  console.log('[Sync] Starting full sync...');

  try {
    await initDatabase();

    await syncProjects(client);
    await syncAllBoards(client);
    await syncAllSprints(client);

    await setMetadata('last_full_sync', new Date().toISOString());
    await setMetadata('last_sync', new Date().toISOString());

    console.log('[Sync] Full sync completed');
    return { success: true, timestamp: new Date() };
  } catch (error) {
    console.error('[Sync] Full sync failed:', error);
    throw error;
  }
}

/**
 * Incremental sync
 */
export async function syncIncremental(client) {
  console.log('[Sync] Starting incremental sync...');

  try {
    await initDatabase();

    const lastSync = await getMetadata('last_sync');

    await syncProjects(client);
    await syncAllBoards(client);
    await syncUpdatedIssues(client, lastSync);

    await setMetadata('last_sync', new Date().toISOString());

    console.log('[Sync] Incremental sync completed');
    return { success: true, timestamp: new Date() };
  } catch (error) {
    console.error('[Sync] Incremental sync failed:', error);
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
  console.log(`[Sync] Synced ${projects.length} projects`);
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
  console.log(`[Sync] Synced ${allBoards.length} boards`);
}

/**
 * Sync all sprints from all boards
 */
async function syncAllSprints(client) {
  const boards = await getAll(STORES.BOARDS);

  for (const board of boards) {
    await syncSprintsForBoard(client, board.id);
  }
}

/**
 * Sync sprints for a specific board
 */
async function syncSprintsForBoard(client, boardId) {
  const allSprints = [];

  try {
    const active = await client.getSprints(boardId, 'active');
    allSprints.push(...active);
  } catch (e) {
    console.log(`[Sync] No active sprints for board ${boardId}`);
  }

  try {
    const future = await client.getSprints(boardId, 'future');
    allSprints.push(...future);
  } catch (e) {
    console.log(`[Sync] No future sprints for board ${boardId}`);
  }

  try {
    const completed = await client.getSprints(boardId, 'closed');
    allSprints.push(...completed);
  } catch (e) {
    console.log(`[Sync] No completed sprints for board ${boardId}`);
  }

  const sprintsToUpdate = allSprints.map(sprint => ({
    id: sprint.id,
    board_id: boardId,
    name: sprint.name,
    state: sprint.state,
    start_date: sprint.startDate || null,
    end_date: sprint.endDate || null,
    syncedAt: new Date().toISOString()
  }));

  await putBulk(STORES.SPRINTS, sprintsToUpdate);
  console.log(`[Sync] Synced ${allSprints.length} sprints for board ${boardId}`);

  // If board has sprints, sync issues for each sprint
  if (allSprints.length > 0) {
    for (const sprint of allSprints) {
      await syncSprintIssues(client, boardId, sprint.id);
    }
  } else {
    // Board doesn't have sprints - sync all issues directly from the board
    await syncBoardIssues(client, boardId);
  }
}

/**
 * Sync all issues from a board (for boards without sprints)
 */
async function syncBoardIssues(client, boardId) {
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

    console.log(`[Sync] Synced ${totalIssues} issues for board ${boardId} (no sprints)`);
  } catch (error) {
    console.error(`[Sync] Failed to sync issues for board ${boardId} (no sprints):`, error);
  }
}

/**
 * Sync issues for a specific sprint
 */
async function syncSprintIssues(client, boardId, sprintId) {
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

    console.log(`[Sync] Synced ${totalIssues} issues for sprint ${sprintId}`);
  } catch (error) {
    console.error(`[Sync] Failed to sync issues for sprint ${sprintId}:`, error);
  }
}

/**
 * Sync updated issues since a given timestamp
 */
async function syncUpdatedIssues(client, sinceTimestamp) {
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

      console.log(`[Sync] Synced ${totalIssues} updated issues for board ${board.id}`);
    } catch (error) {
      console.error(`[Sync] Failed to sync updated issues for board ${board.id}:`, error);
    }
  }
}

/**
 * Insert or update issues
 */
async function upsertIssues(issues, boardId, sprintId) {
  const users = new Map();

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
    syncedAt: new Date().toISOString()
  }));

  await putBulk(STORES.USERS, usersToUpdate);

  const issuesToUpdate = issues.map(issue => {
    const fields = issue.fields || {};
    const fixVersion = fields.fixVersions?.[0]?.name || null;

    let customer = null;
    let product = null;
    let qaTesterId = null;

    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_')) {
        const fieldName = key.toLowerCase();
        // Check for specific custom field ID for customer (can be array, string, or object)
        if (key === 'customfield_10043') {
          if (Array.isArray(value)) {
            // Handle array of strings or array of objects
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
          console.log(`[Sync] Issue ${issue.key}: customfield_10043 =`, value, '-> customer =', customer);
        }
        if (fieldName.includes('product') && typeof value === 'string') {
          product = value;
        }
        if (fieldName.includes('qa') || fieldName.includes('tester')) {
          qaTesterId = value?.accountId || null;
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
      assignee_id: fields.assignee?.accountId || null,
      reviewer_ids: fields.commenters?.map(c => c.accountId).join(',') || null,
      created_at: fields.created || null,
      updated_at: fields.updated || null,
      resolved_at: fields.resolutiondate || null,
      due_date: fields.duedate || null,
      fix_version: fixVersion,
      customer,
      product,
      qa_tester_id: qaTesterId,
      sprint_id: sprintId,
      board_id: boardId,
      jira_url: `/browse/${issue.key}`,
      raw_data: JSON.stringify(issue),
      syncedAt: new Date().toISOString()
    };
  });

  await putBulk(STORES.ISSUES, issuesToUpdate);
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
    console.warn('[Sync] Could not get sync status:', error.message);
    return {
      lastFullSync: null,
      lastSync: null,
      issueCount: 0
    };
  }
}
