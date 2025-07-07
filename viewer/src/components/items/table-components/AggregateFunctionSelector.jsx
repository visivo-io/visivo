import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useMemo } from "react";

const AggregateFunctionSelector = ({ 
  aggregateFunc, 
  onChange,
  aggregatableColumns = [],
  valueField = ""
}) => {
  // Determine which aggregate functions are available based on the selected field
  const availableFunctions = useMemo(() => {
    // All possible aggregate functions
    const allFunctions = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
    
    // COUNT is always available for any field type
    if (!valueField) {
      return ["COUNT"];
    }
    
    // Find the selected column in our aggregatable columns list
    const selectedColumn = aggregatableColumns.find(
      col => (col.accessorKey || col.id) === valueField
    );
    
    // If selected column is aggregatable (number), offer all functions
    // Otherwise, only offer COUNT
    return selectedColumn?.isAggregatable ? allFunctions : ["COUNT"];
  }, [aggregatableColumns, valueField]);

  return (
    <FormControl size='small' sx={{ minWidth: 200 }}>
      <InputLabel id="aggregate-function-label">Aggregate Function</InputLabel>
      <Select
        labelId="aggregate-function-label"
        id="aggregate-function"
        value={aggregateFunc}
        onChange={onChange}
        label="Aggregate Function"
      >
        {availableFunctions.map(func => (
          <MenuItem key={func} value={func}>
            {func}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default AggregateFunctionSelector;