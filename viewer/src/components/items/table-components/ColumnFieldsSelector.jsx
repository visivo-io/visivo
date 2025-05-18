import { memo, useCallback } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  Box,
  Chip,
} from "@mui/material";

const findColumnHeader = (columns, value) => 
  columns.find((col) => col.accessorKey === value || col.id === value)?.header || value;

const ColumnFieldsSelector = memo(
  ({ columnFields = [], columns = [], onChange }) => {

    const renderValue = useCallback((selected) => (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        {selected.map((value) => (
          <Chip
            key={value}
            label={findColumnHeader(columns, value)}
            size="small"
          />
        ))}
      </Box>
    ), [columns]);
    return (
      <FormControl sx={{ minWidth: 200, maxWidth: 300 }}>
        <InputLabel id="column-fields-label">Column Fields</InputLabel>
        <Select
          labelId="column-fields-label"
          id="column-fields"
          multiple
          value={columnFields}
          onChange={onChange}
          input={
            <OutlinedInput id="select-column-fields" label="Column Fields" />
          }
          renderValue={renderValue}
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
  }
);

ColumnFieldsSelector.displayName = "ColumnFieldsSelector";

export default ColumnFieldsSelector;
