import React from "react";
import { Button } from "@mui/material";
import Papa from "papaparse";
import sanitizeColumnName from "../table-helpers/sanitizeColumnName";

const prepareDuckDB = async (
  db,
  initializeDuckDB,
  setDuckDBStatus,
  loadDataToDuckDB,
  setDb,
  data // Data parameter to pass to loadDataToDuckDB
) => {
  try {
    console.log("Preparing DuckDB for new data", data?.length, "rows");

    // 1. Drop existing table first
    if (db) {
      // const conn = await db.connect();
      // try {
      //   console.log("Dropping existing table_data");
      //   await conn.query(`DROP TABLE IF EXISTS table_data`);
      //   await conn.close();
      //   console.log("Successfully dropped existing table");

      //   // 2. After table is dropped, load the new data WITH DATA PARAMETER
      //   await loadDataToDuckDB(db, data); // Pass data and await completion
      //   console.log("DuckDB data load completed");
      // } catch (err) {
      //   console.error("Error dropping table:", err);
      //   if (conn) await conn.close();
      // }
    } else if (initializeDuckDB) {
      // If DB doesn't exist yet, initialize it
      console.log("Initializing DuckDB");
      try {
        const dbInstance = await initializeDuckDB(setDuckDBStatus);
        setDb(dbInstance);
        if (dbInstance) {
          await loadDataToDuckDB(dbInstance, data); // Pass data and await
          console.log("DuckDB initialized and data loaded");
        }
      } catch (error) {
        console.error("DuckDB initialization failed:", error);
      }
    }
  } catch (err) {
    console.error("Error preparing DuckDB:", err);
  }
};

const CSVUploadButton = ({
  disabled,
  duckDBStatus,
  db,
  loadDataToDuckDB,
  setDuckDBStatus,
  setTableData,
  setColumns,
  useTable,
  setDb,
  setIsPivoted,
  setPivotedData,
  setPivotedColumns,
  initializeDuckDB,
}) => {
  const [fileInputKey, setFileInputKey] = React.useState(Math.random());
  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      console.error("No file selected.");
      return;
    }

    if (file.type !== "text/csv") {
      console.error("Invalid file type. Please upload a CSV file.");
      return;
    }

    console.log("Uploading CSV file:", file.name);

    // Use Papa Parse directly - just like in the working example
    Papa.parse(file, {
      header: true, // Use first row as headers
      skipEmptyLines: true, // Skip empty rows
      dynamicTyping: true, // Auto-convert numbers and booleans
      transformHeader: (header) => {
        // Sanitize header names for React Table
        return header.trim().replace(/[^\w\s.]/g, "_");
      },
      complete: async (result) => {
        console.log("CSV parse complete with", result.data.length, "rows");

        if (result.errors.length > 0) {
          console.error("CSV contains errors:", result.errors);
          // You could display these errors to the user
          return;
        }

        if (!result.data || result.data.length === 0) {
          console.error("CSV file contains no data");
          return;
        }

        // Process the data for table format
        const processedData = result.data.map((row, index) => {
          // Add an id field if not present
          const uniqueId = row.id ?? index;

          // Process each field value
          return {
            id: uniqueId,
            ...Object.fromEntries(
              Object.entries(row).map(([key, value]) => {
                // Handle special values
                if (value === "-" || value === "" || value === undefined) {
                  return [key, null];
                }

                // Clean numeric values for DuckDB
                if (
                  typeof value === "string" &&
                  !isNaN(value.replace(/[$,\s]/g, ""))
                ) {
                  return [key, value]; // Keep as string for display, DuckDB will handle conversion
                }

                return [key, value];
              })
            ),
          };
        });

        const detectColumnType = (data, key) => {
          // Sample first few rows (up to 10)
          const sample = data.slice(0, Math.min(10, data.length));

          const numericCount = sample.reduce((count, row) => {
            const val = row[key];
            if (val === null || val === undefined || val === "") return count;

            // Check if it's a number or can be converted to one
            const isNumeric =
              typeof val === "number" ||
              (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));

            return isNumeric ? count + 1 : count;
          }, 0);

          // If 70% or more values are numeric, consider it numeric
          if (numericCount / sample.length >= 0.7) return "numeric";

          return "text";
        };

        // Create columns configuration
        const parsedColumns = Object.keys(result.data[0] || {}).map((key) => ({
          id: key,
          header: key,
          accessorKey: key,
          // Add type detection for columns to help with filtering/sorting
          type: detectColumnType(result.data, key),
        }));

        // 1. FIRST update UI state
        // Reset pivot state

        console.log("Setting tableData with", processedData.length, "rows");
        console.log("Setting columns:", parsedColumns.length, "columns");
        // 1. First log the processed data to verify it looks correct
        console.log("CSV processed data:", processedData.slice(0, 3)); // Log first few rows
        console.log("CSV parsed columns:", parsedColumns);
        // Reset pivot state when loading new data
        if (setIsPivoted) setIsPivoted(false);
        if (setPivotedData) setPivotedData(null);
        if (setPivotedColumns) setPivotedColumns([]);

        // Update table data and columns
        setTableData(processedData);
        setColumns(parsedColumns);

        await prepareDuckDB(
          db,
          initializeDuckDB,
          setDuckDBStatus,
          loadDataToDuckDB,
          setDb,
          processedData // Pass the processed data here
        );
        setFileInputKey(Date.now());
      },
      error: (error) => {
        setFileInputKey(Date.now());
        console.error("CSV parsing error:", error);
      },
    });
  };

  return (
    <Button
      variant="contained"
      component="label"
      color="primary"
      disabled={disabled || duckDBStatus?.state === "loading"}
      sx={{ marginRight: "10px" }}
    >
      Upload CSV
      <input
        key={fileInputKey}
        type="file"
        accept=".csv"
        hidden
        disabled={duckDBStatus?.state === "loading"}
        onChange={handleCSVUpload}
      />
    </Button>
  );
};

export default CSVUploadButton;
