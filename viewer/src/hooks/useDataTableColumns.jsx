import { useMemo } from 'react';
import DataTableHeader from '../components/explorerNew/DataTableHeader';
import DataTableCell from '../components/explorerNew/DataTableCell';
import { calculateColumnWidth } from '../duckdb/schemaUtils';

const MIN_RESIZE_WIDTH = 60;

export const useDataTableColumns = ({ columns, sorting, onSortChange, onColumnProfileRequest }) => {
  return useMemo(
    () =>
      columns.map(col => ({
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
        size: calculateColumnWidth(col.name, col.normalizedType),
        minSize: MIN_RESIZE_WIDTH,
      })),
    [columns, sorting, onSortChange, onColumnProfileRequest]
  );
};
