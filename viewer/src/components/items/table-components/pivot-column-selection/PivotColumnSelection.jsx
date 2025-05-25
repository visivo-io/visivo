import {
  Box,
  Button,
} from "@mui/material";
import { memo, useRef } from "react";
import { useState, useCallback, useEffect } from "react";
import PivotFields from "../PivotFields";
import { useDuckDBInitialization } from "../../../../hooks/useDuckDb";
import { useLoadDataToDuckDB } from "../../../../hooks/useLoadDataToDuckDb";
import { usePivotState } from "../../../../hooks/usePivotState";
import { usePivotExecution } from "../../../../hooks/usePivotExecution";
import { useDevTools } from "../../../../hooks/useDevTools";
import DevTools from "../dev-tools/DevTools";

const PivotColumnSelection = ({
  initialData = [],
  initialColumns = [],
  setPivotedColumns,
  setPivotedData,
  setIsPivoted,
  setColumns: setColumnsFromParent,
  setTableData: setTableDataFromParent,
  useTable: useTableFromParent,
}) => {
  const pivotState = usePivotState();

  const [tableData, setTableData] = useState(initialData);
  const [columns, setColumns] = useState(initialColumns);
  const dataLoadedRef = useRef(false);

  const {
    db,
    setDb,
    isLoadingDuckDB,
    setIsLoadingDuckDB,
    duckDBStatus,
  } = useDuckDBInitialization();
  const { executePivot: executePivotLogic } = usePivotExecution(db);

  const { 
    isDevMode, 
    debugInformation, 
    customQuery, 
    setCustomQuery, 
    showQueryDrawer, 
    toggleQueryDrawer, 
    runCustomQuery 
  } = useDevTools(db);

  const loadDataToDuckDB = useLoadDataToDuckDB({
    setIsLoadingDuckDB,
    tableData,
  });
  // Fix: Only load data once instead of on every render
  useEffect(() => {
    if (db && tableData && tableData.length > 0 && !isLoadingDuckDB && !dataLoadedRef.current) {
      // Mark as loaded to prevent reload
      dataLoadedRef.current = true;

    }
  }, [db, tableData, isLoadingDuckDB]);

  useEffect(() => {
    dataLoadedRef.current = false;
  }, [tableData]);

  const updatePivotData = useCallback((data, columns) => {
    // Update local state
    pivotState.setLocalPivotedData(data);
    pivotState.setLocalPivotedColumns(columns);
    pivotState.setLocalIsPivoted(true);

    // Notify parent - directly, no need for an effect
    if (setPivotedData) setPivotedData(data);
    if (setPivotedColumns) setPivotedColumns(columns);
    if (setIsPivoted) setIsPivoted(true);
  }, [setPivotedData, setPivotedColumns, setIsPivoted, pivotState]);

  // Reset pivot data - both local and parent
  const resetPivotData = useCallback(() => {
    pivotState.setLocalPivotedData([]);
    pivotState.setLocalPivotedColumns([]);

    if (setIsPivoted) setIsPivoted(false);
    if (setPivotedData) setPivotedData([]);
    if (setPivotedColumns) setPivotedColumns([]);
  }, [setIsPivoted, setPivotedData, setPivotedColumns, pivotState]);

  const executePivot = useCallback(async () => {
    await executePivotLogic({
      rowFields: pivotState.rowFields,
      columnFields: pivotState.columnFields,
      valueField: pivotState.valueField,
      aggregateFunc: pivotState.aggregateFunc,
      setPivotLoading: pivotState.setPivotLoading,
      onPivotComplete: updatePivotData
    });
  }, [executePivotLogic, pivotState, updatePivotData]);


    const handleForceUpdate = useCallback(() => {
    if (pivotState.localPivotedData.length > 0) {
      updatePivotData(pivotState.localPivotedData, pivotState.localPivotedColumns);
    }
  }, [pivotState, updatePivotData]);

  // ADD THESE MISSING FUNCTIONS:
  const handleSetColumns = useCallback((cols) => {
    // Update local state
    setColumns(cols);
    // Update parent state
    if (setColumnsFromParent) setColumnsFromParent(cols);
    // Update Material React Table directly
    if (useTableFromParent && useTableFromParent.setOptions) {
      useTableFromParent.setOptions((prev) => ({
        ...prev,
        columns: cols.map((col) => ({
          accessorKey: col.accessorKey || col.id,
          header: col.header,
          id: col.id,
        })),
      }));
    }
  }, [setColumns, setColumnsFromParent, useTableFromParent]);

  const handleSetTableData = useCallback((data) => {
    // Update local state
    setTableData(data);
    // Update parent state
    if (setTableDataFromParent) setTableDataFromParent(data);
    // Update Material React Table directly
    if (useTableFromParent && useTableFromParent.setOptions) {
      useTableFromParent.setOptions((prev) => ({
        ...prev,
        data: data,
      }));
      // Reset pagination to first page
      useTableFromParent.setPageIndex(0);
      useTableFromParent.resetColumnFilters();
      useTableFromParent.resetSorting();
    }
  }, [setTableData, setTableDataFromParent, useTableFromParent]);
  return (
    <Box
      sx={{
        padding: "10px",
        backgroundColor: "#f5f5f5",
        borderRadius: "4px",
        marginBottom: "10px",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "20px", // Add space between DuckDB status and Pivot Table Options
            padding: "10px",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
            marginBottom: "10px",
          }}
        >
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <DevTools
            isDevMode={isDevMode}
            debugInformation={debugInformation}
            duckDBStatus={duckDBStatus}
            db={db}
            onForceUpdate={handleForceUpdate}
            canForceUpdate={pivotState.localPivotedData.length > 0}
            onToggleQueryDrawer={() => toggleQueryDrawer(!showQueryDrawer)()} // Fix this line
            showQueryDrawer={showQueryDrawer}
            customQuery={customQuery}
            setCustomQuery={setCustomQuery}
            runCustomQuery={runCustomQuery}
            tableData={tableData}
            columns={columns}
            pivotState={pivotState}
            setIsPivoted={setIsPivoted}
            setPivotedData={(data) => setPivotedData(data || [])}
            setPivotedColumns={(cols) => setPivotedColumns(cols || [])}
            useTable={useTableFromParent}
            loadDataToDuckDB={loadDataToDuckDB}
            setDb={setDb}
            setColumns={handleSetColumns}
            setTableData={handleSetTableData}
          />
        </Box>
        
        <PivotFields
          rowFields={pivotState.rowFields}
          columnFields={pivotState.columnFields}
          valueField={pivotState.valueField}
          aggregateFunc={pivotState.aggregateFunc}
          columns={columns}
          handleRowFieldsChange={pivotState.handleRowFieldsChange}
          handleColumnFieldsChange={pivotState.handleColumnFieldsChange}
          handleValueFieldChange={pivotState.handleValueFieldChange}
          handleAggregateFuncChange={pivotState.handleAggregateFuncChange}
        />
        <Button
          variant="contained"
          color="primary"
          disabled={
            !pivotState.valueField || pivotState.rowFields.length === 0 || !db || pivotState.pivotLoading
          }
          onClick={executePivot}
        >
          {pivotState.pivotLoading
            ? "Processing..."
            : pivotState.localIsPivoted
              ? "Update Pivot"
              : "Apply Pivot"}
        </Button>
        {pivotState.localIsPivoted && (
          <Button variant="outlined" onClick={resetPivotData}>
            Reset to Original
          </Button>
        )}
        <Box sx={{ mt: 1, fontSize: "0.85rem", fontStyle: "italic" }}>
          Select row and column fields to group by, a value field to aggregate,
          and an aggregation function.
        </Box>
      </Box>
    </Box>
  );
};

export default memo(PivotColumnSelection);
