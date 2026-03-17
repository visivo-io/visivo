/**
 * Resolve ${ref(insight-name).field} references to DuckDB column names
 * using the insight's props_mapping.
 *
 * props_mapping maps "props.field_name" -> "hashed_column_name"
 */

const REF_FIELD_PATTERN = /\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}/g;
const SINGLE_REF_FIELD_PATTERN = /^\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}$/;

/**
 * Resolve a single ${ref(insight-name).field_name} to its DuckDB column name.
 * @param {string} refString - e.g. "${ref(sales-insight).region}"
 * @param {Object} propsMapping - e.g. {"props.region": "hashed_col_abc"}
 * @returns {string} The resolved column name (hashed or original field name as fallback)
 */
export function resolveFieldRef(refString, propsMapping) {
  const match = refString.match(SINGLE_REF_FIELD_PATTERN);
  if (!match) return refString;

  const fieldName = match[1];
  const propKey = `props.${fieldName}`;

  if (propsMapping && propsMapping[propKey]) {
    return propsMapping[propKey];
  }

  return fieldName;
}

/**
 * Resolve all ${ref(...).field} occurrences in a value expression.
 * Used for the `value` field like "sum(${ref(insight).revenue})"
 *
 * @param {string} valueExpr - e.g. "sum(${ref(sales-insight).revenue})"
 * @param {Object} propsMapping - e.g. {"props.revenue": "hashed_col_xyz"}
 * @returns {string} Expression with refs replaced by column names, e.g. 'sum("hashed_col_xyz")'
 */
export function resolveValueExpression(valueExpr, propsMapping) {
  return valueExpr.replace(REF_FIELD_PATTERN, (_match, fieldName) => {
    const propKey = `props.${fieldName}`;
    const colName = propsMapping?.[propKey] || fieldName;
    return `"${colName}"`;
  });
}

/**
 * Extract aggregation function and column from a resolved value expression.
 * e.g. 'sum("revenue_hash")' -> { aggFunc: "sum", column: '"revenue_hash"' }
 *
 * @param {string} resolvedExpr - Already-resolved expression
 * @returns {{ aggFunc: string, column: string } | null}
 */
export function extractAggAndColumn(resolvedExpr) {
  const match = resolvedExpr.match(/^(\w+)\((.+)\)$/);
  if (!match) return null;
  return { aggFunc: match[1], column: match[2] };
}

/**
 * Parse a column expression that may contain an alias.
 * e.g. "${ref(insight).revenue} as Total Revenue" -> { ref: "${ref(insight).revenue}", alias: "Total Revenue" }
 * e.g. "${ref(insight).revenue}" -> { ref: "${ref(insight).revenue}", alias: null }
 *
 * @param {string} colExpr - Column expression, optionally with " as Alias"
 * @returns {{ ref: string, alias: string|null }}
 */
export function parseColumnAlias(colExpr) {
  const match = colExpr.match(/^(.+?)\s+as\s+(.+)$/i);
  if (match) return { ref: match[1].trim(), alias: match[2].trim() };
  return { ref: colExpr, alias: null };
}

