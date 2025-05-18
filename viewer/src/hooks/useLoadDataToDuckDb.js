import { useCallback } from 'react';

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
  minimalLogging = process.env.NODE_ENV !== 'development'
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
          // Silent fail on table drop errors
        }

        // Determine column types
        const columnTypes = {};
        Object.keys(data[0] || {}).forEach((key) => {
          const allValues = data
            .map((row) => row[key])
            .filter((v) => v !== null && v !== undefined);
          const allNumeric =
            allValues.length > 0 &&
            allValues.every(
              (value) =>
                typeof value === "number" ||
                (typeof value === "string" &&
                  value !== "-" &&
                  value.trim() !== "" &&
                  !isNaN(Number(value.replace(/[$,\s]/g, ""))))
            );

          columnTypes[key] = allNumeric ? "DOUBLE" : "VARCHAR";
        });

        // Create table with appropriate schema
        const columnDefs = Object.entries(columnTypes)
          .map(([key, type]) => `"${key}" ${type}`)
          .join(", ");

        await conn.query(`CREATE TABLE table_data (${columnDefs})`);

        // Insert data
        let insertedRows = 0;
        let errorRows = 0;

        for (const row of data) {
          try {
            const columns = Object.keys(row).join('", "');
            const values = Object.values(row)
              .map((value, index) => {
                if (value === null || value === undefined) return "NULL";

                const key = Object.keys(row)[index];

                if (columnTypes[key] === "DOUBLE") {
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
                } else {
                  // Normalize strings: trim and convert to lowercase
                  return `'${String(value)
                    .trim()
                    .toLowerCase()
                    .replace(/'/g, "''")}'`;
                }
              })
              .join(", ");

            await conn.query(
              `INSERT INTO table_data ("${columns}") VALUES (${values})`
            );
            insertedRows++;
          } catch (insertErr) {
            errorRows++;
          }
        }

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
    [setIsLoadingDuckDB, tableData, minimalLogging]
  );

  return loadDataToDuckDB;
};