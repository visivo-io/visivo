import { useState, useCallback } from "react";
import { initializeDuckDB } from "../components/items/duckdb-wasm-init";

const useDuckDB = () => {
  const [db, setDb] = useState(null);
  const [version, setVersion] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // In your loadData function, set this flag after successful data loading:
  // Add at the end of the try block in loadData:

  // In the catch block:

  const [status, setStatus] = useState({
    state: "idle",
    message: "Ready to initialize",
    progress: 0,
  });

  const withConnection = useCallback(
    async (callback) => {
      if (!db) {
        throw new Error("DuckDB not initialized");
      }

      const conn = await db.connect();
      try {
        return await callback(conn);
      } finally {
        await conn.close();
      }
    },
    [db]
  );

  const executeQuery = useCallback(
    async (query) => {
      if (!db) {
        throw new Error("DuckDB not initialized");
      }

      const conn = await db.connect();
      try {
        const result = await conn.query(query);
        const data = await result.toArray();
        return {
          data,
          schema: result.schema,
        };
      } finally {
        await conn.close();
      }
    },
    [db]
  );

  const tableExists = useCallback(async () => {
    if (!db) return false;

    try {
      const result = await executeQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table_data'"
      );
      return result.data.length > 0;
    } catch (error) {
      console.error("Error checking if table exists:", error);
      return false;
    }
  }, [db, executeQuery]);

  const initialize = useCallback(
    async (statusCallback = null) => {
      if (db) return db;

      const statusHandler = statusCallback || setStatus;

      statusHandler({
        state: "loading",
        message: "Initializing DuckDB...",
        progress: 10,
      });

      try {
        const dbInstance = await initializeDuckDB(statusHandler);
        setDb(dbInstance);

        statusHandler({
          state: "ready",
          message: "DuckDB initialized",
          progress: 100,
        });

        return dbInstance;
      } catch (error) {
        statusHandler({
          state: "error",
          message: `Failed to initialize: ${error.message}`,
          progress: 0,
        });

        console.error("DuckDB initialization failed:", error);
        return null;
      }
    },
    [db]
  );

  const loadData = useCallback(
    async (tableData, statusCallback = null) => {
      if (!tableData?.length) {
        console.warn("No data to load");
        return false;
      }

      if (!db) {
        console.warn("DB not initialized, initializing now");
        const dbInstance = await initialize(statusCallback);
        if (!dbInstance) return false;
      }

      const statusHandler = statusCallback || setStatus;
      statusHandler({
        state: "loading",
        message: "Loading data...",
        progress: 30,
      });

      return withConnection(async (conn) => {
        try {
          // Drop existing table if it exists
          await conn.query(`DROP TABLE IF EXISTS table_data`);

          // Determine column types
          const columnTypes = {};
          Object.keys(tableData[0] || {}).forEach((key) => {
            const allValues = tableData
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

          // Create table
          const columnDefs = Object.entries(columnTypes)
            .map(([key, type]) => `"${key}" ${type}`)
            .join(", ");

          await conn.query(`CREATE TABLE table_data (${columnDefs})`);

          // Insert data
          let processedRows = 0;
          const totalRows = tableData.length;

          for (const row of tableData) {
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
                  return `'${String(value).trim().replace(/'/g, "''")}'`;
                }
              })
              .join(", ");

            try {
              await conn.query(
                `INSERT INTO table_data ("${columns}") VALUES (${values})`
              );

              // Update progress periodically
              processedRows++;
              if (processedRows % 100 === 0 || processedRows === totalRows) {
                const progress =
                  Math.round((processedRows / totalRows) * 60) + 30;
                statusHandler({
                  state: "loading",
                  message: `Loading data: ${processedRows}/${totalRows} rows`,
                  progress: Math.min(progress, 90),
                });
              }
            } catch (insertErr) {
              console.error(`Error inserting row:`, insertErr, { row });
            }
          }

          statusHandler({
            state: "ready",
            message: "Data loaded successfully",
            progress: 100,
          });
          setIsDataLoaded(true);
          return true;
        } catch (error) {
          statusHandler({
            state: "error",
            message: `Error loading data: ${error.message}`,
            progress: 0,
          });
          setIsDataLoaded(false);
          console.error("Error loading data to DuckDB:", error);
          return false;
        }
      });
    },
    [db, initialize, withConnection]
  );

  return {
    db,
    status,
    version,
    loadData,
    initialize,
    executeQuery,
    withConnection,
    isDataLoaded,
    tableExists,
  };
};

export default useDuckDB;
