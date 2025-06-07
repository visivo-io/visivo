// hooks/usePivotState.js
import { useState, useCallback } from 'react';

export const usePivotState = () => {
  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueField, setValueField] = useState("");
  const [aggregateFunc, setAggregateFunc] = useState("COUNT");
  const [pivotLoading, setPivotLoading] = useState(false);
  const [localPivotedData, setLocalPivotedData] = useState([]);
  const [localPivotedColumns, setLocalPivotedColumns] = useState([]);
  const [localIsPivoted, setLocalIsPivoted] = useState(false);

  // Event handlers
  const handleRowFieldsChange = useCallback((event) => {
    const value = event.target.value;
    setRowFields(typeof value === "string" ? value.split(",") : value);
  }, []);

  const handleColumnFieldsChange = useCallback((event) => {
    const value = event.target.value;
    setColumnFields(typeof value === "string" ? value.split(",") : value);
  }, []);

  const handleValueFieldChange = useCallback((event) => {
    setValueField(event.target.value);
  }, []);

  const handleAggregateFuncChange = useCallback((event) => {
    setAggregateFunc(event.target.value);
  }, []);

  return {
    // State
    rowFields,
    columnFields,
    valueField,
    aggregateFunc,
    pivotLoading,
    localPivotedData,
    localPivotedColumns,
    localIsPivoted,
    
    // Setters
    setRowFields,
    setColumnFields,
    setValueField,
    setAggregateFunc,
    setPivotLoading,
    setLocalPivotedData,
    setLocalPivotedColumns,
    setLocalIsPivoted,
    
    // Handlers
    handleRowFieldsChange,
    handleColumnFieldsChange,
    handleValueFieldChange,
    handleAggregateFuncChange,
  };
};