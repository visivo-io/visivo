/**
 * coerceServerRowsForDuckDB — normalize server model-query rows so DuckDB-WASM
 * loads date columns as TIMESTAMP (VIS-1026 local-preview fix).
 *
 * The Flask model-query-job endpoint serializes DuckDB TIMESTAMP/DATE columns as
 * RFC 1123 strings (Flask's default datetime JSON format, e.g.
 * "Mon, 01 Jan 2024 00:00:00 GMT"). Loaded via `read_json_auto`, such a column
 * lands as VARCHAR — and any date function in a dimension expression (`strftime`,
 * `date_trunc`, …) then fails with a DuckDB binder error
 * (`No function matches strftime(VARCHAR, …)`).
 *
 * This does TWO things so the fix is deterministic (not reliant on
 * `read_json_auto`'s timestamp inference, which does NOT detect ISO strings in
 * DuckDB-WASM):
 *   1. rewrites each RFC-1123 value to naive ISO 8601 ("2024-01-01T00:00:00.000")
 *      — a form `CAST(... AS TIMESTAMP)` parses;
 *   2. reports the set of columns that held date values, so the caller can build
 *      the base table with `SELECT * REPLACE (CAST("col" AS TIMESTAMP) AS "col")`
 *      and force the column type regardless of what read_json_auto inferred.
 *
 * Ultra-targeted on purpose: ONLY values matching the exact RFC 1123 shape are
 * touched, so category / text columns are never misidentified as dates.
 */

// e.g. "Mon, 01 Jan 2024 00:00:00 GMT"
const RFC_1123_RE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * @param {Array<object>} rows - server model-query rows (plain JSON objects).
 * @returns {{ rows: Array<object>, dateColumns: string[] }} the rows with
 *   RFC-1123 dates rewritten to ISO (the same array reference when nothing
 *   matched), plus the names of the columns that held date values.
 */
export function coerceServerRowsForDuckDB(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows, dateColumns: [] };

  const dateCols = new Set();
  let changedAny = false;
  const out = rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    let next = row;
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (typeof v === 'string' && RFC_1123_RE.test(v)) {
        const ms = Date.parse(v);
        if (!Number.isNaN(ms)) {
          if (next === row) next = { ...row };
          // Drop the trailing 'Z' so the ISO value reads as a naive TIMESTAMP
          // (not TIMESTAMP WITH TIME ZONE). The RFC-1123 value is GMT, so the UTC
          // wall-clock is the original naive timestamp.
          next[key] = new Date(ms).toISOString().slice(0, -1);
          dateCols.add(key);
        }
      }
    }
    if (next !== row) changedAny = true;
    return next;
  });

  return { rows: changedAny ? out : rows, dateColumns: [...dateCols] };
}

/**
 * Build a `read_json_auto(...)` SELECT list that force-casts the given date
 * columns to TIMESTAMP via `* REPLACE`, so their type is deterministic
 * regardless of read_json_auto's inference. Returns `*` when there are none.
 *
 * @param {string[]} dateColumns
 * @returns {string} e.g. `* REPLACE (CAST("date" AS TIMESTAMP) AS "date")`
 */
export function selectWithDateCasts(dateColumns) {
  if (!Array.isArray(dateColumns) || dateColumns.length === 0) return '*';
  const casts = dateColumns.map(c => `CAST("${c}" AS TIMESTAMP) AS "${c}"`).join(', ');
  return `* REPLACE (${casts})`;
}

export default coerceServerRowsForDuckDB;
