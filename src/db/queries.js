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
  priorities: null,
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
    issueTypes: null,
    customers: null,
    products: null,
    users: null,
    tags: null,
    priorities: null,
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

  // Use the most selective index if available (only for single values)
  // For multi-select filters, get all issues and filter in JavaScript
  if (filters.status && filters.status.length === 1) {
    // Single status filter - use status index
    issues = await getByIndex(STORES.ISSUES, 'status', filters.status[0]);
  } else if (filters.fixVersion && (!Array.isArray(filters.fixVersion) || filters.fixVersion.length === 1)) {
    const fixVersionValue = Array.isArray(filters.fixVersion) ? filters.fixVersion[0] : filters.fixVersion;
    issues = await getByIndex(STORES.ISSUES, 'fix_version', fixVersionValue);
  } else if (filters.customer && (!Array.isArray(filters.customer) || filters.customer.length === 1)) {
    const customerValue = Array.isArray(filters.customer) ? filters.customer[0] : filters.customer;
    issues = await getByIndex(STORES.ISSUES, 'customer', customerValue);
  } else if (filters.product && (!Array.isArray(filters.product) || filters.product.length === 1)) {
    const productValue = Array.isArray(filters.product) ? filters.product[0] : filters.product;
    issues = await getByIndex(STORES.ISSUES, 'product', productValue);
  } else if (filters.assigneeId && (!Array.isArray(filters.assigneeId) || filters.assigneeId.length === 1)) {
    const assigneeIdValue = Array.isArray(filters.assigneeId) ? filters.assigneeId[0] : filters.assigneeId;
    issues = await getByIndex(STORES.ISSUES, 'assignee_id', assigneeIdValue);
  } else if (filters.reporterId && (!Array.isArray(filters.reporterId) || filters.reporterId.length === 1)) {
    const reporterIdValue = Array.isArray(filters.reporterId) ? filters.reporterId[0] : filters.reporterId;
    issues = await getByIndex(STORES.ISSUES, 'reporter_id', reporterIdValue);
  } else if (filters.qaTesterId && (!Array.isArray(filters.qaTesterId) || filters.qaTesterId.length === 1)) {
    const qaTesterIdValue = Array.isArray(filters.qaTesterId) ? filters.qaTesterId[0] : filters.qaTesterId;
    issues = await getByIndex(STORES.ISSUES, 'qa_tester_id', qaTesterIdValue);
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

    // Multi-select fixVersion filter
    if (filters.fixVersion && Array.isArray(filters.fixVersion) && filters.fixVersion.length > 0) {
      if (!filters.fixVersion.includes(issue.fix_version)) return false;
    }

    // Multi-select customer filter
    if (filters.customer && Array.isArray(filters.customer) && filters.customer.length > 0) {
      const issueCustomers = issue.customer?.split(',').map(c => c.trim()) || [];
      if (!filters.customer.some(c => issueCustomers.includes(c))) return false;
    }

    // Multi-select product filter
    if (filters.product && Array.isArray(filters.product) && filters.product.length > 0) {
      if (!filters.product.includes(issue.product)) return false;
    }

    // Multi-select assignee filter
    if (filters.assigneeId && Array.isArray(filters.assigneeId) && filters.assigneeId.length > 0) {
      if (!filters.assigneeId.includes(issue.assignee_id)) return false;
    }

    // Multi-select reporter filter
    if (filters.reporterId && Array.isArray(filters.reporterId) && filters.reporterId.length > 0) {
      if (!filters.reporterId.includes(issue.reporter_id)) return false;
    }

    // Multi-select qaTester filter
    if (filters.qaTesterId && Array.isArray(filters.qaTesterId) && filters.qaTesterId.length > 0) {
      if (!filters.qaTesterId.includes(issue.qa_tester_id)) return false;
    }

    // Multi-select codeReviewer1 filter
    if (filters.codeReviewer1Id && Array.isArray(filters.codeReviewer1Id) && filters.codeReviewer1Id.length > 0) {
      if (!filters.codeReviewer1Id.includes(issue.code_reviewer_1_id)) return false;
    }

    // Multi-select codeReviewer2 filter
    if (filters.codeReviewer2Id && Array.isArray(filters.codeReviewer2Id) && filters.codeReviewer2Id.length > 0) {
      if (!filters.codeReviewer2Id.includes(issue.code_reviewer_2_id)) return false;
    }

    // Multi-select issueType filter
    if (filters.issueType && Array.isArray(filters.issueType) && filters.issueType.length > 0) {
      if (!filters.issueType.includes(issue.issue_type)) return false;
    }

    // Multi-select priority filter
    if (filters.priority && Array.isArray(filters.priority) && filters.priority.length > 0) {
      if (!filters.priority.includes(issue.priority)) return false;
    }

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
    qa_tester_name: issue.qa_tester_id ? (userMap.get(issue.qa_tester_id) || null) : null,
    code_reviewer_1_name: issue.code_reviewer_1_id ? (userMap.get(issue.code_reviewer_1_id) || null) : null,
    code_reviewer_2_name: issue.code_reviewer_2_id ? (userMap.get(issue.code_reviewer_2_id) || null) : null
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

    if (filters.tag && Array.isArray(filters.tag) && filters.tag.length > 0) {
      // Multi-select tag filter - OR logic
      if (!filters.tag.some(t => tags.includes(t))) return false;
    } else if (filters.tag && !Array.isArray(filters.tag)) {
      // Legacy single tag filter
      if (!tags.includes(filters.tag)) return false;
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
 * Get all issue types (Card Types) - uses cache
 */
export async function getIssueTypes(projectKey = null) {
  if (isCacheValid() && filterOptionsCache.issueTypes !== null) {
    return filterOptionsCache.issueTypes;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const types = [...new Set(
    issues
      .filter(i => i.issue_type && (!projectKey || i.project_key === projectKey))
      .map(i => i.issue_type)
  )].sort();

  filterOptionsCache.issueTypes = types;
  filterOptionsCache.timestamp = Date.now();
  return types;
}

/**
 * Get all issue priorities - uses cache
 */
export async function getPriorities() {
  if (isCacheValid() && filterOptionsCache.priorities !== null) {
    return filterOptionsCache.priorities;
  }

  await initDatabase();
  const issues = await getAll(STORES.ISSUES);
  const priorities = [...new Set(
    issues
      .filter(i => i.priority)
      .map(i => i.priority)
  )].sort();

  filterOptionsCache.priorities = priorities;
  filterOptionsCache.timestamp = Date.now();
  return priorities;
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
 * Get issue aging report — days in current status
 * Sorted by staleness (oldest first)
 */
export async function getIssueAging(filters = {}) {
  await initDatabase();
  let issues = await getAll(STORES.ISSUES);

  if (filters.boardId) {
    issues = issues.filter(i => i.board_id === filters.boardId);
  }
  if (filters.sprintId) {
    issues = issues.filter(i => i.sprint_id === filters.sprintId);
  }

  const now = new Date();
  const aged = issues.map(issue => {
    const updated = issue.updated_at ? new Date(issue.updated_at) : null;
    const daysInStatus = updated
      ? Math.max(0, Math.floor((now - updated) / (1000 * 60 * 60 * 24)))
      : null;
    return { ...issue, daysInStatus };
  });

  aged.sort((a, b) => {
    if (a.daysInStatus === null && b.daysInStatus === null) return 0;
    if (a.daysInStatus === null) return 1;
    if (b.daysInStatus === null) return -1;
    return b.daysInStatus - a.daysInStatus;
  });

  return aged;
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

/**
 * Search issues by key or summary (fuzzy matching)
 * Returns max 20 results sorted by relevance
 */
export async function searchIssues(query = '') {
  await initDatabase();
  const all = await getAll(STORES.ISSUES);
  if (!query || !query.trim()) return [];

  const q = query.toLowerCase().trim();

  const scored = all
    .map(issue => {
      let score = 0;
      const key = (issue.key || '').toLowerCase();
      const summary = (issue.summary || '').toLowerCase();

      if (key === q) score = 100;
      else if (key.startsWith(q)) score = 80;
      else if (key.includes(q)) score = 60;

      if (summary === q) score += 50;
      else if (summary.startsWith(q)) score += 30;
      else if (summary.includes(q)) score += 10;

      return { issue, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => s.issue);

  return scored;
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

  // Calculate date range (default: today to next 3 months)
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

    // Include issue if any date field is in range
    if (hasStartInRange || hasDueInRange || hasEndInRange) {
      // Apply other filters
      if (filters.projectKey && issue.project_key !== filters.projectKey) return false;
      if (filters.status && filters.status.length > 0 && !filters.status.includes(issue.status)) return false;
      if (filters.fixVersion && Array.isArray(filters.fixVersion) && filters.fixVersion.length > 0) {
        if (!filters.fixVersion.includes(issue.fix_version)) return false;
      }
      if (filters.customer && Array.isArray(filters.customer) && filters.customer.length > 0) {
        const issueCustomers = issue.customer?.split(',').map(c => c.trim()) || [];
        if (!filters.customer.some(c => issueCustomers.includes(c))) return false;
      }
      if (filters.product && Array.isArray(filters.product) && filters.product.length > 0) {
        if (!filters.product.includes(issue.product)) return false;
      }
      if (filters.assigneeId && Array.isArray(filters.assigneeId) && filters.assigneeId.length > 0) {
        if (!filters.assigneeId.includes(issue.assignee_id)) return false;
      }
      if (filters.tag && Array.isArray(filters.tag) && filters.tag.length > 0) {
        const issueTags = filters.issueTags?.[issue.key] || [];
        if (!filters.tag.some(t => issueTags.includes(t))) return false;
      } else if (filters.tag && !Array.isArray(filters.tag)) {
        const issueTags = filters.issueTags?.[issue.key] || [];
        if (!issueTags.includes(filters.tag)) return false;
      }
      return true;
    }

    // Also include issues with sprint_id (to show issues in sprints)
    if (issue.sprint_id) {
      if (filters.projectKey && issue.project_key !== filters.projectKey) return false;
      if (filters.status && filters.status.length > 0 && !filters.status.includes(issue.status)) return false;
      if (filters.fixVersion && Array.isArray(filters.fixVersion) && filters.fixVersion.length > 0) {
        if (!filters.fixVersion.includes(issue.fix_version)) return false;
      }
      if (filters.customer && Array.isArray(filters.customer) && filters.customer.length > 0) {
        const issueCustomers = issue.customer?.split(',').map(c => c.trim()) || [];
        if (!filters.customer.some(c => issueCustomers.includes(c))) return false;
      }
      if (filters.product && Array.isArray(filters.product) && filters.product.length > 0) {
        if (!filters.product.includes(issue.product)) return false;
      }
      if (filters.assigneeId && Array.isArray(filters.assigneeId) && filters.assigneeId.length > 0) {
        if (!filters.assigneeId.includes(issue.assignee_id)) return false;
      }
      if (filters.tag && Array.isArray(filters.tag) && filters.tag.length > 0) {
        const issueTags = filters.issueTags?.[issue.key] || [];
        if (!filters.tag.some(t => issueTags.includes(t))) return false;
      } else if (filters.tag && !Array.isArray(filters.tag)) {
        const issueTags = filters.issueTags?.[issue.key] || [];
        if (!issueTags.includes(filters.tag)) return false;
      }
      return true;
    }

    return false;
  });

  // Load users for enrichment (fallback if assignee_name not stored)
  const users = await getAll(STORES.USERS);
  const userMap = new Map(users.map(u => [u.account_id, u.display_name]));

  // Enrich issues with user names (use stored name or lookup from users store)
  const enrichedIssues = filteredIssues.map(issue => ({
    ...issue,
    assignee_name: issue.assignee_name || (issue.assignee_id ? (userMap.get(issue.assignee_id) || issue.assignee_id || 'Unassigned') : 'Unassigned'),
    reporter_name: issue.reporter_name || (issue.reporter_id ? (userMap.get(issue.reporter_id) || issue.reporter_id || 'Unknown') : 'Unknown'),
    qa_tester_name: issue.qa_tester_name || (issue.qa_tester_id ? (userMap.get(issue.qa_tester_id) || issue.qa_tester_id || null) : null)
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
    const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
    return dateA - dateB;
  });
}

/**
 * Get issues grouped by parent/epic for roadmap swimlanes
 */
export async function getRoadmapData(filters = {}) {
  const issues = await getRoadmapIssues(filters);
  const sprints = await getSprintsInDateRange(filters.startDate, filters.endDate);

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
      // Group by assignee - use assignee_name from enriched issues
      // Build a map of assignee_id to assignee_name
      const assigneeMap = new Map();
      issues.forEach(issue => {
        const id = issue.assignee_id || 'unassigned';
        const name = issue.assignee_name || 'Unassigned';
        assigneeMap.set(id, name);
      });

      const uniqueAssigneeIds = [...new Set(issues.map(i => i.assignee_id || 'unassigned'))];
      groups = uniqueAssigneeIds.map(id => ({
        key: `assignee-${id}`,
        name: assigneeMap.get(id),
        is_assignee: true
      }));

      uniqueAssigneeIds.forEach(assigneeId => {
        const key = `assignee-${assigneeId}`;
        issuesByGroup[key] = {
          epic: {
            key,
            name: assigneeMap.get(assigneeId),
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

  return {
    epics: groups,
    sprints,
    issues,
    groupedData,
    groupBy
  };
}

/**
 * Get sprint velocity data for retrospective dashboard
 * Returns past sprints with completion metrics
 */
export async function getSprintVelocity(boardId = null) {
  await initDatabase();
  const [sprints, issues, users] = await Promise.all([
    getAll(STORES.SPRINTS),
    getAll(STORES.ISSUES),
    getAll(STORES.USERS)
  ]);

  let targetSprints = sprints;
  if (boardId) {
    targetSprints = sprints.filter(s => s.board_id === boardId);
  }

  // Build user name map
  const userMap = new Map(users.map(u => [u.account_id, u.display_name]));

  const sprintData = targetSprints
    .map(sprint => {
      const sprintIssues = issues.filter(i => i.sprint_id === sprint.id);
      const total = sprintIssues.length;
      const completed = sprintIssues.filter(i => {
        const sc = (i.status_category || '').toLowerCase();
        return sc.includes('done') || sc.includes('closed') || sc.includes('resolved');
      }).length;

      // Completion rate as percentage
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Assignee breakdown
      const assigneeMap = new Map();
      sprintIssues.forEach(i => {
        const name = i.assignee_id ? (userMap.get(i.assignee_id) || i.assignee_name || 'Unassigned') : 'Unassigned';
        const done = (i.status_category || '').toLowerCase();
        const isDone = done.includes('done') || done.includes('closed') || done.includes('resolved');
        if (!assigneeMap.has(name)) {
          assigneeMap.set(name, { total: 0, completed: 0 });
        }
        const entry = assigneeMap.get(name);
        entry.total++;
        if (isDone) entry.completed++;
      });

      const assignees = Array.from(assigneeMap.entries())
        .map(([name, counts]) => ({ name, ...counts }))
        .sort((a, b) => b.total - a.total);

      return {
        id: sprint.id,
        name: sprint.name,
        state: sprint.state || 'unknown',
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        total,
        completed,
        rate,
        assignees
      };
    })
    .filter(s => s.total > 0)
    .sort((a, b) => {
      const ad = a.start_date ? new Date(a.start_date) : new Date(0);
      const bd = b.start_date ? new Date(b.start_date) : new Date(0);
      return bd - ad;
    });

  const allCompleted = sprintData.reduce((sum, s) => sum + s.completed, 0);
  const allTotal = sprintData.reduce((sum, s) => sum + s.total, 0);
  const averageVelocity = sprintData.length > 0
    ? Math.round(allCompleted / sprintData.length)
    : 0;
  const overallRate = allTotal > 0 ? Math.round((allCompleted / allTotal) * 100) : 0;

  return {
    sprints: sprintData,
    summary: {
      totalSprints: sprintData.length,
      totalIssues: allTotal,
      totalCompleted: allCompleted,
      averageVelocity,
      overallRate
    }
  };
}

/**
 * Get team workload heatmap data
 */
export async function getTeamWorkload(filters = {}) {
  await initDatabase();
  const [issues, users] = await Promise.all([
    getAll(STORES.ISSUES),
    getAll(STORES.USERS)
  ]);

  let filtered = issues;
  if (filters.boardId) {
    filtered = filtered.filter(i => i.board_id === filters.boardId);
  }
  if (filters.sprintId) {
    filtered = filtered.filter(i => i.sprint_id === filters.sprintId);
  }

  const userMap = new Map(users.map(u => [u.account_id, u.display_name]));

  const workload = new Map();
  filtered.forEach(issue => {
    const assigneeId = issue.assignee_id || 'unassigned';
    const assigneeName = issue.assignee_name || userMap.get(assigneeId) || 'Unassigned';
    if (!workload.has(assigneeId)) {
      workload.set(assigneeId, {
        id: assigneeId,
        name: assigneeName,
        statuses: new Map(),
        total: 0
      });
    }
    const person = workload.get(assigneeId);
    const status = issue.status || 'Unknown';
    if (!person.statuses.has(status)) {
      person.statuses.set(status, { count: 0, issues: [] });
    }
    person.statuses.get(status).count++;
    person.statuses.get(status).issues.push({
      key: issue.key,
      summary: issue.summary,
      priority: issue.priority,
      issue_type: issue.issue_type
    });
    person.total++;
  });

  const result = Array.from(workload.values())
    .map(p => ({
      ...p,
      statuses: Array.from(p.statuses.entries())
        .map(([status, data]) => ({ status, ...data }))
        .sort((a, b) => b.count - a.count)
    }))
    .sort((a, b) => b.total - a.total);

  const allStatuses = [...new Set(filtered.map(i => i.status).filter(Boolean))].sort();

  return {
    people: result,
    statuses: allStatuses,
    totalIssues: filtered.length
  };
}
