/**
 * Shared utilities for processing DuckDB Arrow query results into JS objects.
 */

import { DataType, util } from 'apache-arrow';

function decimalToString(value, scale) {
  const integer = util.bigNumToString(value);
  if (scale === 0) return integer;
  if (scale < 0) return integer === '0' ? '0' : integer + '0'.repeat(-scale);
  const sign = integer.startsWith('-') ? '-' : '';
  const digits = (sign ? integer.slice(1) : integer).padStart(scale + 1, '0');
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/**
 * Extract timestamp/date column names from an Arrow schema.
 * @param {Object} schema - Arrow Table schema with .fields array
 * @returns {Set<string>} Column names that are timestamp or date types
 */
export const getTimestampColumns = schema => {
  const timestampColumns = new Set();
  if (schema?.fields) {
    for (const field of schema.fields) {
      if (DataType.isTimestamp(field.type) || DataType.isDate(field.type)) {
        timestampColumns.add(field.name);
      }
    }
  }
  return timestampColumns;
};

/**
 * Convert an Arrow date/timestamp value to an ISO string.
 * apache-arrow's getters already normalise every date/timestamp unit to epoch milliseconds.
 */
export const arrowDateToIso = value =>
  new Date(typeof value === 'bigint' ? Number(value) : value).toISOString();

/**
 * Process an Arrow query result into an array of plain JS objects.
 * Timestamps become ISO strings; bigints and decimals become exact numeric strings.
 *
 * @param {Object} arrowResult - Arrow Table result from runDuckDBQuery
 * @returns {Array<Object>} Array of row objects with properly typed values
 */
export const processArrowResult = arrowResult => {
  const timestampColumns = getTimestampColumns(arrowResult.schema);
  const decimalScales = new Map(
    (arrowResult.schema?.fields || [])
      .filter(field => DataType.isDecimal(field.type))
      .map(field => [field.name, field.type.scale])
  );

  return arrowResult.toArray().map(row => {
    const rowData = row.toJSON();
    return Object.fromEntries(
      Object.entries(rowData).map(([key, value]) => {
        if (decimalScales.has(key) && value != null) {
          return [key, decimalToString(value, decimalScales.get(key))];
        }
        if (timestampColumns.has(key) && value != null) {
          return [key, arrowDateToIso(value)];
        }
        if (typeof value === 'bigint') {
          return [key, value.toString()];
        }
        return [key, value];
      })
    );
  });
};
