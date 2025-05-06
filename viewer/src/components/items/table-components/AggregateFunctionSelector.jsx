import React, { memo } from "react";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";

const AggregateFunctionSelector = memo(({ aggregateFunc, onChange }) => {
  return (
    <FormControl sx={{ minWidth: 150 }}>
      <InputLabel id="aggregate-func-label">Aggregate</InputLabel>
      <Select
        labelId="aggregate-func-label"
        id="aggregate-func"
        value={aggregateFunc}
        onChange={onChange}
        label="Aggregate"
      >
        <MenuItem value="SUM">Sum</MenuItem>
        <MenuItem value="AVG">Average</MenuItem>
        <MenuItem value="COUNT">Count</MenuItem>
        <MenuItem value="MIN">Min</MenuItem>
        <MenuItem value="MAX">Max</MenuItem>
      </Select>
    </FormControl>
  );
});

AggregateFunctionSelector.displayName = "AggregateFunctionSelector";

export default AggregateFunctionSelector;
