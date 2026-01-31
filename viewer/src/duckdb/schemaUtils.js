/**
 * Normalized column type categories for UI display.
 */
export const COLUMN_TYPES = {
  NUMBER: 'number',
  STRING: 'string',
  DATE: 'date',
  TIMESTAMP: 'timestamp',
  BOOLEAN: 'boolean',
  UNKNOWN: 'unknown',
};

/**
 * Map a DuckDB/Arrow type string to a normalized UI category.
 * @param {string} duckdbType - Type from DESCRIBE query (e.g., 'INTEGER', 'VARCHAR', 'TIMESTAMP')
 * @returns {string} One of COLUMN_TYPES values
 */
export const normalizeColumnType = duckdbType => {
  if (!duckdbType) return COLUMN_TYPES.UNKNOWN;

  const upperDuckdbType = duckdbType.toUpperCase();

  // Numeric types
  if (
    upperDuckdbType.includes('INT') ||
    upperDuckdbType.includes('FLOAT') ||
    upperDuckdbType.includes('DOUBLE') ||
    upperDuckdbType.includes('DECIMAL') ||
    upperDuckdbType.includes('NUMERIC') ||
    upperDuckdbType === 'REAL' ||
    upperDuckdbType === 'HUGEINT' ||
    upperDuckdbType === 'UHUGEINT'
  ) {
    return COLUMN_TYPES.NUMBER;
  }

  // String types
  if (
    upperDuckdbType.includes('VARCHAR') ||
    upperDuckdbType.includes('TEXT') ||
    upperDuckdbType.includes('CHAR') ||
    upperDuckdbType === 'BLOB'
  ) {
    return COLUMN_TYPES.STRING;
  }

  // Date type (must check before timestamp since TIMESTAMP contains no 'DATE' substring issue)
  if (upperDuckdbType === 'DATE') {
    return COLUMN_TYPES.DATE;
  }

  // Timestamp types
  if (upperDuckdbType.includes('TIMESTAMP') || upperDuckdbType.includes('DATETIME') || upperDuckdbType === 'TIME') {
    return COLUMN_TYPES.TIMESTAMP;
  }

  // Boolean
  if (upperDuckdbType === 'BOOLEAN' || upperDuckdbType === 'BOOL') {
    return COLUMN_TYPES.BOOLEAN;
  }

  return COLUMN_TYPES.UNKNOWN;
};

/**
 * Parse schema from DuckDB DESCRIBE result rows.
 * @param {Array} describeRows - Result of `DESCRIBE "tableName"` as JSON rows
 * @returns {Array<{name: string, normalizedType: string, duckdbType: string}>}
 */
export const parseSchema = describeRows => {
  return describeRows.map(row => ({
    name: row.column_name,
    duckdbType: row.column_type,
    normalizedType: normalizeColumnType(row.column_type),
  }));
};

// Approximate character width for text-sm (14px) font
const CHAR_WIDTH_PX = 7;
// Overhead: type icon (14) + gap (6) + gap (6) + sort icon space (14) + gap (6) + info button (22) + padding (24)
const HEADER_OVERHEAD_PX = 92;
const MIN_COLUMN_WIDTH = 120;

/**
 * Calculate an appropriate column width based on the column name length.
 * @param {string} columnName - The column header text
 * @param {string} normalizedType - One of COLUMN_TYPES values (unused for now, reserved for future)
 * @returns {number} Width in pixels
 */
export const calculateColumnWidth = (columnName, normalizedType) => {
  const textWidth = columnName.length * CHAR_WIDTH_PX;
  return Math.max(MIN_COLUMN_WIDTH, textWidth + HEADER_OVERHEAD_PX);
};
