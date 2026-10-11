/**
 * Resolve ${ref(name).field} references to DuckDB column names
 * using the source's props_mapping.
 *
 * props_mapping maps "props.field_name" -> "hashed_column_name"
 */

import { REF_FIELD_PATTERN, SINGLE_REF_FIELD_PATTERN } from './refString';

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
 * Strip a single pair of matching surrounding quotes (double or single) from a
 * parsed alias. The documented table syntax quotes aliases with spaces
 * (`as "Total Revenue"`, Table docstring), but the caller re-wraps the alias in
 * double quotes when building SQL — so keeping the user's quotes produced a
 * double-wrapped `AS ""Total Revenue""` (a zero-length delimited identifier),
 * which DuckDB rejects and the whole table fails to render. The logical alias
 * is the unquoted text; the caller owns the SQL quoting.
 */
function stripSurroundingQuotes(alias) {
  if (alias.length >= 2) {
    const first = alias[0];
    const last = alias[alias.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return alias.slice(1, -1);
    }
  }
  return alias;
}

/**
 * Parse a column expression that may contain an alias.
 * e.g. "${ref(insight).revenue} as Total Revenue" -> { ref: "${ref(insight).revenue}", alias: "Total Revenue" }
 * e.g. '${ref(insight).revenue} as "Total Revenue"' -> { ref: "${ref(insight).revenue}", alias: "Total Revenue" }
 * e.g. "${ref(insight).revenue}" -> { ref: "${ref(insight).revenue}", alias: null }
 *
 * @param {string} colExpr - Column expression, optionally with " as Alias"
 * @returns {{ ref: string, alias: string|null }}
 */
export function parseColumnAlias(colExpr) {
  const match = colExpr.match(/^(.+?)\s+as\s+(.+)$/i);
  if (match) return { ref: match[1].trim(), alias: stripSurroundingQuotes(match[2].trim()) };
  return { ref: colExpr, alias: null };
}

/**
 * Invert a props_mapping ("props.field" -> hashed column) into a hashed-column
 * -> display-name map ("Field"), matching the header format the `data:` table
 * path uses. Prop paths are title-cased with dots as spaces.
 *
 * @param {Object} propsMapping
 * @returns {Object} hashedColumn -> display name
 */
export function buildReverseMapping(propsMapping) {
  const reverseMapping = {};
  for (const [propPath, hashedName] of Object.entries(propsMapping || {})) {
    reverseMapping[hashedName] = propPath
      .replace(/^props\./, '')
      .replace(/\./g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }
  return reverseMapping;
}

/**
 * Last-resort header text: replace every hashed column name that appears
 * anywhere inside a result key with its plain display name. A hashed name must
 * never reach the UI (VIS-1462 T6); this covers composite keys DuckDB builds
 * (e.g. `North_sum("mizwiwgxodnxypd")`) when no more specific formatter matched.
 *
 * @param {string} key - Raw result column key
 * @param {Object} reverseMapping - from buildReverseMapping
 * @returns {string}
 */
export function dehashColumnKey(key, reverseMapping) {
  if (!key) return key;
  let out = String(key);
  // Longest hashes first so a hash that is a prefix of another cannot clobber it.
  const hashes = Object.keys(reverseMapping || {}).sort((a, b) => b.length - a.length);
  for (const hash of hashes) {
    if (out.includes(hash)) out = out.split(hash).join(reverseMapping[hash]);
  }
  return out;
}
