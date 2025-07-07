import RowFieldsSelector from "./RowFieldsSelector";
import ColumnFieldsSelector from "./ColumnFieldsSelector";
import ValueFieldDropdown from "./ValueFieldDropdown";
import AggregateFunctionSelector from "./AggregateFunctionSelector";
import { memo, useMemo } from "react";
import detectColumnType from "../table-helpers/detectColumnType";

const NUMBER = "number";

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
    // Determine which columns are aggregatable
    const aggregatableColumns = useMemo(() => {
      if (!tableData.length) return columns;

      return columns.map(column => {
        const rawAccessorKey = column.accessorKey || column.id;
        const accessorKey = rawAccessorKey.replace(/[.]/g, "_"); // Sanitize accessor key for react rows
        const sampleRows = tableData.slice(0, 100)

        const isAggregatable = detectColumnType(sampleRows, accessorKey) === NUMBER;
        // const isAggregatable = true

        return {
          ...column,
          isAggregatable
        };
      });
    }, [columns, tableData]);

    return (
      <div className="flex flex-wrap gap-4">
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
          columns={aggregatableColumns}
          aggregateFunc={aggregateFunc}
          tableData={tableData}
        />
        <AggregateFunctionSelector
          aggregateFunc={aggregateFunc}
          onChange={handleAggregateFuncChange}
          aggregatableColumns={aggregatableColumns}
          valueField={valueField}
        />
      </div>
    );
  }
);

export default PivotFields;