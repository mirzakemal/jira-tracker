/**
 * Query Helpers for Filtered Data Retrieval
 * Uses IndexedDB storage with optimized filtering
 */

import {
  initDatabase,
  getAll,
  getAllFiltered,
  getByIndex,
  get,
  put,
  del,
  getDatabase
} from './indexeddb.js';

const STORES = {
  PROJECTS: 'projects',
  BOARDS: 'boards',
  SPRINTS: 'sprints',
  ISSUES: 'issues',
  USERS: 'users',
  TAGS: 'tags',
  VIEWS: 'views',
  METADATA: 'metadata'
};

// Cache for filter options to avoid repeated DB queries
let filterOptionsCache = {
  statuses: null,
  fixVersions: null,
  customers: null,
  products: null,
  users: null,
  tags: null,
  timestamp: 0
};

const CACHE_TTL = 60000; // 1 minute cache TTL

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return filterOptionsCache.timestamp && (Date.now() - filterOptionsCache.timestamp) < CACHE_TTL;
}

/**
 * Invalidate filter options cache
 */
export function invalidateFilterCache() {
  filterOptionsCache = {
    statuses: null,
    fixVersions: null,
    customers: null,
    products: null,
    users: null,
    tags: null,
    timestamp: 0
  };
}

/**
 * Get all issues with optional filters
 * Optimized to use IndexedDB indexes where possible
 */
export async function getAllIssues(filters = {}) {
  await initDatabase();

  // Start with an index-guided query if we have a selective filter
  let issues;

  // Use the most selective index if available
  if (filters.status && filters.status.length === 1) {
    // Single status filter - use status index
    issues = await getByIndex(STORES.ISSUES, 'status', filters.status[0]);
  } else if (filters.fixVersion) {
    issues = await getByIndex(STORES.ISSUES, 'fix_version', filters.fixVersion);
  } else if (filters.customer) {
    issues = await getByIndex(STORES.ISSUES, 'customer', filters.customer);
  } else if (filters.product) {
    issues = await getByIndex(STORES.ISSUES, 'product', filters.product);
  } else if (filters.assigneeId) {
    issues = await getByIndex(STORES.ISSUES, 'assignee_id', filters.assigneeId);
  } else if (filters.reporterId) {
    issues = await getByIndex(STORES.ISSUES, 'reporter_id', filters.reporterId);
  } else if (filters.qaTesterId) {
    issues = await getByIndex(STORES.ISSUES, 'qa_tester_id', filters.qaTesterId);
  } else if (filters.boardId) {
    // Board ID is commonly used, check this next
    issues = await getAllFiltered(STORES.ISSUES, (issue) => issue.board_id === filters.boardId);
  } else if (filters.sprintId) {
    issues = await getAllFiltered(STORES.ISSUES, (issue) => issue.sprint_id === filters.sprintId);
  } else {
    // No selective filter - get all issues
    issues = await getAll(STORES.ISSUES);
  }

  // Apply remaining filters in JavaScript
  let filteredIssues = issues.filter(issue => {
    // Project filter
    if (filters.projectKey && issue.project_key !== filters.projectKey) return false;

    // Board/Sprint filters (already handled above if sole filter)
    if (filters.boardId && issue.board_id !== filters.boardId) return false;
    if (filters.sprintId && issue.sprint_id !== filters.sprintId) return false;

    // Multi-select status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(issue.status)) return false;
    }

    // Single-value filters (already used as index if sole filter)
    if (filters.fixVersion && issue.fix_version !== filters.fixVersion) return false;
    if (filters.customer) {
      const issueCustomers = issue.customer?.split(',').map(c => c.trim()) || [];
      if (!issueCustomers.includes(filters.customer)) return false;
    }
    if (filters.product && issue.product !== filters.product) return false;
    if (filters.assigneeId && issue.assignee_id !== filters.assigneeId) return false;
    if (filters.reporterId && issue.reporter_id !== filters.reporterId) return false;
    if (filters.qaTesterId && issue.qa_tester_id !== filters.qaTesterId) return false;

    // Date filters
    if (filters.updatedAfter) {
      if (!issue.updated_at || issue.updated_at < filters.updatedAfter) return false;
    }

    // To Be Tested filter
    if (filters.toBeTestedByDate) {
      const needsTesting = !['Done', 'Closed', 'Resolved'].includes(issue.status);
      const updatedBeforeDate = issue.updated_at && issue.updated_at <= filters.toBeTestedByDate + 'T23:59:59Z';
      if (!needsTesting || !updatedBeforeDate) return false;
    }

    // Search query - text search on key and summary
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const match = (issue.summary?.toLowerCase().includes(query) ||
                     issue.key?.toLowerCase().includes(query));
      if (!match) return false;
    }

    return true;
  });

  // Load users once for enrichment
  const users = await getAll(STORES.USERS);
  const userMap = new Map(users.map(u => [u.account_id, u.display_name]));

  // Enrich issues with user names
  const enrichedIssues = filteredIssues.map(issue => ({
    ...issue,
    assignee_name: issue.assignee_id ? (userMap.get(issue.assignee_id) || 'Unassigned') : null,
    reporter_name: issue.reporter_id ? (userMap.get(issue.reporter_id) || 'Unknown') : null,
    qa_tester_name: issue.qa_tester_id ? (userMap.get(issue.qa_tester_id) || null) : null
  }));

  // Load all tags in a single query
  const allTags = await getAll(STORES.TAGS);
  const tagsByIssue = new Map();
  for (const tag of allTags) {
    if (!tagsByIssue.has(tag.issue_key)) {
      tagsByIssue.set(tag.issue_key, []);
    }
    tagsByIssue.get(tag.issue_key).push(tag.tag_name);
  }

  // Attach tags and filter by tag if needed
  const issuesWithTags = enrichedIssues.filter(issue => {
    const tags = tagsByIssue.get(issue.key) || [];
    issue.tags = tags;

    if (filters.tag && !tags.includes(filters.tag)) {
      return false;
    }
    return true;
  });

  return issuesWithTags;
}

/**
 * Get issues by board
 */
export function getIssuesByBoard(boardId, filters = {}) {
  return getAllIssues({ ...filters, boardId });
}

/**
 * Get issues by sprint
 */
export function getIssuesBySprint(sprintId, filters = {}) {
  return getAllIssues({ ...filters, sprintId });
}

/**
 * Get issues by status
 */
export function getIssuesByStatus(status) {
  return getAllIssues({ status: [status] });
}

/**
 * Get issues by fix version
 */
export function getIssuesByFixVersion(version) {
  return getAllIssues({ fixVersion: version });
}

/**
 * Get issues by customer
 */
export function getIssuesByCustomer(customer) {
  return getAllIssues({ customer });
}

/**
 * Get issues by product
 */
export function getIssuesByProduct(product) {
  return getAllIssues({ product });
}

/**
 * Get issues that need testing
 */
export function getIssuesToBeTestedBy(date) {
  return getAllIssues({ toBeTestedByDate: true, updatedAfter: date });
}

/**
 * Get a single issue by key
 */
export async function getIssueByKey(key) {
  await initDatabase();
  const issue = await get(STORES.ISSUES, key);
  if (issue) {
    const tags = await getTags(key);
    issue.tags = tags;
  }
  return issue || null;
}

/**
 * Get all distinct fix versions - uses cache
 */
export async function getFixVersions(projectKey = null) {
  if (isCacheValid() && filterOptionsCache.fixVersions !== null) {
    return filterOptionsCache.fixVersions;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const versions = [...new Set(
    issues
      .filter(i => i.fix_version && (!projectKey || i.project_key === projectKey))
      .map(i => i.fix_version)
  )].sort();

  filterOptionsCache.fixVersions = versions;
  filterOptionsCache.timestamp = Date.now();
  return versions;
}

/**
 * Get all distinct customers - uses cache
 */
export async function getCustomers(projectKey = null) {
  if (isCacheValid() && filterOptionsCache.customers !== null) {
    return filterOptionsCache.customers;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const allCustomers = [];

  issues.forEach(issue => {
    if (!issue.customer) return;
    if (projectKey && issue.project_key !== projectKey) return;

    const customerList = issue.customer.split(',').map(c => c.trim()).filter(c => c);
    allCustomers.push(...customerList);
  });

  const customers = [...new Set(allCustomers)].sort();
  filterOptionsCache.customers = customers;
  filterOptionsCache.timestamp = Date.now();
  return customers;
}

/**
 * Get all distinct products - uses cache
 */
export async function getProducts(projectKey = null) {
  if (isCacheValid() && filterOptionsCache.products !== null) {
    return filterOptionsCache.products;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const products = [...new Set(
    issues
      .filter(i => i.product && (!projectKey || i.project_key === projectKey))
      .map(i => i.product)
  )].sort();

  filterOptionsCache.products = products;
  filterOptionsCache.timestamp = Date.now();
  return products;
}

/**
 * Get all distinct statuses - uses cache
 */
export async function getStatuses() {
  if (isCacheValid() && filterOptionsCache.statuses !== null) {
    return filterOptionsCache.statuses;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const statuses = [...new Set(
    issues
      .filter(i => i.status)
      .map(i => i.status)
  )].sort();

  filterOptionsCache.statuses = statuses;
  filterOptionsCache.timestamp = Date.now();
  return statuses;
}

/**
 * Get all sprints
 */
export function getAllSprints(boardId = null) {
  return initDatabase().then(async () => {
    const sprints = await getAll(STORES.SPRINTS);
    if (boardId) {
      return sprints.filter(s => s.board_id === boardId);
    }
    return sprints.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
  });
}

/**
 * Get all boards
 */
export function getAllBoards(projectKey = null) {
  return initDatabase().then(async () => {
    const boards = await getAll(STORES.BOARDS);
    if (projectKey) {
      return boards.filter(b => b.project_key === projectKey);
    }
    return boards.sort((a, b) => a.name.localeCompare(b.name));
  });
}

/**
 * Get all projects
 */
export function getAllProjects() {
  return initDatabase().then(() => getAll(STORES.PROJECTS));
}

/**
 * Get all users - uses cache
 */
export async function getAllUsers() {
  if (isCacheValid() && filterOptionsCache.users !== null) {
    return filterOptionsCache.users;
  }

  await initDatabase();
  const users = await getAll(STORES.USERS);
  const sortedUsers = users.sort((a, b) => a.display_name?.localeCompare(b.display_name));

  filterOptionsCache.users = sortedUsers;
  filterOptionsCache.timestamp = Date.now();
  return sortedUsers;
}

// ==================== Tags Management ====================

/**
 * Add a tag to an issue - invalidates cache
 */
export async function addTag(issueKey, tagName) {
  await initDatabase();
  const tags = await getTags(issueKey);
  if (!tags.includes(tagName)) {
    await put(STORES.TAGS, {
      issue_key: issueKey,
      tag_name: tagName,
      created_at: new Date().toISOString()
    });
    invalidateFilterCache(); // Tags changed, invalidate cache
  }
}

/**
 * Remove a tag from an issue - invalidates cache
 */
export async function removeTag(issueKey, tagName) {
  await initDatabase();
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TAGS, 'readwrite');
    const store = tx.objectStore(STORES.TAGS);
    const index = store.index('issue_key');
    const request = index.openCursor(IDBKeyRange.only(issueKey));

    let deleted = false;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.tag_name === tagName) {
          cursor.delete();
          deleted = true;
        }
        cursor.continue();
      } else {
        // Cursor finished iterating, wait for transaction to complete
        if (deleted) {
          tx.oncomplete = () => {
            invalidateFilterCache();
            resolve();
          };
        } else {
          resolve(); // Tag not found
        }
      }
    };

    request.onerror = () => reject(new Error(request.error?.message));
    tx.onerror = () => reject(new Error(tx.error?.message));
  });
}

/**
 * Get all tags for an issue
 */
export async function getTags(issueKey) {
  await initDatabase();
  const tags = await getAll(STORES.TAGS);
  return tags
    .filter(t => t.issue_key === issueKey)
    .map(t => t.tag_name);
}

/**
 * Get all distinct tags - uses cache
 */
export async function getAllTags() {
  if (isCacheValid() && filterOptionsCache.tags !== null) {
    return filterOptionsCache.tags;
  }

  await initDatabase();
  const tags = await getAll(STORES.TAGS);
  const uniqueTags = [...new Set(tags.map(t => t.tag_name))].sort();

  filterOptionsCache.tags = uniqueTags;
  filterOptionsCache.timestamp = Date.now();
  return uniqueTags;
}

/**
 * Get issues by tag - uses index
 */
export async function getIssuesByTag(tagName) {
  await initDatabase();
  const tags = await getByIndex(STORES.TAGS, 'tag_name', tagName);
  const issueKeys = tags.map(t => t.issue_key);

  const issues = await getAll(STORES.ISSUES);
  return issues.filter(i => issueKeys.includes(i.key));
}

/**
 * Get tags for multiple issues at once - optimized batch query
 */
export async function getTagsForIssues(issueKeys) {
  await initDatabase();
  const tags = await getAll(STORES.TAGS);
  const tagsByIssue = {};

  for (const tag of tags) {
    if (issueKeys.includes(tag.issue_key)) {
      if (!tagsByIssue[tag.issue_key]) {
        tagsByIssue[tag.issue_key] = [];
      }
      if (!tagsByIssue[tag.issue_key].includes(tag.tag_name)) {
        tagsByIssue[tag.issue_key].push(tag.tag_name);
      }
    }
  }

  return tagsByIssue;
}

// ==================== Saved Views Management ====================

/**
 * Save a view configuration
 */
export async function saveView(name, columns, filters) {
  await initDatabase();
  const result = await put(STORES.VIEWS, {
    name,
    columns,
    filters,
    created_at: new Date().toISOString()
  });
  return result;
}

/**
 * Get all saved views
 */
export async function getSavedViews() {
  await initDatabase();
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VIEWS, 'readonly');
    const store = tx.objectStore(STORES.VIEWS);
    const request = store.openCursor();

    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        // Add the key (id) to the view object
        results.push({
          id: cursor.key,
          ...cursor.value
        });
        cursor.continue();
      } else {
        // Sort by created_at descending
        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(results);
      }
    };

    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Delete a saved view
 */
export async function deleteView(id) {
  await initDatabase();
  // Ensure id is a number for IndexedDB autoIncrement key
  const numericId = typeof id === 'string' ? parseInt(id) : id;
  await del(STORES.VIEWS, numericId);
}

// ==================== Roadmap Queries ====================

/**
 * Get issues for roadmap view with date range filtering
 */
export async function getRoadmapIssues(filters = {}) {
  await initDatabase();

  // Get all issues and filter by date range
  const issues = await getAll(STORES.ISSUES);

  // Calculate date range (default: next 3 months)
  const today = new Date();
  const startDate = filters.startDate
    ? new Date(filters.startDate)
    : today;
  const endDate = filters.endDate
    ? new Date(filters.endDate)
    : new Date(today.setMonth(today.getMonth() + 3));

  // Filter issues that have dates within range
  const filteredIssues = issues.filter(issue => {
    // Skip issues without any date fields
    const issueStart = issue.start_date ? new Date(issue.start_date) : null;
    const issueDue = issue.due_date ? new Date(issue.due_date) : null;
    const issueEnd = issue.resolved_at ? new Date(issue.resolved_at) : issueDue;

    // Check if issue falls within date range
    const hasStartInRange = issueStart && issueStart >= startDate && issueStart <= endDate;
    const hasDueInRange = issueDue && issueDue >= startDate && issueDue <= endDate;
    const hasEndInRange = issueEnd && issueEnd >= startDate && issueEnd <= endDate;

    // Include issue if any date field is in range, or if no dates but has sprint
    if (!hasStartInRange && !hasDueInRange && !hasEndInRange) {
      return issue.sprint_id && !issue.due_date && !issue.start_date;
    }

    // Apply other filters
    if (filters.projectKey && issue.project_key !== filters.projectKey) return false;
    if (filters.status && filters.status.length > 0 && !filters.status.includes(issue.status)) return false;
    if (filters.fixVersion && issue.fix_version !== filters.fixVersion) return false;
    if (filters.customer) {
      const issueCustomers = issue.customer?.split(',').map(c => c.trim()) || [];
      if (!issueCustomers.includes(filters.customer)) return false;
    }
    if (filters.product && issue.product !== filters.product) return false;
    if (filters.assigneeId && issue.assignee_id !== filters.assigneeId) return false;
    if (filters.tag) {
      const issueTags = filters.issueTags?.[issue.key] || [];
      if (!issueTags.includes(filters.tag)) return false;
    }

    return true;
  });

  // Load users for enrichment
  const users = await getAll(STORES.USERS);
  const userMap = new Map(users.map(u => [u.account_id, u.display_name]));

  // Enrich issues with user names and parent info
  const enrichedIssues = filteredIssues.map(issue => ({
    ...issue,
    assignee_name: issue.assignee_id ? (userMap.get(issue.assignee_id) || 'Unassigned') : null,
    reporter_name: issue.reporter_id ? (userMap.get(issue.reporter_id) || 'Unknown') : null,
    qa_tester_name: issue.qa_tester_id ? (userMap.get(issue.qa_tester_id) || null) : null
  }));

  // Load tags
  const allTags = await getAll(STORES.TAGS);
  const tagsByIssue = new Map();
  for (const tag of allTags) {
    if (!tagsByIssue.has(tag.issue_key)) {
      tagsByIssue.set(tag.issue_key, []);
    }
    tagsByIssue.get(tag.issue_key).push(tag.tag_name);
  }

  // Attach tags
  const issuesWithTags = enrichedIssues.map(issue => ({
    ...issue,
    tags: tagsByIssue.get(issue.key) || []
  }));

  return issuesWithTags;
}

/**
 * Get parent issues (epics/themes) for swimlane grouping
 */
export async function getEpicsOrThemes(projectKey = null) {
  await initDatabase();
  const issues = await getAll(STORES.ISSUES);

  // Get all unique parent keys from issues
  const parentKeys = [...new Set(
    issues
      .filter(i => i.parent_key)
      .map(i => i.parent_key)
  )];

  // If no parent keys, return empty array
  if (parentKeys.length === 0) {
    // Fallback: group by issue type (for teams that don't use epics)
    const issueTypes = [...new Set(
      issues
        .filter(i => (!projectKey || i.project_key === projectKey) && i.issue_type)
        .map(i => i.issue_type)
    )].sort();
    return issueTypes.map(type => ({
      key: `type-${type}`,
      name: type,
      is_type: true
    }));
  }

  // Fetch parent issues from IndexedDB
  const parentIssues = [];
  for (const key of parentKeys) {
    const parent = await get(STORES.ISSUES, key);
    if (parent && (!projectKey || parent.project_key === projectKey)) {
      parentIssues.push({
        key: parent.key,
        name: parent.summary || parent.key,
        is_epic: true
      });
    }
  }

  // Sort by key
  return parentIssues.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get sprints within a date range for sprint markers
 */
export async function getSprintsInDateRange(startDate, endDate) {
  await initDatabase();
  const sprints = await getAll(STORES.SPRINTS);

  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date(start.setMonth(start.getMonth() + 3));

  return sprints.filter(sprint => {
    const sprintStart = sprint.start_date ? new Date(sprint.start_date) : null;
    const sprintEnd = sprint.end_date ? new Date(sprint.end_date) : null;

    // Include sprint if it overlaps with the date range
    if (!sprintStart && !sprintEnd) return false;
    if (sprintStart && sprintStart > end) return false;
    if (sprintEnd && sprintEnd < start) return false;
    return true;
  }).sort((a, b) => {
    const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
    const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
    return aStart - bStart;
  });
}

/**
 * Get issues grouped by parent/epic for roadmap swimlanes
 */
export async function getRoadmapData(filters = {}) {
  const issues = await getRoadmapIssues(filters);
  const sprints = await getSprintsInDateRange(filters.startDate, filters.endDate);

  // DEBUG: Log issue data structure and field availability
  console.log('[RoadmapData] Total issues loaded:', issues.length);

  // Count issues with various fields
  const withParentKey = issues.filter(i => i.parent_key).length;
  const withStartDate = issues.filter(i => i.start_date).length;
  const withDueDate = issues.filter(i => i.due_date).length;
  const withResolvedAt = issues.filter(i => i.resolved_at).length;
  const withCreatedAt = issues.filter(i => i.created_at).length;
  const withSprintId = issues.filter(i => i.sprint_id).length;

  // Count by issue type
  const issueTypes = {};
  issues.forEach(issue => {
    const type = issue.issue_type || 'Unknown';
    issueTypes[type] = (issueTypes[type] || 0) + 1;
  });

  // Count by fix_version
  const fixVersions = {};
  issues.forEach(issue => {
    const version = issue.fix_version || 'No Version';
    fixVersions[version] = (fixVersions[version] || 0) + 1;
  });

  // Sample issue data (first 3 issues)
  const sampleIssues = issues.slice(0, 3).map(i => ({
    key: i.key,
    issue_type: i.issue_type,
    parent_key: i.parent_key,
    start_date: i.start_date,
    due_date: i.due_date,
    resolved_at: i.resolved_at,
    created_at: i.created_at,
    updated_at: i.updated_at,
    sprint_id: i.sprint_id,
    fix_version: i.fix_version,
    status: i.status,
    assignee_id: i.assignee_id
  }));

  console.log('[RoadmapData] Field availability:', {
    withParentKey,
    withStartDate,
    withDueDate,
    withResolvedAt,
    withCreatedAt,
    withSprintId
  });
  console.log('[RoadmapData] Issue types:', issueTypes);
  console.log('[RoadmapData] Fix versions:', fixVersions);
  console.log('[RoadmapData] Sample issues:', sampleIssues);

  // Determine grouping strategy based on filters and data availability
  const groupBy = filters.groupBy || 'epic';
  let groups = [];
  let issuesByGroup = {};

  // Get epics/parents if needed
  const epics = await getEpicsOrThemes(filters.projectKey);

  switch (groupBy) {
    case 'epic':
      // Group by parent_key (Epic/Theme)
      groups = [...epics];
      issuesByGroup['no-epic'] = {
        epic: { key: 'no-epic', name: 'Unsorted Issues' },
        issues: []
      };

      // Initialize epic groups
      epics.forEach(epic => {
        issuesByGroup[epic.key] = { epic, issues: [] };
      });

      // Group issues
      issues.forEach(issue => {
        const groupKey = issue.parent_key || 'no-epic';
        if (!issuesByGroup[groupKey]) {
          issuesByGroup[groupKey] = {
            epic: { key: groupKey, name: groupKey },
            issues: []
          };
        }
        issuesByGroup[groupKey].issues.push(issue);
      });
      break;

    case 'issue_type':
      // Group by issue type (Epic, Story, Task, Bug, etc.)
      const types = [...new Set(issues.map(i => i.issue_type || 'Unknown'))].sort();
      groups = types.map(type => ({ key: `type-${type}`, name: type, is_type: true }));

      types.forEach(type => {
        issuesByGroup[`type-${type}`] = {
          epic: { key: `type-${type}`, name: type, is_type: true },
          issues: []
        };
      });

      issues.forEach(issue => {
        const groupKey = `type-${issue.issue_type || 'Unknown'}`;
        issuesByGroup[groupKey].issues.push(issue);
      });
      break;

    case 'fix_version':
      // Group by fix version
      const versions = [...new Set(issues.map(i => i.fix_version || 'No Version'))].sort();
      groups = versions.map(v => ({ key: `version-${v}`, name: v, is_version: true }));

      versions.forEach(version => {
        issuesByGroup[`version-${version}`] = {
          epic: { key: `version-${version}`, name: version, is_version: true },
          issues: []
        };
      });

      issues.forEach(issue => {
        const groupKey = `version-${issue.fix_version || 'No Version'}`;
        issuesByGroup[groupKey].issues.push(issue);
      });
      break;

    case 'status':
      // Group by status
      const statuses = [...new Set(issues.map(i => i.status || 'Unknown'))].sort();
      groups = statuses.map(s => ({ key: `status-${s}`, name: s, is_status: true }));

      statuses.forEach(status => {
        issuesByGroup[`status-${status}`] = {
          epic: { key: `status-${status}`, name: status, is_status: true },
          issues: []
        };
      });

      issues.forEach(issue => {
        const groupKey = `status-${issue.status || 'Unknown'}`;
        issuesByGroup[groupKey].issues.push(issue);
      });
      break;

    case 'assignee':
      // Group by assignee
      const users = await getAll(STORES.USERS);
      const userMap = new Map(users.map(u => [u.account_id, u.display_name]));
      const assignees = [...new Set(issues.map(i => i.assignee_id || 'unassigned'))];
      groups = assignees.map(id => ({
        key: `assignee-${id || 'unassigned'}`,
        name: id ? (userMap.get(id) || 'Unassigned') : 'Unassigned',
        is_assignee: true
      }));

      assignees.forEach(assigneeId => {
        const key = `assignee-${assigneeId || 'unassigned'}`;
        issuesByGroup[key] = {
          epic: {
            key,
            name: assigneeId ? (userMap.get(assigneeId) || 'Unassigned') : 'Unassigned',
            is_assignee: true
          },
          issues: []
        };
      });

      issues.forEach(issue => {
        const groupKey = `assignee-${issue.assignee_id || 'unassigned'}`;
        issuesByGroup[groupKey].issues.push(issue);
      });
      break;

    default:
      // Default to epic grouping
      groups = [...epics];
      issuesByGroup['no-epic'] = {
        epic: { key: 'no-epic', name: 'Unsorted Issues' },
        issues: []
      };
      epics.forEach(epic => {
        issuesByGroup[epic.key] = { epic, issues: [] };
      });
      issues.forEach(issue => {
        const groupKey = issue.parent_key || 'no-epic';
        if (!issuesByGroup[groupKey]) {
          issuesByGroup[groupKey] = {
            epic: { key: groupKey, name: groupKey },
            issues: []
          };
        }
        issuesByGroup[groupKey].issues.push(issue);
      });
  }

  // Filter out empty groups
  const groupedData = Object.values(issuesByGroup).filter(group => group.issues.length > 0);

  console.log('[RoadmapData] Grouping by:', groupBy);
  console.log('[RoadmapData] Number of groups:', groupedData.length);
  groupedData.forEach(g => {
    console.log(`[RoadmapData] Group "${g.epic.name}": ${g.issues.length} issues`);
  });

  return {
    epics: groups,
    sprints,
    issues,
    groupedData,
    groupBy
  };
}
