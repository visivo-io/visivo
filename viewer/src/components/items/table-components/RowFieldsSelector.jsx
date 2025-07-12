import {
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  Chip,
} from "@mui/material";
import { memo } from "react";

const RowFieldsSelector = memo(({ rowFields = [], columns = [], onChange }) => {
  return (
    <FormControl
      size="small"
      sx={{ minWidth: 200, maxWidth: 300 }}
    >
      <InputLabel id="row-fields-label">Row Fields</InputLabel>
      <Select
        labelId="row-fields-label"
        id="row-fields"
        multiple
        value={rowFields}
        onChange={onChange}
        input={<OutlinedInput id="select-row-fields" label="Row Fields" />}
        renderValue={(selected) => (
          <div className="flex flex-wrap gap-0.5">
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
          </div>
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
