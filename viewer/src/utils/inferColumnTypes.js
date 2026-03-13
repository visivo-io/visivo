import { COLUMN_TYPES } from '../duckdb/schemaUtils';

/**
 * Infer column type from a sample value.
 * @param {any} value - Sample value from first row
 * @returns {string} Normalized type from COLUMN_TYPES
 */
const inferTypeFromValue = value => {
  if (value === null || value === undefined) return COLUMN_TYPES.UNKNOWN;

  if (typeof value === 'number') return COLUMN_TYPES.NUMBER;
  if (typeof value === 'boolean') return COLUMN_TYPES.BOOLEAN;

  if (typeof value === 'string') {
    // Check for date patterns (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return COLUMN_TYPES.DATE;
    // Check for timestamp patterns (YYYY-MM-DD HH:MM or ISO format)
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return COLUMN_TYPES.TIMESTAMP;
    return COLUMN_TYPES.STRING;
  }

  return COLUMN_TYPES.UNKNOWN;
};

/**
 * Transform query results to DataTable column format.
 * Bridges the gap between model-query-jobs API response (column names only)
 * and DataTable expectations (column schema with types).
 *
 * @param {string[]} columnNames - Column names from API response
 * @param {Object[]} rows - Data rows from API response
 * @returns {Array<{name: string, normalizedType: string, duckdbType: string}>}
 */
export const inferColumnTypes = (columnNames, rows) => {
  const firstRow = rows[0] || {};

  return columnNames.map(name => ({
    name,
    normalizedType: inferTypeFromValue(firstRow[name]),
    duckdbType: 'UNKNOWN',
  }));
};

export default inferColumnTypes;
