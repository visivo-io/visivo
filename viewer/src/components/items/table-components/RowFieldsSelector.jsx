import React, { memo } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  Box,
  Chip,
} from "@mui/material";

const RowFieldsSelector = memo(({ rowFields = [], columns = [], onChange }) => {
  return (
    <FormControl sx={{ minWidth: 200, maxWidth: 300 }}>
      <InputLabel id="row-fields-label">Row Fields</InputLabel>
      <Select
        labelId="row-fields-label"
        id="row-fields"
        multiple
        value={rowFields}
        onChange={onChange}
        input={<OutlinedInput id="select-row-fields" label="Row Fields" />}
        renderValue={(selected) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {selected.map((value) => (
              <Chip
                key={value}
                label={
                  columns.find(
                    (col) => col.accessorKey === value || col.id === value
                  )?.header || value
                }
                size="small"
              />
            ))}
          </Box>
        )}
      >
        {columns.map((column) => (
          <MenuItem
            key={column.accessorKey || column.id}
            value={column.accessorKey || column.id}
          >
            {column.header}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
});

RowFieldsSelector.displayName = "RowFieldsSelector";

export default RowFieldsSelector;
