import { getTempFilename, getConnection } from './duckdb';
import { getParquetCache } from './parquetCache';

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} retries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in ms, doubles each retry (default: 50)
 */
export const withRetry = async (fn, retries = 3, initialDelay = 50) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        // Exponential backoff: 50ms, 100ms, 200ms, 400ms...
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
};

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} sql
 * @returns {Promise}
 */
export const runDuckDBQuery = async (db, sql, retries = 1, delay = 500) => {
  return withRetry(
    async () => {
      const conn = await getConnection(db);
      const arrow = await conn.query(sql);
      return arrow;
    },
    retries,
    delay
  );
};

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {File} file
 * @param {string} tableName
 * @returns {Promise}
 */
export const insertDuckDBFile = async (db, file, tableName) => {
  tableName = tableName || file.name; // fallback if no tableName provided
  const filename = file.name.toLowerCase();
  const extension = filename.split('.').at(-1);

  switch (extension) {
    case 'json':
      await _insertJSON(db, file, tableName);
      return;
    case 'parquet':
      await _insertParquet(db, file, tableName);
      return;
    default:
    // Unsupported file extension
  }
};

const _insertJSON = async (db, file, tableName) => {
  const text = await file.text();

  const tempFile = getTempFilename() + '.json';
  await db.registerFileText(tempFile, text);

  const conn = await getConnection(db);
  await conn.query(`
    CREATE TABLE "${tableName}" AS
    SELECT * FROM read_json_auto('${tempFile}')
  `);

  await db.dropFile(tempFile);
};

const _insertParquet = async (db, file, tableName) => {
  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  const tempFile = getTempFilename() + '.parquet';
  await db.registerFileBuffer(tempFile, uint8Array);

  const conn = await getConnection(db);
  await conn.query(`
    CREATE TABLE "${tableName}" AS
    SELECT * FROM read_parquet('${tempFile}')
  `);

  await db.dropFile(tempFile);
};

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
export const tableDuckDBExists = async (db, tableName) => {
  const result = await runDuckDBQuery(
    db,
    `SELECT COUNT(*) AS cnt 
     FROM information_schema.tables 
     WHERE table_name = '${tableName}'`
  );

  const cnt = result.getChild('cnt')?.get(0) ?? 0;
  return cnt > 0;
};

/**
 * Prepare post query by replacing input placeholders with actual values using template literals
 *
 * Uses JavaScript template literal evaluation to inject input values.
 * Supports both flat values (legacy) and nested accessor objects:
 * - Flat: { inputName: 'value' } - for ${inputName}
 * - Nested: { inputName: { value: "'quoted'" } } - for ${inputName.value}
 *
 * Null accessor values are injected as SQL NULL keyword (not the string 'NULL').
 * This causes queries with null accessors to return no rows, matching PRD behavior.
 *
 * @param {Object} insight - Insight object with query containing ${inputName} or ${inputName.accessor} placeholders
 * @param {Object} inputs - Object mapping input names to their values (string or accessor object)
 * @returns {String} - Query with all placeholders replaced by actual values
 */
export const prepPostQuery = (insight, inputs) => {
  const query = insight.query;

  if (!query) {
    return '';
  }

  try {
    // Extract input keys and values
    const inputKeys = Object.keys(inputs || {});
    const inputValues = Object.values(inputs || {});

    // Keep objects as-is for accessor syntax (${input.value}), convert primitives to strings
    // This allows template literals like ${region.value} to work with nested objects
    // For null values in accessor objects, keep them as null - they'll become 'undefined'
    // in the template literal output, which we'll then replace with SQL NULL keyword
    const processedValues = inputValues.map(value => {
      if (value === null || value === undefined) {
        return 'NULL';
      }
      if (typeof value === 'object') {
        // For accessor objects, keep null values as-is (don't convert to string 'NULL')
        // They will output 'undefined' in template literal which we replace with NULL below
        return value;
      }
      return String(value);
    });

    // Create a function that evaluates the query as a template literal
    // This safely injects values without regex manipulation
    // eslint-disable-next-line no-new-func
    const templateFunc = new Function(...inputKeys, `return \`${query}\`;`);

    // Execute the template function with the input values
    let result = templateFunc(...processedValues);

    // Replace 'null' (from null accessor values in JS) with SQL NULL keyword
    // This ensures null accessors inject NULL without quotes (not the string 'NULL')
    result = result.replace(/\bnull\b/g, 'NULL');

    return result;
  } catch (error) {
    throw new Error(`Query preparation failed: ${error.message}`);
  }
};

/**
 * Load parquet file from URL and register it in DuckDB with caching
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} url - URL to fetch the parquet file from
 * @param {string} nameHash - Name hash to use as table name
 * @param {boolean} force - Force reload even if cached (default: false)
 * @returns {Promise<void>}
 */
export const loadParquetFromURL = async (db, url, nameHash, force = false) => {
  const cache = getParquetCache();

  // ALWAYS verify table exists in DuckDB - don't trust in-memory cache alone
  // The cache can become stale if DuckDB instance is re-initialized
  if (!force && (await tableDuckDBExists(db, nameHash))) {
    cache.markLoaded(nameHash);
    return;
  }

  // Clear stale cache entry if table doesn't exist but cache thought it was loaded
  if (cache.isLoaded(nameHash)) {
    cache.clearLoaded(nameHash);
  }

  // Use cache to prevent duplicate concurrent fetches
  return cache.getOrFetch(nameHash, async () => {
    // Fetch the parquet file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch parquet file: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Register file in DuckDB
    const tempFile = getTempFilename() + '.parquet';
    await db.registerFileBuffer(tempFile, uint8Array);

    // Create table from parquet file using name_hash as table name
    const conn = await getConnection(db);

    // Drop existing table if forcing reload
    if (force) {
      await conn.query(`DROP TABLE IF EXISTS "${nameHash}"`);
    }

    await conn.query(`
      CREATE TABLE "${nameHash}" AS
      SELECT * FROM read_parquet('${tempFile}')
    `);

    await db.dropFile(tempFile);
    cache.markLoaded(nameHash, url);
  });
};

/**
 * Check which tables exist in DuckDB (batched query for efficiency)
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string[]} tableNames - List of table names to check
 * @returns {Promise<Set<string>>} Set of table names that exist
 */
const batchCheckTablesExist = async (db, tableNames) => {
  if (tableNames.length === 0) return new Set();

  const conn = await getConnection(db);
  const result = await conn.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name IN (${tableNames.map(n => `'${n}'`).join(', ')})
  `);

  const existingTables = new Set();
  const rows = result.toArray();
  for (const row of rows) {
    existingTables.add(row.table_name);
  }
  return existingTables;
};

/**
 * Load multiple parquet files in parallel from insight file references
 * Optimized to use single connection for all table creation operations
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {Array<{name_hash: string, signed_data_file_url: string}>} files - File references
 * @param {boolean} force - Force reload even if cached (default: false)
 * @returns {Promise<{loaded: string[], failed: Array<{nameHash: string, error: string}>}>}
 */
export const loadInsightParquetFiles = async (db, files, force = false) => {
  if (!files || files.length === 0) {
    return { loaded: [], failed: [] };
  }

  const cache = getParquetCache();
  const loaded = [];
  const failed = [];

  // Step 1: Batch check which tables already exist (single query)
  const allHashes = files.map(f => f.name_hash);
  let existingTables = new Set();

  if (!force) {
    try {
      existingTables = await batchCheckTablesExist(db, allHashes);
    } catch {
      // Fall back to loading all if check fails
      existingTables = new Set();
    }
  }

  // Determine which files need to be loaded
  const filesToLoad = [];
  for (const file of files) {
    if (existingTables.has(file.name_hash)) {
      cache.markLoaded(file.name_hash);
      loaded.push(file.name_hash);
    } else {
      // Clear stale cache entry if needed
      if (cache.isLoaded(file.name_hash)) {
        cache.clearLoaded(file.name_hash);
      }
      filesToLoad.push(file);
    }
  }

  if (filesToLoad.length === 0) {
    return { loaded, failed };
  }

  // Step 2: Fetch all parquet files in parallel (network requests can parallelize)
  const fetchResults = await Promise.allSettled(
    filesToLoad.map(async file => {
      // Use cache to prevent duplicate concurrent fetches
      return cache.getOrFetch(file.name_hash, async () => {
        const response = await fetch(file.signed_data_file_url);
        if (!response.ok) {
          throw new Error(`Failed to fetch parquet file: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return { file, buffer: new Uint8Array(arrayBuffer) };
      });
    })
  );

  // Step 3: Register files and create tables with SINGLE connection (eliminates serialization)
  const filesToCreate = [];
  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    const file = filesToLoad[i];

    if (result.status === 'fulfilled') {
      filesToCreate.push(result.value);
    } else {
      failed.push({
        nameHash: file.name_hash,
        url: file.signed_data_file_url,
        error: result.reason?.message || String(result.reason),
      });
    }
  }

  if (filesToCreate.length > 0) {
    const conn = await getConnection(db);
    for (const { file, buffer } of filesToCreate) {
      const tempFile = getTempFilename() + '.parquet';
      try {
        await db.registerFileBuffer(tempFile, buffer);

        if (force) {
          await conn.query(`DROP TABLE IF EXISTS "${file.name_hash}"`);
        }

        await conn.query(`
          CREATE TABLE "${file.name_hash}" AS
          SELECT * FROM read_parquet('${tempFile}')
        `);

        await db.dropFile(tempFile);
        cache.markLoaded(file.name_hash, file.signed_data_file_url);
        loaded.push(file.name_hash);
      } catch (err) {
        // Try to clean up temp file on error
        try {
          await db.dropFile(tempFile);
        } catch {
          // Ignore cleanup errors
        }
        failed.push({
          nameHash: file.name_hash,
          url: file.signed_data_file_url,
          error: err.message || String(err),
        });
      }
    }
  }

  return { loaded, failed };
};
