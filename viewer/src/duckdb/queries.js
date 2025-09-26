import { ContextString } from '../utils/context_string';
import { getTempFilename } from './duckdb';


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
  return withRetry(async () => {
    const conn = await db.connect();
    try {
      const arrow = await conn.query(sql);
      return arrow
    }finally {
      await conn.close();
    }
  }, retries, delay);
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
    default:
      console.warn(`Unsupported file extension: ${extension}`);
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
    console.error('Failed to import JSON file:', e);
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
 * 
 * @param {Object} insight 
 * @param {Object} inputs 
 * @returns {String}
 */
export const prepPostQuery = (insight, inputs) => {
  let post_query = insight.post_query;
  const contextObj = new ContextString(post_query);
  const refs = contextObj.getAllRefs();

    if (refs.length > 0) {
      refs.forEach(refStr => {
        const refCtx = new ContextString(refStr);

        const insightName = refCtx.getReference();

        if (insightName) {
          const input = inputs[insightName];

          if (input !== undefined) {
            let value
            if (Array.isArray(input)) {
                if (input.length === 0) {
                  post_query = post_query.replace(refStr, "(NULL)"); 
                } else {
                  value = `(${input.map(v => (typeof v === "string" ? `'${v}'` : v)).join(", ")})`;
                  post_query = post_query.replace(refStr, value);
                }
              } else if (typeof input === "string") {
                const value = `'${input}'`;
                post_query = post_query.replace(refStr, value);
              } else {
                post_query = post_query.replace(refStr, input);
              }
          }
        }
      });
    }

    return post_query
}