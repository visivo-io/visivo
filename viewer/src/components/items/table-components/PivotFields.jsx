import RowFieldsSelector from "./RowFieldsSelector";
import ColumnFieldsSelector from "./ColumnFieldsSelector";
import ValueFieldDropdown from "./ValueFieldDropdown";
import AggregateFunctionSelector from "./AggregateFunctionSelector";
import { Box } from "@mui/material";
import { memo } from "react";

const PivotFields = memo(
  ({
    rowFields = [],
    columnFields = [],
    valueField = "",
    aggregateFunc = "SUM",
    columns = [],
    handleRowFieldsChange,
    handleColumnFieldsChange,
    handleValueFieldChange,
    handleAggregateFuncChange,
    tableData = [],
  }) => {
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <RowFieldsSelector
          rowFields={rowFields}
          columns={columns}
          onChange={handleRowFieldsChange}
        />
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
        <AggregateFunctionSelector
          aggregateFunc={aggregateFunc}
          onChange={handleAggregateFuncChange}
        />
      </Box>
    );
  }
);

export default PivotFields;
