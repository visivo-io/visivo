import * as duckdb from '@duckdb/duckdb-wasm';
import { withDeploymentRoot } from '../config/urls';

// The exception-handling (EH) build is the only one shipped. Every browser
// with WebAssembly exception handling runs it (Chrome and Edge 95+, Firefox
// 100+, Safari 15.2+). The MVP fallback doubled the bundle for browsers that
// cannot run the rest of the viewer either.
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

// Note: COI multi-threaded bundle disabled due to parquet extension compatibility issues
// The pthread workers have SharedArrayBuffer memory state mismatches when loading extensions

export const UNSUPPORTED_BROWSER_MESSAGE =
  'This browser cannot run DuckDB-WASM, which Visivo uses to query data in the page. ' +
  'Open it in a current version of Chrome, Edge, Firefox or Safari.';

/**
 * The EH bundle, mounted where this dist actually is.
 *
 * Vite bakes these in as `/assets/...`, which is the server root, not the
 * deployment root a dist is mounted at. Resolved per call, so it does not
 * depend on the bundle being evaluated after index.html's inline script.
 *
 * `window.duckdbFromCdn` (set by `visivo dist --duckdb-from-cdn`) loads the
 * same build from jsDelivr instead, pinned to the bundled package version.
 */
export const duckdbBundle = () => {
  if (typeof window !== 'undefined' && window.duckdbFromCdn) {
    const base = `https://cdn.jsdelivr.net/npm/${duckdb.PACKAGE_NAME}@${duckdb.PACKAGE_VERSION}/dist`;
    return {
      mainModule: `${base}/duckdb-eh.wasm`,
      mainWorker: `${base}/duckdb-browser-eh.worker.js`,
      crossOrigin: true,
    };
  }
  return {
    mainModule: withDeploymentRoot(duckdb_wasm),
    mainWorker: withDeploymentRoot(duckdb_worker),
    crossOrigin: false,
  };
};

// A Worker cannot be constructed from another origin, so a CDN worker starts
// from a same-origin blob that imports it.
const createWorker = bundle => {
  if (!bundle.crossOrigin) return new Worker(bundle.mainWorker);
  const blobUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  );
  const worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return worker;
};

/**
 * Initialize DuckDB with the EH bundle.
 *
 * Rejects with UNSUPPORTED_BROWSER_MESSAGE when the browser lacks
 * WebAssembly exception handling.
 *
 * @returns {duckdb.AsyncDuckDB}
 */
export const initDuckDB = async () => {
  const features = await duckdb.getPlatformFeatures();
  if (!features.wasmExceptions) {
    throw new Error(UNSUPPORTED_BROWSER_MESSAGE);
  }
  const bundle = duckdbBundle();
  const worker = createWorker(bundle);
  // Use VoidLogger to reduce console noise (use ConsoleLogger for debugging)
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
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
