import React, { useRef, useMemo, useCallback } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import DataTableHeader from './DataTableHeader';
import DataTableCell from './DataTableCell';
import { PiCaretLeft, PiCaretRight, PiSpinner } from 'react-icons/pi';

const ROW_HEIGHT = 36;

const DataTable = ({
  // Data
  columns,
  rows,
  totalRowCount,
  // Pagination
  page = 0,
  pageSize = 1000,
  pageCount = 1,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [100, 500, 1000, 5000],
  // Sorting
  sorting = null,
  onSortChange,
  // Column profiling
  onColumnProfileRequest,
  // State
  isLoading = false,
  isQuerying = false,
  // Layout
  height = '100%',
}) => {
  const parentRef = useRef(null);

  // Build tanstack column definitions from columns prop
  const tableColumns = useMemo(
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
        size: col.normalizedType === 'string' ? 200 : 130,
      })),
    [columns, sorting, onSortChange, onColumnProfileRequest]
  );

  // Create tanstack table instance
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
    state: {
      pagination: { pageIndex: page, pageSize },
    },
  });

  const tableRows = table.getRowModel().rows;

  // Virtual row renderer
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  // Pagination handlers
  const handlePrevPage = useCallback(() => {
    if (page > 0) onPageChange?.(page - 1);
  }, [page, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (page < pageCount - 1) onPageChange?.(page + 1);
  }, [page, pageCount, onPageChange]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full border border-secondary-200 rounded overflow-hidden bg-white"
        style={{ height }}
      >
        <PiSpinner className="animate-spin text-secondary-400 mb-2" size={24} />
        <span className="text-sm text-secondary-500">Loading data...</span>
      </div>
    );
  }

  // Error / empty state
  if (!columns.length || !rows.length) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full border border-secondary-200 rounded overflow-hidden bg-white"
        style={{ height }}
      >
        <span className="text-sm text-secondary-400">No data available</span>
      </div>
    );
  }

  // Compute total grid width for horizontal scrolling
  const headerGroups = table.getHeaderGroups();
  const totalWidth = headerGroups[0]?.headers.reduce((sum, h) => sum + h.getSize(), 0) ?? 0;

  return (
    <div
      className="flex flex-col border border-secondary-200 rounded overflow-hidden bg-white"
      style={{ height }}
    >
      {/* Query progress indicator */}
      {isQuerying && (
        <div className="h-0.5 bg-primary-200 overflow-hidden flex-shrink-0">
          <div className="h-full bg-primary-500 animate-pulse w-full" />
        </div>
      )}

      {/* Scrollable area (header + body scroll together horizontally) */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-secondary-100 border-b border-secondary-200">
            {headerGroups.map(headerGroup => (
              <div key={headerGroup.id} className="flex">
                {headerGroup.headers.map(header => (
                  <div
                    key={header.id}
                    className="border-r border-secondary-200 last:border-r-0"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Virtual body */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualRows.map(virtualRow => {
              const row = tableRows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  className="flex border-b border-secondary-100 hover:bg-secondary-50 transition-colors"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <div
                      key={cell.id}
                      className="border-r border-secondary-100 last:border-r-0 overflow-hidden"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-secondary-200 bg-secondary-50 flex-shrink-0">
        <span className="text-xs text-secondary-500">
          {totalRowCount.toLocaleString()} total rows
        </span>

        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-secondary-500">Rows:</span>
            <select
              className="text-xs border border-secondary-200 rounded px-1.5 py-0.5 bg-white text-secondary-700"
              value={pageSize}
              onChange={e => onPageSizeChange?.(Number(e.target.value))}
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {/* Page navigation */}
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={handlePrevPage}
                disabled={page === 0}
                aria-label="Previous page"
              >
                <PiCaretLeft size={14} />
              </button>
              <span className="text-xs text-secondary-500 min-w-[60px] text-center">
                {page + 1} / {pageCount}
              </span>
              <button
                className="p-1 rounded text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={handleNextPage}
                disabled={page >= pageCount - 1}
                aria-label="Next page"
              >
                <PiCaretRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataTable;
