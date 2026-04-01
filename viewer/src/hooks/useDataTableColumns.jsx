import { useMemo } from 'react';
import DataTableHeader from '../components/common/DataTableHeader';
import DataTableCell from '../components/common/DataTableCell';
import DataTableGroupHeader from '../components/common/DataTableGroupHeader';
import { calculateColumnWidth } from '../duckdb/schemaUtils';
import { COLUMN_TYPES } from '../duckdb/schemaUtils';

const MIN_RESIZE_WIDTH = 60;

export const useDataTableColumns = ({ columns, nestedColumns, sorting, onSortChange, onColumnProfileRequest }) => {
  return useMemo(() => {
    if (nestedColumns) {
      return attachRenderers(nestedColumns, { sorting, onSortChange, onColumnProfileRequest });
    }

    return columns.map(col => buildLeafColumnDef(col, { sorting, onSortChange, onColumnProfileRequest }));
  }, [columns, nestedColumns, sorting, onSortChange, onColumnProfileRequest]);
};

function buildLeafColumnDef(col, { sorting, onSortChange, onColumnProfileRequest }) {
  return {
    id: col.name,
    accessorKey: col.name,
    header: () => (
      <DataTableHeader
        column={col}
        sorting={sorting}
        onSortChange={onSortChange}
        onInfoClick={onColumnProfileRequest}
      />
    ),
    cell: ({ getValue }) => (
      <DataTableCell value={getValue()} columnType={col.normalizedType} />
    ),
    size: calculateColumnWidth(col.displayName || col.name, col.normalizedType),
    minSize: MIN_RESIZE_WIDTH,
    meta: { isPivotRow: col.isPivotRow || false },
  };
}

function attachRenderers(columnDefs, opts) {
  return columnDefs.map(def => {
    if (def.columns) {
      // Group header
      return {
        id: def.id,
        header: () => <DataTableGroupHeader label={def.header} />,
        meta: { isGroupHeader: true },
        columns: attachRenderers(def.columns, opts),
      };
    }

    // Leaf column — build a column metadata object matching the flat column shape
    const col = {
      name: def.accessorKey || def.id,
      displayName: def.displayName || def.header || def.id,
      normalizedType: COLUMN_TYPES.UNKNOWN,
      duckdbType: 'VARCHAR',
      isPivotRow: def.meta?.isPivotRow || false,
    };

    return buildLeafColumnDef(col, opts);
  });
}
