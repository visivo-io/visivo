import { useCallback } from 'react';
import detectColumnType from "../components/items/table-helpers/detectColumnType";
import isAggregateable from "../components/items/table-helpers/is-aggregatable/isAggregatable";

/**
 * Formats a value for SQL insertion based on its column type
 * @param {any} value - The value to format
 * @param {string} columnType - The DuckDB column type (e.g., "DOUBLE", "VARCHAR")
 * @returns {string|number} - The formatted value ready for SQL insertion
 */
const formatValueForSql = (value, columnType) => {
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

/**
 * Performs a batch insert of rows into DuckDB
 * @param {Object} conn - DuckDB connection
 * @param {Array} data - Array of data objects to insert
 * @param {Object} columnTypes - Mapping of column names to types
 * @param {number} batchSize - Number of rows per batch
 * @returns {Object} - Result statistics
 */
const batchInsertData = async (conn, data, columnTypes, batchSize = 500) => {
  let insertedRows = 0;
  let errorRows = 0;

  const totalBatches = Math.ceil(data.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min((batchIndex + 1) * batchSize, data.length);
    const batch = data.slice(batchStart, batchEnd);

    if (batch.length === 0) continue;

    try {
      // Get column names once for the batch
      const columns = Object.keys(batch[0]);
      const columnsStr = columns.join('", "');

      // Build multi-row VALUES syntax
      const valuesClause = batch.map(row => {
        const rowValues = columns.map(key =>
          formatValueForSql(row[key], columnTypes[key])
        ).join(", ");

        return `(${rowValues})`;
      }).join(",\n");

      // Execute a single INSERT statement for the entire batch
      await conn.query(`INSERT INTO table_data ("${columnsStr}") VALUES ${valuesClause}`);
      insertedRows += batch.length;
    } catch (error) {
      errorRows += batch.length;
    }
  }

  return { insertedRows, errorRows };
};

/**
 * Custom hook for loading data into DuckDB
 * @param {Object} options - Configuration options
 * @param {Function} options.setIsLoadingDuckDB - Function to set loading state
 * @param {Array} options.tableData - Data to load into DuckDB
 * @returns {Function} loadDataToDuckDB function
 */
export const useLoadDataToDuckDB = ({
  setIsLoadingDuckDB,
  tableData,
}) => {

  const loadDataToDuckDB = useCallback(
    async (dbInstance, dataToLoad) => {
      if (!setIsLoadingDuckDB) {
        console.error("setIsLoadingDuckDB is required");
        return;
      }

      try {
        setIsLoadingDuckDB(true);
        const data = dataToLoad || tableData;

        if (!data || !data.length) {
          return;
        }

        const conn = await dbInstance.connect();

        try {
          await conn.query(`DROP TABLE IF EXISTS table_data`);
        } catch (dropErr) {
          console.log("Error dropping table:", dropErr);
        }

        // Determine column types
        const columnTypes = {};
        Object.keys(data[0] || {}).forEach((key) => {
          // Use detectColumnType to determine the type
          const columnType = detectColumnType(data, key);
          // Map the returned type to DuckDB types
          columnTypes[key] = isAggregateable(columnType) ? "DOUBLE" : "VARCHAR";
        });

        // Create table with appropriate schema
        const columnDefs = Object.entries(columnTypes)
          .map(([key, type]) => `"${key}" ${type}`)
          .join(", ");

        await conn.query(`CREATE TABLE table_data (${columnDefs})`);

        // Use the batch insert utility function instead of row-by-row insertion
        const { insertedRows, errorRows } = await batchInsertData(conn, data, columnTypes);

        try {
          await conn.query("SELECT COUNT(*) FROM table_data");
        } catch (verifyErr) {
          // Silent fail on verification errors
        }

        await conn.close();

        return { success: true, insertedRows, errorRows };
      } catch (e) {
        return { success: false, error: e };
      } finally {
        setIsLoadingDuckDB(false);
      }
    },
    [setIsLoadingDuckDB, tableData]
  );

  return loadDataToDuckDB;
};