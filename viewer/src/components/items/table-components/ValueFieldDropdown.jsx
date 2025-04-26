import canBeAggregated from "../table-helpers/is-aggregatable/isAggregatable";
import { FormControl } from "@mui/material";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

// TODO: Refactor this component and refactor aggregate field
// together under a parent as these are related concepts
// We need to memoize the aggregatable field and pass down
// as meta data and not have this component working it out.

const ValueFieldDropdown = ({
  valueField,
  handleValueFieldChange,
  columns = [],
  aggregateFunc,
  tableData,
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
        {columns
          .filter((column) => {
            // include all fields when using COUNT aggregation
            if (aggregateFunc === "COUNT") return true;

            // If no data, include all columns
            if (column.meta?.isAggregatable) {
              return true;
            }

            // TODO make this false when we fix the aggregate check
            return true
          })
          .map((column) => (
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
