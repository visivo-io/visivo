/**
 * Shared utilities for processing DuckDB Arrow query results into JS objects.
 */

import { DataType } from 'apache-arrow';

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
 * Process an Arrow query result into an array of plain JS objects.
 * Handles bigint conversion (timestamps → ISO strings, others → string).
 *
 * @param {Object} arrowResult - Arrow Table result from runDuckDBQuery
 * @returns {Array<Object>} Array of row objects with properly typed values
 */
export const processArrowResult = arrowResult => {
  const timestampColumns = getTimestampColumns(arrowResult.schema);

  return arrowResult.toArray().map(row => {
    const rowData = row.toJSON();
    return Object.fromEntries(
      Object.entries(rowData).map(([key, value]) => {
        if (timestampColumns.has(key) && value != null) {
          const numVal = typeof value === 'bigint' ? Number(value) : value;
          // DuckDB timestamps are microseconds; JS Date expects milliseconds
          return [key, new Date(numVal / 1000).toISOString()];
        }
        if (typeof value === 'bigint') {
          return [key, value.toString()];
        }
        return [key, value];
      })
    );
  });
};
