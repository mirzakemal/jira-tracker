/**
 * SQLite Database Initialization and Connection
 * Uses sql.js (SQLite compiled to WebAssembly) with IndexedDB persistence
 */

import initSqlJs from 'sql.js';
import { getAllTables, getAllIndexes, SCHEMA_VERSION } from './schema.js';

const DB_NAME = 'jira-planner-db';
const DB_VERSION = 1;

let dbInstance = null;
let dbPromise = null;
let initError = null;

/**
 * Initialize the SQLite database
 * Loads from IndexedDB if available, otherwise creates new
 */
export async function initDatabase() {
  if (dbPromise) return dbPromise;
  if (initError) throw initError;

  dbPromise = (async () => {
    try {
      // Initialize sql.js with CDN-hosted WASM
      const SQL = await initSqlJs({
        locateFile: file => {
          if (file === 'sql-wasm.wasm') {
            return 'https://sql.js.org/dist/sql-wasm.wasm';
          }
          return `https://sql.js.org/dist/${file}`;
        }
      });

      // Try to load existing database from IndexedDB
      let savedDb = null;
      try {
        savedDb = await loadFromIndexedDB();
      } catch (loadError) {
        console.warn('[SQLite] Could not load from IndexedDB:', loadError.message);
      }

      if (savedDb) {
        dbInstance = new SQL.Database(savedDb);
        console.log('[SQLite] Loaded database from IndexedDB');
      } else {
        dbInstance = new SQL.Database();
        console.log('[SQLite] Created new database');

        // Run migrations
        await runMigrations();
      }

      // Verify schema version
      await verifySchemaVersion();

      return dbInstance;
    } catch (error) {
      console.error('[SQLite] Failed to initialize database:', error);
      initError = error;
      throw error;
    }
  })();

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
 * Run database migrations
 */
async function runMigrations() {
  if (!dbInstance) return;

  // Create all tables
  for (const tableSql of getAllTables()) {
    dbInstance.run(tableSql);
  }

  // Create all indexes
  for (const indexSql of getAllIndexes()) {
    dbInstance.run(indexSql);
  }

  // Set schema version
  dbInstance.run(
    `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
     VALUES ('schema_version', ?, CURRENT_TIMESTAMP)`,
    [String(SCHEMA_VERSION)]
  );

  // Save to IndexedDB
  await saveToIndexedDB();

  console.log('[SQLite] Migrations completed');
}

/**
 * Verify schema version and run migrations if needed
 */
async function verifySchemaVersion() {
  if (!dbInstance) return;

  try {
    const stmt = dbInstance.prepare(
      'SELECT value FROM sync_metadata WHERE key = ?'
    );
    stmt.bind(['schema_version']);

    let currentVersion = 0;
    if (stmt.step()) {
      currentVersion = parseInt(stmt.get()[0], 10) || 0;
    }
    stmt.free();

    if (currentVersion < SCHEMA_VERSION) {
      console.log(`[SQLite] Schema version upgrade: ${currentVersion} -> ${SCHEMA_VERSION}`);
      await runMigrations();
    }
  } catch (error) {
    // Table might not exist yet, run migrations
    await runMigrations();
  }
}

/**
 * Save database to IndexedDB
 */
export async function saveToIndexedDB() {
  if (!dbInstance) return;

  try {
    const data = dbInstance.export();
    // data is already a Uint8Array, no need to convert with Buffer
    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('database')) {
          db.createObjectStore('database', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['database'], 'readwrite');
        const store = transaction.objectStore('database');
        store.put({ id: 'main', data: buffer, timestamp: Date.now() });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[SQLite] Failed to save to IndexedDB:', error);
    throw error;
  }
}

/**
 * Load database from IndexedDB
 */
async function loadFromIndexedDB() {
  try {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('database')) {
          db.createObjectStore('database', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['database'], 'readonly');
        const store = transaction.objectStore('database');
        const getRequest = store.get('main');

        getRequest.onsuccess = () => {
          const result = getRequest.result;
          resolve(result?.data ? new Uint8Array(result.data) : null);
        };

        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  } catch (error) {
    console.error('[SQLite] Failed to load from IndexedDB:', error);
    return null;
  }
}

/**
 * Execute a query and return results
 */
export function query(sql, params = []) {
  const db = getDatabase();

  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return results;
  } catch (error) {
    console.error('[SQLite] Query failed:', sql, error);
    throw error;
  }
}

/**
 * Execute a write operation (INSERT, UPDATE, DELETE)
 */
export function execute(sql, params = []) {
  const db = getDatabase();

  try {
    db.run(sql, params);
    return true;
  } catch (error) {
    console.error('[SQLite] Execute failed:', sql, error);
    throw error;
  }
}

/**
 * Execute multiple statements in a transaction
 */
export function transaction(operations) {
  const db = getDatabase();

  try {
    db.run('BEGIN TRANSACTION');
    operations();
    db.run('COMMIT');

    // Save to IndexedDB after successful transaction
    saveToIndexedDB();

    return true;
  } catch (error) {
    db.run('ROLLBACK');
    console.error('[SQLite] Transaction failed:', error);
    throw error;
  }
}

/**
 * Sync database to IndexedDB after batch operations
 */
export async function sync() {
  await saveToIndexedDB();
}

/**
 * Clear all data from the database (for testing or reset)
 */
export async function clearDatabase() {
  if (!dbInstance) return;

  // Drop all tables
  const tables = ['issue_tags', 'saved_views', 'issues', 'sprints', 'boards', 'projects', 'users', 'sync_metadata'];
  for (const table of tables) {
    try {
      dbInstance.run(`DROP TABLE IF EXISTS ${table}`);
    } catch (e) {
      // Table might not exist
    }
  }

  // Recreate schema
  await runMigrations();

  console.log('[SQLite] Database cleared');
}
