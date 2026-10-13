import { resolveFieldRef, resolveValueExpression, extractAggAndColumn, parseColumnAlias } from './pivotRefResolver';

/**
 * The relation a table query reads FROM.
 *
 * With `sourceSql` (the insight's input-resolved post-query, see usePivotData)
 * the table reads the SAME input-filtered result set the chart path renders,
 * wrapped as a derived table; without it (a model-data source, which has no
 * post-query) it reads the raw parquet table by name. Column-select and pivot
 * tables used to always read the raw parquet, so input changes never reached
 * them (VIS-1462 T1).
 *
 * @param {string} tableName - DuckDB table name (name_hash)
 * @param {string|null} sourceSql - Prepared post-query SQL, or null
 * @returns {string} SQL relation usable after FROM
 */
export function sourceRelation(tableName, sourceSql) {
  if (sourceSql) return `(${sourceSql}) AS "__visivo_source"`;
  return `"${tableName}"`;
}

/**
 * Build a DuckDB PIVOT SQL query from table pivot configuration.
 *
 * @param {Object} pivotConfig - { columns, rows, values } from table config
 * @param {string[]} pivotConfig.columns - Array of ref strings for pivot columns
 * @param {string[]} pivotConfig.rows - Array of ref strings for row grouping
 * @param {string[]} pivotConfig.values - Value expressions with aggregation, e.g. ["sum(${ref(x).revenue})"]
 * @param {Object} propsMapping - Insight's props_mapping for ref resolution
 * @param {string} tableName - DuckDB table name (name_hash from insight files)
 * @param {string|null} [sourceSql] - Input-resolved post-query to read from instead
 *   of the raw table (see sourceRelation)
 * @returns {string} DuckDB PIVOT SQL query
 */
export function buildPivotQuery({ columns, rows, values }, propsMapping, tableName, sourceSql = null) {
  const relation = sourceRelation(tableName, sourceSql);
  const resolvedCols = columns.map(col => resolveFieldRef(col, propsMapping));
  const resolvedRows = (rows || []).map(row => resolveFieldRef(row, propsMapping));

  // `extractAggAndColumn` returns the column ALREADY quoted (e.g. `"revenue_hash"`).
  const valueColumns = [];
  const usingParts = values.map(value => {
    const resolvedValue = resolveValueExpression(value, propsMapping);
    const aggParts = extractAggAndColumn(resolvedValue);

    if (!aggParts) {
      throw new Error(
        `Invalid value expression: "${value}". Expected format like "sum(\${ref(insight).field})".`
      );
    }

    // Track the underlying value column (excluding `count(*)`) for the no-rows
    // inner SELECT below.
    if (aggParts.column && aggParts.column !== '*') valueColumns.push(aggParts.column);
    return `${aggParts.aggFunc}(${aggParts.column})`;
  });

  const quotedCols = resolvedCols.map(c => `"${c}"`);
  const onClause = quotedCols.join(', ');
  const usingClause = usingParts.join(', ');

  if (resolvedRows.length === 0) {
    // No row grouping: restrict the inner SELECT to just the pivot columns + the
    // aggregated value columns so DuckDB's implicit grouping collapses to a
    // SINGLE aggregated row (a `SELECT *` would implicitly group by every other
    // column, producing one row per distinct combination instead). No GROUP BY.
    // `quotedCols` are quoted here; `valueColumns` are already quoted.
    const innerCols = [...new Set([...quotedCols, ...valueColumns])].join(', ');
    return `PIVOT (SELECT ${innerCols} FROM ${relation}) ON ${onClause} USING ${usingClause}`;
  }

  const groupByClause = resolvedRows.map(r => `"${r}"`).join(', ');
  return `PIVOT (SELECT * FROM ${relation}) ON ${onClause} USING ${usingClause} GROUP BY ${groupByClause}`;
}

/**
 * Build a DuckDB SELECT query for column selection mode (columns without rows/values).
 *
 * @param {string[]} columns - Array of column expressions, e.g. ["${ref(insight).x} as Name"]
 * @param {Object} propsMapping - Insight's props_mapping for ref resolution (null for models)
 * @param {string} tableName - DuckDB table name
 * @param {string|null} [sourceSql] - Input-resolved post-query to read from instead
 *   of the raw table (see sourceRelation)
 * @returns {string} DuckDB SELECT SQL query
 */
export function buildColumnSelectQuery(columns, propsMapping, tableName, sourceSql = null) {
  const selectParts = columns.map(col => {
    const { ref, alias } = parseColumnAlias(col);
    const resolved = resolveFieldRef(ref, propsMapping);
    if (alias) {
      return `"${resolved}" AS "${alias}"`;
    }
    return `"${resolved}"`;
  });

  return `SELECT ${selectParts.join(', ')} FROM ${sourceRelation(tableName, sourceSql)}`;
}
