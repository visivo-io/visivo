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
  try {
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
  } catch (e) {
    console.error('Failed to import Parquet file:', e);
    throw e;
  }
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
 * Uses JavaScript template literal evaluation to inject input values AS-IS (no quoting).
 * Values are expected to come from backend input queries which already include proper SQL formatting.
 *
 * @param {Object} insight - Insight object with query containing ${inputName} placeholders
 * @param {Object} inputs - Object mapping input names to their values (as strings)
 * @returns {String} - Query with all placeholders replaced by actual values
 */
export const prepPostQuery = (insight, inputs) => {
  const query = insight.query;

  if (!query) {
    console.warn('Insight has no query');
    return '';
  }

  try {
    // Extract input keys and values
    const inputKeys = Object.keys(inputs);
    const inputValues = Object.values(inputs);

    // Convert all values to strings AS-IS (no additional quoting)
    const stringValues = inputValues.map(value => String(value));

    // Create a function that evaluates the query as a template literal
    // This safely injects values without regex manipulation
    // eslint-disable-next-line no-new-func
    const templateFunc = new Function(...inputKeys, `return \`${query}\`;`);

    // Execute the template function with the input values
    const result = templateFunc(...stringValues);

    console.debug('Query prepared:', result);
    return result;
  } catch (error) {
    console.error('Failed to inject input values into query:', error);
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

  // Check if already loaded (unless forcing reload)
  if (!force && cache.isLoaded(nameHash)) {
    console.debug(`Parquet file ${nameHash} already loaded from cache`);
    return;
  }

  // Check if table already exists in DuckDB
  if (!force && (await tableDuckDBExists(db, nameHash))) {
    cache.markLoaded(nameHash);
    console.debug(`Parquet file ${nameHash} already exists in DuckDB`);
    return;
  }

  // Use cache to prevent duplicate concurrent fetches
  return cache.getOrFetch(nameHash, async () => {
    try {
      console.debug(`Loading parquet file from ${url} as table '${nameHash}'`);

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
        console.debug(`Successfully created table '${nameHash}' from parquet file`);
      } finally {
        await conn.close();
        await db.dropFile(tempFile);
      }

      cache.markLoaded(nameHash);
    } catch (error) {
      console.error(`Error loading parquet file from ${url}:`, error);
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

  console.debug(`Loading ${files.length} parquet files for insight`);

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

  if (failed.length > 0) {
    console.error(`Failed to load ${failed.length} parquet files:`, failed);
  }

  console.debug(`Successfully loaded ${loaded.length}/${files.length} parquet files`);

  return { loaded, failed };
};
