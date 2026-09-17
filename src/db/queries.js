/**
 * Query helpers over the IndexedDB cache.
 *
 * This module used to carry every view's data access — roadmap, velocity,
 * workload, dashboards. Those views are gone, and their queries went with
 * them. What remains is shared plumbing: single-issue lookup, local tags,
 * project list, quick search, the sync changelog, and issue links. View-
 * specific queries live beside their views (product-queries.js, radar-
 * queries.js, ...).
 */

import {
  initDatabase,
  getAll,
  getByIndex,
  get,
  put,
  getDatabase,
  STORE_NAMES as STORES
} from './indexeddb.js';

/**
 * One issue by key, with its local tags attached.
 *
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export async function getIssueByKey(key) {
  await initDatabase();
  const issue = await get(STORES.ISSUES, key);
  if (issue) {
    issue.tags = await getTags(key);
  }
  return issue || null;
}

/** Every cached project. */
export function getAllProjects() {
  return initDatabase().then(() => getAll(STORES.PROJECTS));
}

// ==================== Local tags ====================
//
// Tags live only in this browser's cache — they are never written to Jira.
// The Product Radar's triage chips (reviewed / needs decision / parked) are
// stored as tags too, under a `triage:` prefix.

/**
 * Attach a tag to an issue. No-op if already present.
 *
 * @param {string} issueKey
 * @param {string} tagName
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
  }
}

/**
 * Remove a tag from an issue. Resolves whether or not it was present.
 *
 * @param {string} issueKey
 * @param {string} tagName
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

    tx.oncomplete = () => {
      if (deleted) resolve();
    };
    tx.onerror = () => reject(new Error(tx.error?.message));

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.tag_name === tagName) {
          cursor.delete();
          deleted = true;
        }
        cursor.continue();
      } else if (!deleted) {
        resolve();
      }
    };
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Tags on one issue.
 *
 * @param {string} issueKey
 * @returns {Promise<string[]>}
 */
export async function getTags(issueKey) {
  await initDatabase();
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TAGS, 'readonly');
    const store = tx.objectStore(STORES.TAGS);
    const index = store.index('issue_key');
    const request = index.openCursor(IDBKeyRange.only(issueKey));

    const tags = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        tags.push(cursor.value.tag_name);
        cursor.continue();
      } else {
        resolve(tags);
      }
    };
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Every distinct tag name, sorted.
 *
 * @returns {Promise<string[]>}
 */
export async function getAllTags() {
  await initDatabase();
  const tags = await getAll(STORES.TAGS);
  return [...new Set(tags.map(t => t.tag_name))].sort();
}

/**
 * Issues carrying a tag.
 *
 * @param {string} tagName
 * @returns {Promise<object[]>}
 */
export async function getIssuesByTag(tagName) {
  await initDatabase();
  const tags = await getByIndex(STORES.TAGS, 'tag_name', tagName);
  const issueKeys = new Set(tags.map(t => t.issue_key));

  const issues = await getAll(STORES.ISSUES);
  return issues.filter(i => issueKeys.has(i.key));
}

/**
 * Tags for many issues in one read.
 *
 * @param {string[]} issueKeys
 * @returns {Promise<Record<string, string[]>>} issue key → tag names
 */
export async function getTagsForIssues(issueKeys) {
  await initDatabase();
  const wanted = new Set(issueKeys);
  const tags = await getAll(STORES.TAGS);
  const tagsByIssue = {};

  for (const tag of tags) {
    if (!wanted.has(tag.issue_key)) continue;
    const list = (tagsByIssue[tag.issue_key] ||= []);
    if (!list.includes(tag.tag_name)) list.push(tag.tag_name);
  }

  return tagsByIssue;
}

// ==================== Quick search ====================

/**
 * Search issues by key or summary. Up to 20 results, best match first.
 *
 * @param {string} [query]
 * @returns {Promise<object[]>}
 */
export async function searchIssues(query = '') {
  await initDatabase();
  const all = await getAll(STORES.ISSUES);
  if (!query || !query.trim()) return [];

  const q = query.toLowerCase().trim();

  return all
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
}

// ==================== Sync changelog ====================

/**
 * What the most recent sync changed, grouped by issue key.
 *
 * @returns {Promise<object[]>}
 */
export async function getLatestChangelog() {
  await initDatabase();
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CHANGELOG, 'readonly');
    const store = tx.objectStore(STORES.CHANGELOG);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result || [];
      entries.sort((a, b) => {
        if (a.issue_key < b.issue_key) return -1;
        if (a.issue_key > b.issue_key) return 1;
        return 0;
      });
      resolve(entries);
    };
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

// ==================== Issue links ====================

/**
 * Every link touching an issue, in either direction.
 *
 * @param {string} issueKey
 * @param {object} [options]
 * @param {IDBDatabase} [options.db] - reuse an open handle
 * @returns {Promise<object[]>}
 */
export async function getIssueLinks(issueKey, options = {}) {
  let db = options.db;
  if (!db) {
    await initDatabase();
    db = getDatabase();
  }

  // NOTE: this function does NOT close the connection. getDatabase() returns
  // the module-level singleton from indexeddb.js, which we did not open;
  // closing it left indexeddb.js caching a dead handle, so every later read
  // threw InvalidStateError until a page reload. indexeddb.js owns that
  // lifecycle. (Prefer getByIndex for new code — see product-queries.js.)
  const links = [];
  const store = db.transaction([STORES.ISSUELINKS], 'readonly').objectStore(STORES.ISSUELINKS);
  const sourceIdx = store.index('source_key');
  const targetIdx = store.index('target_key');

  const getCursor = (index, key) => new Promise((resolve) => {
    const cursorReq = index.openCursor(IDBKeyRange.only(key));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        links.push(cursor.value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => resolve();
  });

  await getCursor(sourceIdx, issueKey);
  await getCursor(targetIdx, issueKey);
  return links;
}
