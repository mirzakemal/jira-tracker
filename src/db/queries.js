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
  del
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
  const tags = await getAll(STORES.TAGS);
  const tagToDelete = tags.find(t => t.issue_key === issueKey && t.tag_name === tagName);
  if (tagToDelete) {
    await del(STORES.TAGS, tagToDelete.id);
    invalidateFilterCache(); // Tags changed, invalidate cache
  }
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
  const views = await getAll(STORES.VIEWS);
  return views.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Delete a saved view
 */
export async function deleteView(id) {
  await initDatabase();
  await del(STORES.VIEWS, id);
}
