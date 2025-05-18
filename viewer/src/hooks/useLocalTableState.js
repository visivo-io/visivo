import { useState, useCallback } from 'react';

export function useLocalTableState(initialData = [], initialColumns = []) {
  const [tableData, setTableData] = useState(initialData);
  const [columns, setColumns] = useState(initialColumns);
  
  // Update local data and notify parent (without touching the table)
  const updateTableData = useCallback((data, parentUpdateFn) => {
    console.log("Setting tableData:", data?.length);
    setTableData(data);
    if (parentUpdateFn) parentUpdateFn(data);
  }, []);
  
  // Update local columns and notify parent (without touching the table)
  const updateColumns = useCallback((cols, parentUpdateFn) => {
    console.log("Setting columns:", cols?.length);
    setColumns(cols);
    if (parentUpdateFn) parentUpdateFn(cols);
  }, []);
  
  return {
    tableData,
    columns,
    updateTableData,
    updateColumns
  };
}