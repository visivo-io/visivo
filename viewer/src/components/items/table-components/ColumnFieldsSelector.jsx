import { useEffect, memo, useCallback, useRef } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  Chip,
} from "@mui/material";

const STORAGE_KEY = "pivotColumnFields";

const findColumnHeader = (columns, value) =>
  columns.find((col) => col.accessorKey === value || col.id === value)?.header || value;

const ColumnFieldsSelector = memo(({ columnFields = [], columns = [], onChange }) => {
  const hasRestored = useRef(false);

  // Restore selection from sessionStorage on first mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;

      const validFields = parsed.filter((field) =>
        columns.some((col) => col.accessorKey === field || col.id === field)
      );

      if (
        validFields.length > 0 &&
        JSON.stringify(validFields) !== JSON.stringify(columnFields)
      ) {
        onChange({ target: { value: validFields } });
      }
    } catch (e) {
      console.warn("Invalid session data for column fields", e);
    }
  }, [columnFields, columns, onChange]);

  // Persist on change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(columnFields));
  }, [columnFields]);

  const renderValue = useCallback(
    (selected) => (
      <div className="flex flex-wrap gap-4">
        {selected.map((value) => (
          <Chip
            key={value}
            label={findColumnHeader(columns, value)}
            size="small"
          />
        ))}
      </div>
    ),
    [columns]
  );

  return (
    <FormControl
      size="small"
      sx={{ minWidth: 200, maxWidth: 300 }}
    >
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
});

ColumnFieldsSelector.displayName = "ColumnFieldsSelector";

export default ColumnFieldsSelector;
