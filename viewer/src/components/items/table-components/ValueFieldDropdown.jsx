import canBeAggregated from "../table-helpers/can-be-aggregated/canBeAggregated";
import { FormControl } from "@mui/material";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

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
            if (!tableData.length) return true;

            // Get the column identifiers
            const accessorKey = column.accessorKey || column.id;
            const header = column.header;

            // Look for case-insensitive matches for y amount/y ammount
            if (
              header &&
              (header.toLowerCase().includes("y amount") ||
                header.toLowerCase().includes("y ammount"))
            ) {
              return true; // Always include y amount fields
            }

            // Try to find the actual key in the data
            const actualKey = Object.keys(tableData[0] || {}).find(
              (key) =>
                key === accessorKey ||
                key.replace(/\./g, "___") === accessorKey ||
                key.replace(/___/g, ".") === accessorKey
            );

            if (actualKey) {
              // Check if any values can be aggregated for this column
              return tableData.some((row) => canBeAggregated(row[actualKey]));
            }

            // Try matching by header
            const headerMatchKey = Object.keys(tableData[0] || {}).find(
              (key) =>
                key === header ||
                key.toLowerCase().includes(header.toLowerCase())
            );

            if (headerMatchKey) {
              return tableData.some((row) =>
                canBeAggregated(row[headerMatchKey])
              );
            }

            return false;
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
