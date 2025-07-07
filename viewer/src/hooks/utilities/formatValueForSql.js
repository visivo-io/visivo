/**
 * Formats a value for SQL insertion based on its column type
 * @param {any} value - The value to format
 * @param {string} columnType - The DuckDB column type (e.g., "DOUBLE", "VARCHAR")
 * @returns {string|number} - The formatted value ready for SQL insertion
 */
export const formatValueForSql = (value, columnType) => {
  // Handle null/undefined
  if (value === null || value === undefined) return "NULL";

  // Handle numeric columns
  if (columnType === "DOUBLE") {
    if (typeof value === "number") {
      return value;
    } else if (typeof value === "string") {
      if (value === "-" || value.trim() === "") {
        return "NULL";
      }
      const cleanValue = value.replace(/[$,\s]/g, "");
      return !isNaN(Number(cleanValue))
        ? Number(cleanValue)
        : "NULL";
    }
    return "NULL";
  }
  // Handle string columns
  else {
    // Normalize strings: trim, lowercase, escape single quotes with a single quote
    return `'${String(value).trim().toLowerCase().replace(/'/g, "''")}'`;
  }
};
