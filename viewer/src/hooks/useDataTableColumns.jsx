import { useMemo } from 'react';
import DataTableHeader from '../components/common/DataTableHeader';
import DataTableCell from '../components/common/DataTableCell';
import DataTableGroupHeader from '../components/common/DataTableGroupHeader';
import { calculateColumnWidth } from '../duckdb/schemaUtils';
import { COLUMN_TYPES } from '../duckdb/schemaUtils';

const MIN_RESIZE_WIDTH = 60;

export const useDataTableColumns = ({ columns, nestedColumns, sorting, onSortChange, onColumnProfileRequest, HeaderComponent, isCompressed = false }) => {
  return useMemo(() => {
    if (nestedColumns) {
      const columnByName = new Map(columns.map(col => [col.name, col]));
      return attachRenderers(nestedColumns, columnByName, { sorting, onSortChange, onColumnProfileRequest, isCompressed });
    }

    return columns.map(col => buildLeafColumnDef(col, { sorting, onSortChange, onColumnProfileRequest, HeaderComponent, isCompressed }));
  }, [columns, nestedColumns, sorting, onSortChange, onColumnProfileRequest, HeaderComponent, isCompressed]);
};

function buildLeafColumnDef(col, { sorting, onSortChange, onColumnProfileRequest, HeaderComponent, isCompressed }) {
  const Header = HeaderComponent || DataTableHeader;
  return {
    id: col.name,
    accessorKey: col.name,
    header: () => (
      <Header
        column={col}
        sorting={sorting}
        onSortChange={onSortChange}
        onInfoClick={onColumnProfileRequest}
        isCompressed={isCompressed}
      />
    ),
    cell: ({ getValue }) => (
      <DataTableCell value={getValue()} columnType={col.normalizedType} format={col.format} />
    ),
    size: calculateColumnWidth(col.displayName || col.name, col.normalizedType),
    minSize: MIN_RESIZE_WIDTH,
    meta: { isPivotRow: col.isPivotRow || false },
  };
}

function attachRenderers(columnDefs, columnByName, opts) {
  return columnDefs.map(def => {
    if (def.columns) {
      // Group header
      return {
        id: def.id,
        header: () => <DataTableGroupHeader label={def.header} />,
        meta: { isGroupHeader: true },
        columns: attachRenderers(def.columns, columnByName, opts),
      };
    }

    // Leaf column — build a column metadata object matching the flat column shape
    const name = def.accessorKey || def.id;
    const col = {
      name,
      displayName: def.displayName || def.header || def.id,
      normalizedType: columnByName.get(name)?.normalizedType ?? COLUMN_TYPES.UNKNOWN,
      format: columnByName.get(name)?.format,
      duckdbType: 'VARCHAR',
      isPivotRow: def.meta?.isPivotRow || false,
    };

    return buildLeafColumnDef(col, opts);
  });
}
