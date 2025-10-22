/**
 * Query execution limits and thresholds
 */

export const QUERY_LIMITS = {
  // Maximum number of rows to store/display from query results
  MAX_RESULT_ROWS: 100000,

  // Time in milliseconds before showing "long-running query" warning
  WARNING_TIMEOUT_MS: 30000,

  // Auto-save interval in milliseconds for worksheet sessions
  AUTO_SAVE_INTERVAL_MS: 10000, // Increased from 5s to 10s to reduce network traffic

  // Maximum editor height for query cells (pixels)
  MAX_CELL_HEIGHT: 500,

  // Debounce delay for query text changes (milliseconds)
  QUERY_CHANGE_DEBOUNCE_MS: 300,
};

export default QUERY_LIMITS;
