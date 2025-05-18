// In parent component (PivotColumnSelection or Table.jsx)
const handleCSVUploaded = useCallback(async ({ data, columns }) => {
  // First, update component state for better UX
  if (setIsPivoted) setIsPivoted(false);
  if (setPivotedData) setPivotedData(null);
  if (setPivotedColumns) setPivotedColumns([]);

  // Update table data in a controlled way
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
    }
  }
}, [setIsPivoted, setPivotedData, setPivotedColumns, setTableData, setColumns, 
    db, loadDataToDuckDB, initializeDuckDB, setDb]);

return (
  <CSVUploadButton
    disabled={yourDisabledLogic}
    isLoading={isLoadingDuckDB || duckDBStatus?.state === "loading"}
    onCSVUploaded={handleCSVUploaded}
  />
);