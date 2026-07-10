/**
 * metricPreview.js (VIS-1026)
 *
 * The metric Field-Lens preview computed LOCALLY — the same surviving pattern
 * DimensionInspector uses (run the parent model's SQL server-side via
 * `useModelQueryJob`, then compute the field-level result in DuckDB-WASM),
 * replacing the deleted insight-preview run pipeline (`tim-local-serve-run-on-save`
 * removes `usePreviewJob` / `/api/insight-jobs/` / the `__preview__` namespace).
 *
 * The metric expression is a raw aggregate (e.g. `sum(amount)`); the split
 * dimension is a raw row-level expression. Both are DuckDB-dialect SQL over the
 * parent model's output columns (identical assumption to DimensionInspector's
 * derived-column profiling), so a local `GROUP BY` aggregate over the model rows
 * previews the metric without any server insight run.
 */

import { coerceServerRowsForDuckDB, selectWithDateCasts } from '../../../../duckdb/coerceRows';

const MAX_GROUPS = 50;

/** Wrap a date-like split expression in a grain bucket when a grain is active. */
const grainExpr = (expr, grain) => `date_trunc('${grain}', CAST(${expr} AS TIMESTAMP))`;

/**
 * Build the local aggregate SQL for a metric preview over `baseTable` (the
 * DuckDB table holding the parent model's rows).
 *
 * @param {object} p
 * @param {string} p.baseTable  - the DuckDB table name holding model rows.
 * @param {string} p.metricExpr - the metric's raw aggregate expression (y).
 * @param {string|null} p.splitExpr - the split dimension's raw expression (x), or null.
 * @param {boolean} p.showGrain - whether to date-bucket the split.
 * @param {string} p.grain      - the grain ('day' | 'week' | ... ) when showGrain.
 * @returns {string} the aggregate SQL.
 */
export function buildMetricPreviewSql({ baseTable, metricExpr, splitExpr, showGrain, grain }) {
  const y = metricExpr;
  if (!splitExpr) {
    // No dimension to split on → the single aggregate value.
    return `SELECT (${y}) AS y FROM "${baseTable}"`;
  }
  const x = showGrain ? grainExpr(splitExpr, grain) : splitExpr;
  return (
    `SELECT (${x}) AS x, (${y}) AS y ` +
    `FROM "${baseTable}" GROUP BY 1 ORDER BY 1 LIMIT ${MAX_GROUPS}`
  );
}

/**
 * Run a metric preview locally: load the model rows into a fresh DuckDB table,
 * run the aggregate, and return normalized `{ x, y }[]` rows. The caller owns
 * dropping nothing — the base table is transient and dropped here.
 *
 * @param {object} deps
 * @param {import("@duckdb/duckdb-wasm").AsyncDuckDB} deps.db
 * @param {Function} deps.getConnection - (db) => Promise<conn>.
 * @param {Function} deps.runQuery      - (db, sql) => Promise<ArrowTable>.
 * @param {Array<object>} deps.modelRows - the parent model's rows.
 * @param {object} spec - the buildMetricPreviewSql spec MINUS `baseTable`.
 * @returns {Promise<Array<{x: any, y: number}>>}
 */
export async function runMetricPreview({ db, getConnection, runQuery, modelRows, spec }) {
  if (!db || !Array.isArray(modelRows) || modelRows.length === 0) return [];
  const conn = await getConnection(db);
  const baseTable = `metric_base_${modelRows.length}_${spec.metricExpr.length}`;
  const tempFile = `${baseTable}.json`;
  // Rewrite RFC-1123 server dates to ISO and force-cast those columns to
  // TIMESTAMP, else strftime/date_trunc in a split expression fail — VIS-1026.
  const { rows: coercedRows, dateColumns } = coerceServerRowsForDuckDB(modelRows);
  await db.registerFileText(tempFile, JSON.stringify(coercedRows));
  try {
    await conn.query(`DROP TABLE IF EXISTS "${baseTable}"`).catch(() => {});
    await conn.query(
      `CREATE TABLE "${baseTable}" AS SELECT ${selectWithDateCasts(dateColumns)} FROM read_json_auto('${tempFile}')`
    );
    const sql = buildMetricPreviewSql({ ...spec, baseTable });
    const arrow = await runQuery(db, sql);
    const rows = arrow.toArray().map(r => (typeof r.toJSON === 'function' ? r.toJSON() : { ...r }));
    // Normalize: a no-split query has only `y` (one aggregate value).
    return rows.map(r => ({
      x: 'x' in r ? r.x : '(total)',
      y: typeof r.y === 'bigint' ? Number(r.y) : (r.y ?? 0),
    }));
  } finally {
    await conn.query(`DROP TABLE IF EXISTS "${baseTable}"`).catch(() => {});
    await db.dropFile(tempFile).catch(() => {});
  }
}
