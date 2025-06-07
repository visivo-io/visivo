import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

const ValueFieldDropdown = ({
  valueField,
  handleValueFieldChange,
  columns = [],
}) => {
  return (
    <FormControl sx={{ minWidth: 200 }}>
      <InputLabel id="value-field-label">Value Field</InputLabel>
      <Select
        labelId="value-field-label"
        id="value-field"
        value={valueField}
        onChange={handleValueFieldChange}
        label="Value Field"
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