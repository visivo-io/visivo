/**
 * Compute column profile statistics from in-memory data.
 * Used by SQLEditor to profile query results without DuckDB.
 */

const isNumeric = value => typeof value === 'number' && !isNaN(value);

/**
 * Get the display type from column definition.
 * Prefers duckdbType if available, falls back to normalizedType (capitalized).
 */
const getDisplayType = columnDef => {
  if (columnDef?.duckdbType && columnDef.duckdbType !== 'UNKNOWN') {
    return columnDef.duckdbType;
  }
  if (columnDef?.normalizedType && columnDef.normalizedType !== 'unknown') {
    return columnDef.normalizedType.toUpperCase();
  }
  return 'UNKNOWN';
};

const median = sortedArr => {
  const len = sortedArr.length;
  if (len === 0) return null;
  const mid = Math.floor(len / 2);
  return len % 2 !== 0 ? sortedArr[mid] : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
};

const percentile = (sortedArr, p) => {
  if (sortedArr.length === 0) return null;
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (index - lower);
};

const stdDev = (arr, mean) => {
  if (arr.length === 0) return null;
  const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / arr.length);
};

export const computeColumnProfile = (columnName, columnDef, rows) => {
  const displayType = getDisplayType(columnDef);

  if (!rows || rows.length === 0) {
    return {
      name: columnName,
      type: displayType,
      null_count: 0,
      null_percentage: 0,
      distinct: 0,
      min: null,
      max: null,
      avg: null,
      median: null,
      std_dev: null,
      q25: null,
      q75: null,
    };
  }

  const values = rows.map(row => row[columnName]);
  const nonNullValues = values.filter(v => v !== null && v !== undefined);
  const nullCount = values.length - nonNullValues.length;
  const nullPercentage = (nullCount / values.length) * 100;

  // Distinct count
  const distinctSet = new Set(nonNullValues.map(v => JSON.stringify(v)));
  const distinctCount = distinctSet.size;

  // Check if numeric
  const numericValues = nonNullValues.filter(isNumeric);
  const isNumericColumn = numericValues.length > 0 && numericValues.length === nonNullValues.length;

  let min = null;
  let max = null;
  let avg = null;
  let medianVal = null;
  let stdDevVal = null;
  let q25 = null;
  let q75 = null;

  if (isNumericColumn && numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    min = sorted[0];
    max = sorted[sorted.length - 1];
    avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    medianVal = median(sorted);
    stdDevVal = stdDev(numericValues, avg);
    q25 = percentile(sorted, 25);
    q75 = percentile(sorted, 75);
  } else if (nonNullValues.length > 0) {
    // For non-numeric, try to get min/max as strings
    const stringValues = nonNullValues.map(String).sort();
    min = stringValues[0];
    max = stringValues[stringValues.length - 1];
  }

  return {
    name: columnName,
    type: displayType,
    null_count: nullCount,
    null_percentage: nullPercentage,
    distinct: distinctCount,
    min,
    max,
    avg,
    median: medianVal,
    std_dev: stdDevVal,
    q25,
    q75,
  };
};
