import RowFieldsSelector from "./RowFieldsSelector";
import ColumnFieldsSelector from "./ColumnFieldsSelector";
import ValueFieldDropdown from "./ValueFieldDropdown";
import AggregateFunctionSelector from "./AggregateFunctionSelector";
import { Box } from "@mui/material";

const PivotFields = ({
  rowFields,
  columnFields,
  valueField,
  aggregateFunc,
  columns,
  handleRowFieldsChange,
  handleColumnFieldsChange,
  handleValueFieldChange,
  handleAggregateFuncChange,
  tableData,
}) => {(
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
      {/* Row Fields Selection */}
      <RowFieldsSelector
        rowFields={rowFields}
        columns={columns}
        onChange={handleRowFieldsChange}
      />
      {/* Column Fields Selection */}
      <ColumnFieldsSelector
        columnFields={columnFields}
        columns={columns}
        onChange={handleColumnFieldsChange}
      />
      <ValueFieldDropdown
        valueField={valueField}
        handleValueFieldChange={handleValueFieldChange}
        columns={columns}
        aggregateFunc={aggregateFunc}
        tableData={tableData}
      />
      {/* Aggregate Function Selection */}
      <AggregateFunctionSelector
        aggregateFunc={aggregateFunc}
        onChange={handleAggregateFuncChange}
      />
    </Box>
  );
};

export default PivotFields;
