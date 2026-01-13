import * as duckdb from '@duckdb/duckdb-wasm';

// MVP bundle (fallback for older browsers)
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

// EH bundle (exception handling, single-threaded but stable)
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

// Note: COI multi-threaded bundle disabled due to parquet extension compatibility issues
// The pthread workers have SharedArrayBuffer memory state mismatches when loading extensions

const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_next,
    mainWorker: duckdb_worker,
  },
};

/**
 * Initialize DuckDB with the best available bundle.
 * - EH bundle: Single-threaded with exception handling (preferred)
 * - MVP bundle: Fallback for older browsers
 *
 * @returns {duckdb.AsyncDuckDB}
 */
export const initDuckDB = async () => {
  const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  // Use VoidLogger to reduce console noise (use ConsoleLogger for debugging)
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
};

export const getTempFilename = () => {
  const timestamp = Date.now().toString();
  const randomString = Math.random().toString(36).substring(2);
  return `file-${timestamp}-${randomString}`;
};

// Persistent connection management
let persistentConnection = null;
let connectionDb = null;

/**
 * Get or create a persistent connection to DuckDB.
 * Reuses the same connection across all queries to eliminate connect/close overhead.
 *
 * @param {duckdb.AsyncDuckDB} db - DuckDB instance
 * @returns {Promise<duckdb.AsyncDuckDBConnection>}
 */
export const getConnection = async db => {
  // If db instance changed (rare), reset connection
  if (connectionDb !== db) {
    if (persistentConnection) {
      try {
        await persistentConnection.close();
      } catch {
        // Ignore close errors
      }
    }
    persistentConnection = null;
    connectionDb = db;
  }

  if (!persistentConnection) {
    persistentConnection = await db.connect();
  }
  return persistentConnection;
};

/**
 * Close the persistent connection. Call on cleanup/unmount.
 */
export const closeConnection = async () => {
  if (persistentConnection) {
    try {
      await persistentConnection.close();
    } catch {
      // Ignore close errors
    }
    persistentConnection = null;
    connectionDb = null;
  }
};
