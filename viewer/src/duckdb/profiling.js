import { runDuckDBQuery } from './queries';
import { normalizeColumnType, COLUMN_TYPES } from './schemaUtils';

/**
 * Parse a numeric value from SUMMARIZE output, handling strings and nulls.
 * @param {*} val - Raw value from DuckDB SUMMARIZE result
 * @returns {number|null}
 */
const parseNum = val => {
  if (val == null || val === '' || val === 'NULL') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
};

/**
 * Parse null_percentage from SUMMARIZE, handling both numeric and "12.34%" string formats.
 * @param {*} val - Raw null_percentage value
 * @returns {number}
 */
const parseNullPct = val => {
  if (val == null) return 0;
  const str = String(val).replace('%', '').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

/**
 * Profile a DuckDB table locally using the SUMMARIZE command.
 * Returns data in the same shape as the /api/models/{name}/profile/ endpoint.
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db - DuckDB instance
 * @param {string} tableName - Name of the table to profile
 * @returns {Promise<{row_count: number, columns: Array}>}
 */
export const profileTableLocally = async (db, tableName) => {
  const result = await runDuckDBQuery(db, `SUMMARIZE "${tableName}"`);
  const rows = result.toArray();

  if (rows.length === 0) {
    return { row_count: 0, columns: [] };
  }

  const rowCount = parseNum(rows[0].count) ?? 0;

  // Build exact COUNT(DISTINCT) for every column in a single query
  const colNames = rows.map(r => String(r.column_name));
  const distinctExprs = colNames
    .map(name => {
      const quoted = `"${name.replace(/"/g, '""')}"`;
      const alias = `d_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      return `COUNT(DISTINCT ${quoted}) AS "${alias}"`;
    })
    .join(', ');
  const distinctResult = await runDuckDBQuery(
    db,
    `SELECT ${distinctExprs} FROM "${tableName}"`
  );
  const distinctRow = distinctResult.toArray()[0] ?? {};

  const columns = rows.map(row => {
    const colType = String(row.column_type ?? '');
    const colName = String(row.column_name);
    const isNumeric = normalizeColumnType(colType) === COLUMN_TYPES.NUMBER;
    const nullPct = parseNullPct(row.null_percentage);
    const nullCount = Math.round((nullPct / 100) * rowCount);
    const distinctAlias = `d_${colName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const distinctCount = parseNum(distinctRow[distinctAlias]) ?? parseNum(row.approx_unique) ?? 0;

    return {
      name: colName,
      type: colType,
      null_percentage: nullPct,
      null_count: nullCount,
      distinct: distinctCount,
      min:
        row.min != null && row.min !== ''
          ? isNumeric
            ? parseNum(row.min)
            : String(row.min)
          : null,
      max:
        row.max != null && row.max !== ''
          ? isNumeric
            ? parseNum(row.max)
            : String(row.max)
          : null,
      avg: isNumeric ? parseNum(row.avg) : null,
      median: isNumeric ? parseNum(row.q50) : null,
      std_dev: isNumeric ? parseNum(row.std) : null,
      q25: isNumeric ? parseNum(row.q25) : null,
      q75: isNumeric ? parseNum(row.q75) : null,
    };
  });

  return { row_count: rowCount, columns };
};

/**
 * Compute a histogram for a single column using DuckDB.
 * For numeric columns, produces equal-width range buckets.
 * For non-numeric columns, produces top-N value counts.
 *
 * Returns data in the shape expected by the Histogram component:
 *   { buckets: [{range, count} | {value, count}], total_count, column_type }
 *
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} db
 * @param {string} tableName
 * @param {string} columnName
 * @param {number} bins - Number of buckets (default 20)
 * @returns {Promise<{buckets: Array, total_count: number, column_type: string}>}
 */
export const histogramTableLocally = async (db, tableName, columnName, bins = 20) => {
  const quoted = `"${columnName.replace(/"/g, '""')}"`;

  // Get column type via DESCRIBE
  const descResult = await runDuckDBQuery(
    db,
    `SELECT column_type FROM (DESCRIBE "${tableName}") WHERE column_name = '${columnName.replace(/'/g, "''")}'`
  );
  const descRows = descResult.toArray();
  const colType = descRows.length > 0 ? String(descRows[0].column_type ?? '') : '';
  const isNumeric = normalizeColumnType(colType) === COLUMN_TYPES.NUMBER;

  if (isNumeric) {
    // Numeric: equal-width histogram using histogram() or manual bucketing
    const sql = `
      WITH stats AS (
        SELECT MIN(${quoted}) AS min_val, MAX(${quoted}) AS max_val, COUNT(${quoted}) AS total
        FROM "${tableName}"
        WHERE ${quoted} IS NOT NULL
      ),
      bins AS (
        SELECT
          min_val,
          max_val,
          total,
          CASE WHEN max_val = min_val THEN 1 ELSE ${bins} END AS num_bins,
          CASE WHEN max_val = min_val THEN 1.0 ELSE (max_val - min_val)::DOUBLE / ${bins} END AS bin_width
        FROM stats
      ),
      bucketed AS (
        SELECT
          CASE
            WHEN b.max_val = b.min_val THEN 0
            ELSE LEAST(FLOOR((${quoted} - b.min_val) / b.bin_width)::INTEGER, b.num_bins - 1)
          END AS bucket_idx,
          b.min_val,
          b.bin_width,
          b.num_bins
        FROM "${tableName}", bins b
        WHERE ${quoted} IS NOT NULL
      )
      SELECT
        bucket_idx,
        MIN(min_val + bucket_idx * bin_width) AS range_start,
        MIN(min_val + (bucket_idx + 1) * bin_width) AS range_end,
        COUNT(*) AS cnt
      FROM bucketed
      GROUP BY bucket_idx
      ORDER BY bucket_idx
    `;
    const result = await runDuckDBQuery(db, sql);
    const rows = result.toArray();

    const totalCount = rows.reduce((sum, r) => sum + Number(r.cnt ?? 0), 0);
    const buckets = rows.map(r => ({
      range: `[${parseNum(r.range_start)}, ${parseNum(r.range_end)})`,
      count: Number(r.cnt ?? 0),
    }));

    return { buckets, total_count: totalCount, column_type: colType };
  } else {
    // Categorical: top N values by frequency
    const sql = `
      SELECT ${quoted}::VARCHAR AS val, COUNT(*) AS cnt
      FROM "${tableName}"
      WHERE ${quoted} IS NOT NULL
      GROUP BY ${quoted}
      ORDER BY cnt DESC
      LIMIT ${bins}
    `;
    const result = await runDuckDBQuery(db, sql);
    const rows = result.toArray();

    const totalResult = await runDuckDBQuery(
      db,
      `SELECT COUNT(*) AS total FROM "${tableName}" WHERE ${quoted} IS NOT NULL`
    );
    const totalCount = Number(totalResult.toArray()[0]?.total ?? 0);

    const buckets = rows.map(r => ({
      value: String(r.val ?? ''),
      count: Number(r.cnt ?? 0),
    }));

    return { buckets, total_count: totalCount, column_type: colType };
  }
};
