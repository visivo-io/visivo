import * as duckdb from '@duckdb/duckdb-wasm';
import { getTempFilename } from './duckdb';

/**
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} sql
 * @returns {Promise}
 */
export const runDuckDBQuery = async (db, sql) => {
  const conn = await db.connect();
  const arrow = await conn.query(sql);
  await conn.close();
  return arrow;
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
    case 'parquet':
      await _insertParquet(db, file, tableName);
      return;
    case 'csv':
      await _insertCSV(db, file, tableName);
      return;
    case 'json':
      await _insertJSON(db, file, tableName);
      return;
    default:
      console.warn(`Unsupported file extension: ${extension}`);
  }
};

const _insertParquet = async (db, file, tableName) => {
  try {
    const tempFile = getTempFilename() + '.parquet';
    await db.registerFileHandle(tempFile, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
    await runDuckDBQuery(db, `CREATE TABLE '${tableName}' AS SELECT * FROM '${tempFile}'`);
    await db.dropFile(tempFile);
  } catch (e) {
    console.error('Failed to import parquet file:', e);
  }
};

const _insertCSV = async (db, file, tableName) => {
  try {
    const text = await file.text();

    const tempFile = getTempFilename();
    await db.registerFileText(tempFile, text);

    const conn = await db.connect();
    await conn.insertCSVFromPath(tempFile, {
      name: tableName,
      schema: 'main',
      detect: true,
    });
    await conn.close();
    db.dropFile(tempFile);

    await inferTypes(db, tableName);
  } catch (e) {
    console.error('Failed to import CSV file:', e);
    throw e;
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

const columnTypes = async (db, name) => {
  const arrow = await runDuckDBQuery(
    db,
    `select column_name, data_type from information_schema.columns where table_name = '${name}'`
  );

  const columns = new Map();
  for (let i = 0; i < arrow.numRows; i++) {
    const row = arrow.get(i);
    if (row) {
      const [column_name, data_type] = row.toArray();
      columns.set(column_name, data_type);
    }
  }
  return columns;
};

const inferTypes = async (db, tableName) => {
  const types = await columnTypes(db, tableName);
  const columns = Array.from(types.keys());

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (column.toLowerCase().includes('year')) {
      await runDuckDBQuery(
        db,
        `ALTER TABLE "${tableName}" ALTER COLUMN "${column}" SET DATA TYPE VARCHAR`
      );
    }
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
