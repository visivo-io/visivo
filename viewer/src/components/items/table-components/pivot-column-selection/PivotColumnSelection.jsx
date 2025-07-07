import {
  Button,
} from "@mui/material";
import { memo, useRef } from "react";
import { useState, useCallback, useEffect } from "react";
import PivotFields from "../PivotFields";
import { useDuckDBInitialization } from "../../../../hooks/useDuckDb";
import { useLoadDataToDuckDB } from "../../../../hooks/useLoadDataToDuckDb";
import { usePivotState } from "../../../../hooks/usePivotState";
import { usePivotExecution } from "../../../../hooks/usePivotExecution";
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
  const [isDevMode] = useState(false); // set to true for development mode
  const dataLoadedRef = useRef(false);

  const {
    db,
    isLoadingDuckDB,
    setIsLoadingDuckDB,
    duckDBStatus,
  } = useDuckDBInitialization();
  const { executePivot: executePivotLogic } = usePivotExecution(db);

  const loadDataToDuckDB = useLoadDataToDuckDB({
    setIsLoadingDuckDB,
    tableData,
  });

  useEffect(() => {
    if (db && tableData && tableData.length > 0 && !isLoadingDuckDB && !dataLoadedRef.current) {

      loadDataToDuckDB(db, tableData)
      dataLoadedRef.current = true;
    }
  }, [db, tableData, isLoadingDuckDB, loadDataToDuckDB]);

  useEffect(() => {
    dataLoadedRef.current = false;
  }, [tableData]);

  const updatePivotData = useCallback((data, columns) => {
    pivotState.setLocalPivotedData(data);
    pivotState.setLocalPivotedColumns(columns);
    pivotState.setLocalIsPivoted(true);

    if (setPivotedData) setPivotedData(data);
    if (setPivotedColumns) setPivotedColumns(columns);
    if (setIsPivoted) setIsPivoted(true);
  }, [setPivotedData, setPivotedColumns, setIsPivoted, pivotState]);

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

  const handleSetColumns = useCallback((cols) => {
    setColumns(cols);
    if (setColumnsFromParent) setColumnsFromParent(cols);
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
    setTableData(data);
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
    <div className="flexp-[10px] bg-[#f5f5f5] rounded">
      <div className="flex flex-col bg-[#f5f5f5] rounded">
        <DevTools
          isDevMode={isDevMode}
          debugInformation={true}
          duckDBStatus={duckDBStatus}
          db={db}
          onForceUpdate={handleForceUpdate}
          canForceUpdate={pivotState.localPivotedData.length > 0}
          tableData={tableData}
          columns={columns}
          pivotState={pivotState}
          setIsPivoted={setIsPivoted}
          setPivotedData={(data) => setPivotedData(data || [])}
          setPivotedColumns={(cols) => setPivotedColumns(cols || [])}
          useTable={useTableFromParent}
          loadDataToDuckDB={loadDataToDuckDB}
          setColumns={handleSetColumns}
          setTableData={handleSetTableData}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-[#f5f5f5] p-[10px] rounded">
        <PivotFields
          rowFields={pivotState.rowFields}
          columnFields={pivotState.columnFields}
          valueField={pivotState.valueField}
          aggregateFunc={pivotState.aggregateFunc}
          tableData={tableData}
          columns={columns}
          handleRowFieldsChange={pivotState.handleRowFieldsChange}
          handleColumnFieldsChange={pivotState.handleColumnFieldsChange}
          handleValueFieldChange={pivotState.handleValueFieldChange}
          handleAggregateFuncChange={pivotState.handleAggregateFuncChange}
        />
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button
            variant="contained"
            color="primary"
            title="Group your data by rows and columns, pick a value to aggregate, and choose an aggregation method (like sum or average)."
            disabled={
              !pivotState.valueField ||
              pivotState.rowFields.length === 0 ||
              !db ||
              pivotState.pivotLoading
            }
            onClick={executePivot}
          >
            {pivotState.pivotLoading
              ? "Processing..."
              : pivotState.localIsPivoted
                ? "Update Pivot"
                : "Apply Pivot"}
          </Button>

          <Button
            variant="outlined"
            title="Restore the original unpivoted table view."
            disabled={!pivotState.localIsPivoted}
            onClick={resetPivotData}
          >
            Reset to Original
          </Button>
        </div>
      </div>
    </div>
  );
};

export default memo(PivotColumnSelection);
