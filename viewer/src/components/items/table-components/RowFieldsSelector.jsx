import { useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  Chip,
} from "@mui/material";
import { memo } from "react";

const STORAGE_KEY = "pivotRowFields";

const RowFieldsSelector = memo(({ rowFields = [], columns = [], onChange }) => {
  // Load from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // ensure fields still exist in current columns
          const validFields = parsed.filter((field) =>
            columns.some(
              (col) => col.accessorKey === field || col.id === field
            )
          );
          if (validFields.length > 0) {
            onChange({ target: { value: validFields } });
          }
        }
      } catch (e) {
        console.warn("Invalid session data for row fields", e);
      }
    }
  }, [columns, onChange]);

  // Save to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rowFields));
  }, [rowFields]);

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
