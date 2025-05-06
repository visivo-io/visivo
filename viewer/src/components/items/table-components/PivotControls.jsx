const PivotControls = ({
  pivotLoading,
  executePivot,
  duckDBLoaded,
  csvParser,
  setTableData,
  setColumns,
  setPivotedData,
  setPivotedColumns,
  setIsPivoted,
  useTable,
  setShowQueryDrawer,
  showQueryDrawer,
  isPivoted,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: "10px",
      }}
    >
      <Button
        variant="contained"
        color="primary"
        disabled={!hasRowFields}
        onClick={executePivot}
      >
        {pivotLoading ? "Processing..." : "Apply Pivot"}
      </Button>
      <Button
        variant="contained"
        component="label"
        color="primary"
        disabled={!duckDBLoaded}
        sx={{ marginRight: "10px" }}
      >
        Upload CSV
        <input
          type="file"
          accept=".csv"
          hidden
          onChange={(event) => {
            csvParser.handleFileUpload(event, {
              setTableData,
              setColumns,
              setPivotedData,
              setPivotedColumns,
              setIsPivoted,
              useTable,
            });
          }}
        />
      </Button>
      <Button
        variant="outlined"
        onClick={() => {
          console.log("Button clicked");
          setShowQueryDrawer((prev) => !showQueryDrawer);
        }}
      >
        {showQueryDrawer
          ? "Hide Query Input"
          : "Show Custom Query Input Screen"}
      </Button>

      {isPivoted && (
        <Button
          variant="outlined"
          onClick={() => {
            setIsPivoted(false);
          }}
        >
          Reset to Original
        </Button>
      )}
    </Box>
  );
};

export default PivotControls;
