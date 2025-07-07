import { useEffect, useRef } from "react";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

const STORAGE_KEY = "pivotValueField";

const ValueFieldDropdown = ({
  valueField,
  handleValueFieldChange,
  columns = [],
}) => {
  const hasRestored = useRef(false);

  // Load value from sessionStorage on first mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      const isValid = columns.some(
        (col) => col.accessorKey === parsed || col.id === parsed
      );
      if (isValid && parsed !== valueField) {
        handleValueFieldChange({ target: { value: parsed } });
      }
    } catch (e) {
      console.warn("Invalid session data for valueField", e);
    }
}, [columns, handleValueFieldChange, valueField]);

  // Save valueField to sessionStorage on change
  useEffect(() => {
    if (valueField) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(valueField));
    }
  }, [valueField]);

  return (
    <FormControl
      size="small"
      sx={{ minWidth: 200, maxWidth: 300 }}
    >
      <InputLabel id="value-field-label">Value Field</InputLabel>
      <Select
        labelId="value-field-label"
        id="value-field"
        value={valueField}
        onChange={handleValueFieldChange}
        label="Value Field"
        displayEmpty
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
};

export default ValueFieldDropdown;
