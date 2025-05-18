import React, { useState, useCallback } from "react";
import { Button } from "@mui/material";
import Papa from "papaparse";

// Move to external utility if needed elsewhere
const detectColumnType = (data, key) => {
  const sampleSize = Math.min(10, data.length);
  const sample = [];
  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * data.length);
    sample.push(data[randomIndex]);
  }

  const numericCount = sample.reduce((count, row) => {
    const val = row[key];
    if (val === null || val === undefined || val === "") return count;

    const isNumeric =
      typeof val === "number" ||
      (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));

    return isNumeric ? count + 1 : count;
  }, 0);

  if (numericCount / sample.length >= 0.8) return "numeric";
  return "text";
};

const CSVUploadButton = ({
  disabled,
  duckDBStatus,
  db,
  loadDataToDuckDB,
  setTableData,
  setColumns,
  useTable,
  setDb,
  setIsPivoted,
  setPivotedData,
  setPivotedColumns,
  initializeDuckDB,
}) => {
  const [fileInputKey, setFileInputKey] = useState(Math.random());
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Use useCallback to prevent recreation of this function on each render
  const handleCSVUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "text/csv") return;
    
    // Prevent multiple processing attempts
    if (isProcessing) return;
    setIsProcessing(true);
    
    // Use Papa Parse to parse the CSV
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header) => {
        return header.trim().replace(/[^\w\s.]/g, "_");
      },
      complete: async (result) => {
        try {
          if (result.errors.length > 0 || !result.data || result.data.length === 0) {
            return;
          }

          // Process the data for table format (avoid excessive logging)
          const processedData = result.data.map((row, index) => {
            const uniqueId = row.id ?? index;
            return {
              id: uniqueId,
              ...Object.fromEntries(
                Object.entries(row).map(([key, value]) => {
                  if (value === "-" || value === "" || value === undefined) {
                    return [key, null];
                  }
                  if (typeof value === "string" && !isNaN(value.replace(/[$,\s]/g, ""))) {
                    return [key, value];
                  }
                  return [key, value];
                })
              ),
            };
          });

          // Create columns configuration
          const parsedColumns = Object.keys(result.data[0] || {}).map((key) => ({
            id: key,
            header: key,
            accessorKey: key,
            type: detectColumnType(result.data, key),
          }));

          // Temporary disable console logging 
          const originalConsoleLog = console.log;
          const originalConsoleError = console.error;
          
          // CRITICAL: Temporarily disable console logging during DuckDB operations
          // to break the render feedback loop
          if (process.env.NODE_ENV !== 'development') {
            console.log = () => {};
            console.error = () => {};
          }
          
          try {
            // First, update component state for better UX
            if (setIsPivoted) setIsPivoted(false);
            if (setPivotedData) setPivotedData(null);
            if (setPivotedColumns) setPivotedColumns([]);
            
            // Update table data in a controlled way
            setTableData(processedData);
            setColumns(parsedColumns);
            
            // Handle DuckDB in a throttled way
            setTimeout(async () => {
              if (db && loadDataToDuckDB) {
                await loadDataToDuckDB(db, processedData);
              } else if (initializeDuckDB && loadDataToDuckDB && setDb) {
                try {
                  const dbInstance = await initializeDuckDB();
                  if (dbInstance) {
                    setDb(dbInstance);
                    await loadDataToDuckDB(dbInstance, processedData);
                  }
                } catch (error) {
                  // Silent fail
                }
              }
            }, 100); // Small delay to break the render cycle
          } finally {
            // Restore console functions
            if (process.env.NODE_ENV !== 'development') {
              console.log = originalConsoleLog;
              console.error = originalConsoleError;
            }
          }
        } catch (err) {
          // Silent fail in production
        } finally {
          setFileInputKey(Math.random() + Date.now()); // More unique key
          setIsProcessing(false);
        }
      },
      error: () => {
        setFileInputKey(Math.random() + Date.now());
        setIsProcessing(false);
      },
    });
  }, [
    isProcessing, setColumns, setTableData, setIsPivoted,
    setPivotedData, setPivotedColumns, db, loadDataToDuckDB, 
    initializeDuckDB, setDb
  ]);

  return (
    <Button
      variant="contained"
      component="label"
      color="primary"
      disabled={disabled || isProcessing || duckDBStatus?.state === "loading"}
      sx={{ marginRight: "10px" }}
    >
      {isProcessing ? "Processing..." : "Upload CSV"}
      <input
        key={fileInputKey}
        type="file"
        accept=".csv"
        hidden
        disabled={isProcessing || duckDBStatus?.state === "loading"}
        onChange={handleCSVUpload}
      />
    </Button>
  );
};

export default CSVUploadButton;