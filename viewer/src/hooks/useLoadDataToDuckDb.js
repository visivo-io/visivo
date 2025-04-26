import { useCallback } from 'react';
import detectColumnType from "../components/items/table-helpers/detect-column-type/detectColumnType";
import isAggregateable from "../components/items/table-helpers/is-aggregatable/isAggregatable";
import { batchInsertData } from "./utilities/batchInsertData";

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