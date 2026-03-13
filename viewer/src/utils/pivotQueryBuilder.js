import { resolveFieldRef, resolveValueExpression, extractAggAndColumn } from './pivotRefResolver';

/**
 * Build a DuckDB PIVOT SQL query from table pivot configuration.
 *
 * @param {Object} pivotConfig - { columns, rows, values } from table config
 * @param {string[]} pivotConfig.columns - Array of ref strings for pivot columns
 * @param {string[]} pivotConfig.rows - Array of ref strings for row grouping
 * @param {string[]} pivotConfig.values - Value expressions with aggregation, e.g. ["sum(${ref(x).revenue})"]
 * @param {Object} propsMapping - Insight's props_mapping for ref resolution
 * @param {string} tableName - DuckDB table name (name_hash from insight files)
 * @returns {string} DuckDB PIVOT SQL query
 */
export function buildPivotQuery({ columns, rows, values }, propsMapping, tableName) {
  const resolvedCols = columns.map(col => resolveFieldRef(col, propsMapping));
  const resolvedRows = rows.map(row => resolveFieldRef(row, propsMapping));

  const usingParts = values.map(value => {
    const resolvedValue = resolveValueExpression(value, propsMapping);
    const aggParts = extractAggAndColumn(resolvedValue);

    if (!aggParts) {
      throw new Error(
        `Invalid value expression: "${value}". Expected format like "sum(\${ref(insight).field})".`
      );
    }

    return `${aggParts.aggFunc}(${aggParts.column})`;
  });

  const onClause = resolvedCols.map(c => `"${c}"`).join(', ');
  const groupByClause = resolvedRows.map(r => `"${r}"`).join(', ');
  const usingClause = usingParts.join(', ');

  return `PIVOT (SELECT * FROM "${tableName}") ON ${onClause} USING ${usingClause} GROUP BY ${groupByClause}`;
}
