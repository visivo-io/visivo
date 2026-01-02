import { getTempFilename } from './duckdb';
import { getParquetCache } from './parquetCache';

/**
 * @param {Function} fn
 * @param {number} retries
 * @param {number} delay
 */
export const withRetry = async (fn, retries = 5, delay = 500) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
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
      const conn = await db.connect();
      try {
        const arrow = await conn.query(sql);
        return arrow;
      } finally {
        await conn.close();
      }
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
  try {
    const text = await file.text();

    const tempFile = getTempFilename() + '.json';
    await db.registerFileText(tempFile, text);

    const conn = await db.connect();
    await conn.query(`
      CREATE TABLE "${tableName}" AS
      SELECT * FROM read_json_auto('${tempFile}')
    `);
    await conn.close();

    await db.dropFile(tempFile);
  } catch (e) {
    throw e;
  }
};

const _insertParquet = async (db, file, tableName) => {
  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  const tempFile = getTempFilename() + '.parquet';
  await db.registerFileBuffer(tempFile, uint8Array);

  const conn = await db.connect();
  await conn.query(`
    CREATE TABLE "${tableName}" AS
    SELECT * FROM read_parquet('${tempFile}')
  `);
  await conn.close();

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
    const processedValues = inputValues.map(value => {
      if (value === null || value === undefined) {
        return 'NULL';
      }
      if (typeof value === 'object') {
        // For accessor objects, ensure null accessors return 'NULL'
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, v === null || v === undefined ? 'NULL' : v])
        );
      }
      return String(value);
    });

    // Create a function that evaluates the query as a template literal
    // This safely injects values without regex manipulation
    // eslint-disable-next-line no-new-func
    const templateFunc = new Function(...inputKeys, `return \`${query}\`;`);

    // Execute the template function with the input values
    const result = templateFunc(...processedValues);

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
    try {
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
      const conn = await db.connect();
      try {
        // Drop existing table if forcing reload
        if (force) {
          await conn.query(`DROP TABLE IF EXISTS "${nameHash}"`);
        }

        await conn.query(`
          CREATE TABLE "${nameHash}" AS
          SELECT * FROM read_parquet('${tempFile}')
        `);
      } finally {
        await conn.close();
        await db.dropFile(tempFile);
      }

      cache.markLoaded(nameHash, url);
    } catch (error) {
      throw error;
    }
  });
};

/**
 * Load multiple parquet files in parallel from insight file references
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

  const results = await Promise.allSettled(
    files.map(file => loadParquetFromURL(db, file.signed_data_file_url, file.name_hash, force))
  );

  const loaded = [];
  const failed = [];

  results.forEach((result, index) => {
    const file = files[index];
    if (result.status === 'fulfilled') {
      loaded.push(file.name_hash);
    } else {
      failed.push({
        nameHash: file.name_hash,
        url: file.signed_data_file_url,
        error: result.reason.message || String(result.reason),
      });
    }
  });

  return { loaded, failed };
};
