/**
 * Simple IndexedDB Storage
 * Lightweight alternative to SQLite for browser storage
 */

const DB_NAME = 'jira-planner-db';
const DB_VERSION = 3;
const STORE_NAMES = {
  PROJECTS: 'projects',
  BOARDS: 'boards',
  SPRINTS: 'sprints',
  ISSUES: 'issues',
  USERS: 'users',
  TAGS: 'tags',
  VIEWS: 'views',
  METADATA: 'metadata'
};

let dbInstance = null;
let dbPromise = null;

/**
 * Open/initialize the database
 */
export async function initDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open:', request.error);
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[IndexedDB] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
        db.createObjectStore(STORE_NAMES.PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.BOARDS)) {
        db.createObjectStore(STORE_NAMES.BOARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.SPRINTS)) {
        db.createObjectStore(STORE_NAMES.SPRINTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.ISSUES)) {
        const issueStore = db.createObjectStore(STORES.ISSUES, { keyPath: 'key' });
        issueStore.createIndex('status', 'status', { unique: false });
        issueStore.createIndex('board_id', 'board_id', { unique: false });
        issueStore.createIndex('sprint_id', 'sprint_id', { unique: false });
        issueStore.createIndex('updated_at', 'updated_at', { unique: false });
        issueStore.createIndex('fix_version', 'fix_version', { unique: false });
        issueStore.createIndex('customer', 'customer', { unique: false });
        issueStore.createIndex('product', 'product', { unique: false });
        issueStore.createIndex('assignee_id', 'assignee_id', { unique: false });
        issueStore.createIndex('reporter_id', 'reporter_id', { unique: false });
        issueStore.createIndex('qa_tester_id', 'qa_tester_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.USERS)) {
        db.createObjectStore(STORE_NAMES.USERS, { keyPath: 'account_id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.TAGS)) {
        const tagStore = db.createObjectStore(STORE_NAMES.TAGS, { autoIncrement: true });
        tagStore.createIndex('issue_key', 'issue_key', { unique: false });
        tagStore.createIndex('tag_name', 'tag_name', { unique: false });
      }
      // Upgrade from version 2: add missing indexes
      if (event.oldVersion < 3 && db.objectStoreNames.contains(STORE_NAMES.ISSUES)) {
        const issueStore = db.transaction(STORE_NAMES.ISSUES, 'readwrite').objectStore(STORE_NAMES.ISSUES);
        if (!issueStore.indexNames.contains('qa_tester_id')) {
          issueStore.createIndex('qa_tester_id', 'qa_tester_id', { unique: false });
        }
      }
      if (event.oldVersion < 3 && db.objectStoreNames.contains(STORE_NAMES.TAGS)) {
        const tagStore = db.transaction(STORE_NAMES.TAGS, 'readwrite').objectStore(STORE_NAMES.TAGS);
        if (!tagStore.indexNames.contains('tag_name')) {
          tagStore.createIndex('tag_name', 'tag_name', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.VIEWS)) {
        db.createObjectStore(STORE_NAMES.VIEWS, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.METADATA)) {
        db.createObjectStore(STORE_NAMES.METADATA, { keyPath: 'key' });
      }

      console.log('[IndexedDB] Database schema created/upgraded');
    };
  });

  return dbPromise;
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

/**
 * Add or update a record
 */
export async function put(storeName, data) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Add or update multiple records
 */
export async function putBulk(storeName, dataList) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const data of dataList) {
      store.put(data);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.message));
  });
}

/**
 * Get a single record by key
 */
export async function get(storeName, key) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Get all records from a store
 */
export async function getAll(storeName) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Get records by index
 */
export async function getByIndex(storeName, indexName, value) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Get all records matching a filter function
 */
export async function getAllFiltered(storeName, filterFn) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.openCursor();

    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (filterFn(cursor.value)) {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Delete a record
 */
export async function del(storeName, key) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Clear a store
 */
export async function clear(storeName) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message));
  });
}

/**
 * Set metadata value
 */
export async function setMetadata(key, value) {
  return put(STORE_NAMES.METADATA, { key, value, updatedAt: new Date().toISOString() });
}

/**
 * Get metadata value
 */
export async function getMetadata(key) {
  const result = await get(STORE_NAMES.METADATA, key);
  return result?.value || null;
}
