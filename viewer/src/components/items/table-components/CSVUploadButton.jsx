import { useState, useCallback } from "react";
import { Button } from "@mui/material";
import { parseCSVFile } from "./csvParsing";

const CSVUploadButton = ({
  disabled,
  duckDBStatus,
  db,
  loadDataToDuckDB,
  setTableData,
  setColumns,
  setDb,
  setIsPivoted,
  setPivotedData,
  setPivotedColumns,
  initializeDuckDB,
  onError,
}) => {
  const [fileInputKey, setFileInputKey] = useState(Math.random());
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCSVUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Prevent multiple processing attempts
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Use the extracted parsing utility
      const { data, columns } = await parseCSVFile(file);
      
      // Reset pivot state if needed
      if (setIsPivoted) setIsPivoted(false);
      if (setPivotedData) setPivotedData(null);
      if (setPivotedColumns) setPivotedColumns([]);

      // Update table data and columns
      setTableData(data);
      setColumns(columns);

      // Handle DuckDB operations
      if (db && loadDataToDuckDB) {
        await loadDataToDuckDB(db, data);
      } else if (initializeDuckDB && loadDataToDuckDB && setDb) {
        try {
          const dbInstance = await initializeDuckDB();
          if (dbInstance) {
            setDb(dbInstance);
            await loadDataToDuckDB(dbInstance, data);
          }
        } catch (error) {
          console.error("Failed to initialize DuckDB:", error);
          if (onError) onError(error);
        }
      }
    } catch (err) {
      console.error("Error processing CSV:", err);
      if (onError) onError(err);
    } finally {
      setFileInputKey(Math.random() + Date.now());
      setIsProcessing(false);
    }
  }, [
    isProcessing, setColumns, setTableData, setIsPivoted,
    setPivotedData, setPivotedColumns, db, loadDataToDuckDB,
    initializeDuckDB, setDb, onError
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