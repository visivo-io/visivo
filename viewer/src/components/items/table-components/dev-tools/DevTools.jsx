import { Box, Button, Typography, Drawer, TextField } from "@mui/material";
import CSVUploadButton from "../CSVUploadButton";
import DuckDBStatus from "../DuckDBStatus";

const DevTools = ({
  isDevMode,
  debugInformation,
  duckDBStatus,
  db,
  onForceUpdate,
  canForceUpdate,
  onToggleQueryDrawer,
  showQueryDrawer,
  // Query drawer props
  customQuery,
  setCustomQuery,
  runCustomQuery,
  // Debug data
  tableData,
  columns,
  pivotState,
  // CSV upload props
  setIsPivoted,
  setPivotedData,
  setPivotedColumns,
  useTable,
  loadDataToDuckDB,
  setDb,
  setColumns,
  setTableData
}) => {
  if (!isDevMode) return null;

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        
        {/* Debug Information Panel */}
        {debugInformation && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              border: "1px dashed #ccc",
              backgroundColor: "#f9f9f9",
              fontSize: "0.8rem",
            }}
          >
            <Typography variant="subtitle2">Debug Information:</Typography>
            <div>• TableData rows: {tableData?.length || 0}</div>
            <div>• Available columns: {columns?.length || 0}</div>
            <div>• Pivot status: {pivotState?.localIsPivoted ? "Active" : "Inactive"}</div>
            <div>• Pivoted data rows: {pivotState?.localPivotedData?.length || 0}</div>
            {pivotState?.localPivotedData?.length > 0 && (
              <div>
                • First pivoted item:{" "}
                {JSON.stringify(Object.keys(pivotState.localPivotedData[0]).slice(0, 2))}
              </div>
            )}
          </Box>
        )}

        {/* Dev Tools Buttons */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap"
          }}
        >
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
            duckDBStatus={duckDBStatus}
            setIsPivoted={setIsPivoted}
            setPivotedData={setPivotedData}
            setPivotedColumns={setPivotedColumns}
            db={db}
            useTable={useTable}
            loadDataToDuckDB={loadDataToDuckDB}
            setDb={setDb}
            setColumns={setColumns}
            setTableData={setTableData}
          />

          <Button
            disabled={duckDBStatus.state === "loading" || !db}
            variant="contained"
            onClick={onToggleQueryDrawer}
          >
            {showQueryDrawer ? "Hide Query Input" : "Show Custom Query Input Screen"}
          </Button>

          <DuckDBStatus duckDBStatus={duckDBStatus} db={db} />
        </Box>
      </Box>

      {/* Query Drawer - moved inside DevTools */}
      <Drawer
        anchor="right"
        open={showQueryDrawer}
        onClose={onToggleQueryDrawer}
      >
        <Box
          sx={{
            width: 300,
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
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
            sx={{ marginBottom: "10px" }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={runCustomQuery}
            disabled={!customQuery.trim()}
          >
            Run Query
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={onToggleQueryDrawer}
          >
            Close Query
          </Button>
        </Box>
      </Drawer>
    </>
  );
};

export default DevTools;