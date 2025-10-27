import { ContextString } from '../utils/contextString';
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
 * Prepare post query by replacing input placeholders with actual values
 *
 * Handles two formats:
 * 1. Old format: ${ref(input_name)} - directly in query
 * 2. New format: 'visivo-input-placeholder-string' with comment containing Input(name)
 *
 * @param {Object} insight
 * @param {Object} inputs
 * @returns {String}
 */
export const prepPostQuery = (insight, inputs) => {
  let query = insight.query;

  // Pattern 1: Handle new placeholder format with comments
  // Matches: 'visivo-input-placeholder-string' /* replace('visivo-input-placeholder-string', Input(input_name)) */
  // eslint-disable-next-line no-useless-escape
  const placeholderPattern = new RegExp(
    "'visivo-input-placeholder-string'\\s*\\/\\*\\s*replace\\('visivo-input-placeholder-string',\\s*Input\\(([^)]+)\\)\\s*\\)\\s*(?:AS\\s+\"[^\"]+\")?\\s*\\*\\/",
    'g'
  );

  query = query.replace(placeholderPattern, (match, inputName) => {
    const trimmedName = inputName.trim();
    const inputValue = inputs[trimmedName];

    if (inputValue === undefined) {
      console.warn(`Input '${trimmedName}' not found in inputs store, leaving placeholder`);
      return match; // Leave as-is if input not found
    }

    // Format value based on type
    if (Array.isArray(inputValue)) {
      if (inputValue.length === 0) {
        return '(NULL)';
      }
      return `(${inputValue.map(v => (typeof v === 'string' ? `'${v}'` : v)).join(', ')})`;
    } else if (typeof inputValue === 'string') {
      return `'${inputValue}'`;
    } else {
      return String(inputValue);
    }
  });

  // Pattern 2: Handle old ${ref(input_name)} format (for backwards compatibility)
  const contextObj = new ContextString(query);
  const refs = contextObj.getAllRefs();

  if (refs.length > 0) {
    refs.forEach(refStr => {
      const refCtx = new ContextString(refStr);
      const insightName = refCtx.getReference();

      if (insightName) {
        const input = inputs[insightName];

        if (input !== undefined) {
          let value;
          if (Array.isArray(input)) {
            if (input.length === 0) {
              query = query.replace(refStr, '(NULL)');
            } else {
              value = `(${input.map(v => (typeof v === 'string' ? `'${v}'` : v)).join(', ')})`;
              query = query.replace(refStr, value);
            }
          } else if (typeof input === 'string') {
            const value = `'${input}'`;
            query = query.replace(refStr, value);
          } else {
            query = query.replace(refStr, input);
          }
        }
      }
    });
  }

  return query;
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
    cache.markLoaded(nameHash, url);
    console.debug(`Parquet file ${nameHash} already exists in DuckDB`);
    return;
  }

  // Use cache to prevent duplicate concurrent fetches
  return cache.getOrFetch(nameHash, async () => {
    try {
      cache.markLoading(nameHash, url);
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

      cache.markLoaded(nameHash, url);
    } catch (error) {
      console.error(`Error loading parquet file from ${url}:`, error);
      cache.markError(nameHash, url, error);
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
