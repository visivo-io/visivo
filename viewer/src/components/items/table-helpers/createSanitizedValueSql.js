/**
 * Creates a SQL expression that sanitizes a value field for numeric operations
 * Handles currency symbols, commas, spaces, and null/dash values
 * @param {string} fieldName - The database field name to sanitize
 * @returns {string} SQL expression that sanitizes the value
 */
const createSanitizedValueSql = (fieldName) => {
  return `
  COALESCE(
    TRY_CAST(
      CASE
        WHEN REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                CAST("${fieldName}" AS VARCHAR),
                '$', ''
              ),
              '€', ''
            ),
            ',', ''
          ),
          ' ', ''
        ) = '-' THEN NULL
        ELSE REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                CAST("${fieldName}" AS VARCHAR),
                '$', ''
              ),
              '€', ''
            ),
            ',', ''
          ),
          ' ', ''
        )
      END AS DOUBLE
    ),
    0
  )`;
};

export default createSanitizedValueSql;
