import { Box, Button, Typography, Drawer, TextField } from "@mui/material";
import CSVUploadButton from "../CSVUploadButton";
import DuckDBStatus from "../DuckDBStatus";
import { useState, useCallback } from "react";

const DevTools = ({
  isDevMode,
  debugInformation,
  duckDBStatus,
  db,
  onForceUpdate,
  canForceUpdate,
  tableData,
  columns,
  pivotState,
  setIsPivoted,
  setPivotedData,
  setPivotedColumns,
  loadDataToDuckDB,
  setColumns,
  setTableData
}) => {
  // Internal state for CSV upload
  const [isUploadProcessing, setIsUploadProcessing] = useState(false);

  // Internal state for query drawer - no need to pass these down!
  const [customQuery, setCustomQuery] = useState("");
  const [showQueryDrawer, setShowQueryDrawer] = useState(false);

  // Internal query functions
  const toggleQueryDrawer = useCallback(() => {
    setShowQueryDrawer(prev => !prev);
  }, []);

  const runCustomQuery = useCallback(async () => {
    if (!db) {
      console.error("DuckDB is not initialized.");
      return;
    }

    try {
      const conn = await db.connect();
      const result = await conn.query(customQuery);
      const data = await result.toArray();

      // Convert BigInt values for logging
      const bigIntReplacer = (key, value) => {
        if (typeof value === "bigint") return Number(value);
        if (typeof value === "string" && !isNaN(value)) return Number(value);
        return value;
      };

      console.log(
        "Query result (viewable):",
        JSON.stringify(data, bigIntReplacer, 2)
      );
      await conn.close();
    } catch (error) {
      console.error("Error executing query:", error);
    }
  }, [db, customQuery]);

  const handleCSVUpload = useCallback(async ({ data, columns, fileName }) => {
    setIsUploadProcessing(true);

    try {
      // Reset pivot state
      if (setIsPivoted) setIsPivoted(false);
      if (setPivotedData) setPivotedData([]);
      if (setPivotedColumns) setPivotedColumns([]);

      // Update table data and columns
      setTableData(data);
      setColumns(columns);

      // Handle DuckDB operations
      if (db && loadDataToDuckDB) {
        await loadDataToDuckDB(db, data);
      } else {
        console.log("No DB instance available - parent should initialize");
      }
      console.log(`Successfully loaded ${fileName} with ${data.length} rows`);
    } catch (error) {
      console.error("Error loading CSV data:", error);
    } finally {
      setIsUploadProcessing(false);
    }
  }, [db, loadDataToDuckDB, setTableData, setColumns, setIsPivoted, setPivotedData, setPivotedColumns]);

  if (!isDevMode) return null;

  return (
    <>
      <div className="flex flex-col gap-[10px]">
        {/* Debug Information Panel */}
        {debugInformation && (
          <div className="mb-2 p-2 border border-dashed border-[#ccc] bg-[#f9f9f9] text-[0.8rem]">
            <Typography variant="subtitle2">Debug Information:</Typography>
            <div>• TableData rows: {tableData?.length || 0}</div>
            <div>• Available columns: {columns?.length || 0}</div>
            <div>
              • Pivot status:{" "}
              {pivotState?.localIsPivoted ? "Active" : "Inactive"}
            </div>
            <div>
              • Pivoted data rows: {pivotState?.localPivotedData?.length || 0}
            </div>
            {pivotState?.localPivotedData?.length > 0 && (
              <div>
                • First pivoted item:{" "}
                {JSON.stringify(
                  Object.keys(pivotState.localPivotedData[0]).slice(0, 2)
                )}
              </div>
            )}
          </div>
        )}

        {/* Dev Tools Buttons */}
        <div className="flex justify-between gap-[10px] flex-wrap">
          <Button
            variant="contained"
            color="secondary"
            size="small"
            onClick={onForceUpdate}
            disabled={!canForceUpdate}
          >
            Force Update Parent Table
          </Button>

          <CSVUploadButton
            disabled={duckDBStatus.state === "loading"}
            isProcessing={isUploadProcessing}
            onFileUpload={handleCSVUpload}
            onError={(error) => console.error("CSV Upload Error:", error)}
          />

          <Button
            disabled={duckDBStatus.state === "loading" || !db}
            variant="contained"
            onClick={toggleQueryDrawer}
          >
            {showQueryDrawer
              ? "Hide Query Input"
              : "Show Custom Query Input Screen"}
          </Button>

          <DuckDBStatus duckDBStatus={duckDBStatus} db={db} />
        </div>
      </div>

      {/* Query Drawer */}
      <Drawer anchor="right" open={showQueryDrawer} onClose={toggleQueryDrawer}>
        <div className="w-[300px] p-[20px] flex flex-col gap-[10px]">
          <Typography variant="h6">Run Custom SQL Query</Typography>
          <Typography variant="body2" color="textSecondary">
            Note: Query results will be displayed in the browser console.
          </Typography>
          <TextField
            label="SQL Query"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            className="mb-[10px]"
          />
          <Button
            variant="contained"
            color="primary"
            onClick={runCustomQuery}
            disabled={!customQuery.trim()}
          />
          <Button variant="outlined" color="secondary" onClick={toggleQueryDrawer}>
            Close Query
          </Button>
        </div>
      </Drawer>
    </>
  );
};

export default DevTools;