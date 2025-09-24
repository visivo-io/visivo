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
      return arrow;
    } finally {
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


const escapeValue = (val) => {
  if (Array.isArray(val)) {
    return `(${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(",")})`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
};

const resolveFilters = (interactions, inputs) => {
  return interactions.map(interaction => {
    if (!ContextString.isContextString(interaction.filter)) {
      return interaction.filter;
    }

    const ctx = new ContextString(interaction.filter);

    const inputName = ctx.getReference();
    if (!inputName) return interaction.filter;

    const path = ctx.getRefPropsPath();

    let value = inputs[inputName];
    if (path && value !== undefined && value !== null) {
      try {
        const fn = new Function("obj", `return obj${path}`);
        value = fn(value);
      } catch {
        console.warn(`Failed to resolve path ${path} on input ${inputName}`);
      }
    }

    return escapeValue(value);
  });
};

export const buildQuery = (baseQuery, interactions, inputs) => {
  const filters = resolveFilters(interactions, inputs);
  if (filters.length === 0) return baseQuery;

  return `${baseQuery} WHERE ${filters.join(" AND ")}`;
};
