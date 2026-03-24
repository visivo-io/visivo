import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDataTableColumns } from '../../hooks/useDataTableColumns.jsx';
import ColumnVisibilityPicker from './ColumnVisibilityPicker';
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
  // Optional cell styling callback: (rowIndex, columnId) => style object or undefined
  getCellStyle,
  // Optional banner rendered above column headers (e.g. pivot metadata)
  headerBanner,
  // Optional nested column definitions for multi-level headers
  nestedColumns,
  // Optional array of column IDs to visually merge when consecutive rows share the same value
  mergeRowColumns,
  // Optional array of column IDs to stick to the left when scrolling horizontally
  stickyLeftColumns,
}) => {
  const parentRef = useRef(null);

  // Build tanstack column definitions via hook
  const tableColumns = useDataTableColumns({
    columns,
    nestedColumns,
    sorting,
    onSortChange,
    onColumnProfileRequest,
  });

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({});

  // Create tanstack table instance
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      pagination: { pageIndex: page, pageSize },
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
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

  // Pre-compute merge map for visual row merging
  const mergeMap = useMemo(() => {
    if (!mergeRowColumns?.length || !tableRows.length) return null;
    const map = new Map();
    for (let i = 1; i < tableRows.length; i++) {
      let allPreviousMatch = true;
      for (const colId of mergeRowColumns) {
        const curr = tableRows[i].getValue(colId);
        const prev = tableRows[i - 1].getValue(colId);
        if (allPreviousMatch && curr === prev) {
          map.set(`${i}-${colId}`, true);
        } else {
          allPreviousMatch = false;
        }
      }
    }
    return map;
  }, [tableRows, mergeRowColumns]);

  // Compute sticky left offsets for row columns
  const stickyLeftOffsets = useMemo(() => {
    if (!stickyLeftColumns?.length) return null;
    const leafHeaders = table.getHeaderGroups().at(-1)?.headers || [];
    const offsets = new Map();
    let cumLeft = 0;
    for (const header of leafHeaders) {
      if (stickyLeftColumns.includes(header.column.id)) {
        offsets.set(header.column.id, cumLeft);
        cumLeft += header.getSize();
      }
    }
    return offsets.size > 0 ? offsets : null;
  }, [stickyLeftColumns, table, tableColumns]);

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

  // Compute total grid width from leaf headers (last header group)
  const headerGroups = table.getHeaderGroups();
  const leafHeaderGroup = headerGroups[headerGroups.length - 1];
  const totalWidth = leafHeaderGroup?.headers.reduce((sum, h) => sum + h.getSize(), 0) ?? 0;

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
            {headerBanner && (
              <div className="border-b border-secondary-200 bg-secondary-50 px-3 py-1.5">
                {headerBanner}
              </div>
            )}
            {headerGroups.map((headerGroup, groupIndex) => {
              const isLeafRow = groupIndex === headerGroups.length - 1;
              return (
                <div
                  key={headerGroup.id}
                  className={`flex ${!isLeafRow ? 'border-b border-secondary-200' : ''}`}
                >
                  {headerGroup.headers.map(header => {
                    if (header.isPlaceholder) {
                      const isPivotRow = header.column.columnDef.meta?.isPivotRow;
                      const stickyStyle = stickyLeftOffsets?.has(header.column.id)
                        ? { position: 'sticky', left: stickyLeftOffsets.get(header.column.id), zIndex: 3 }
                        : {};
                      return (
                        <div
                          key={header.id}
                          className={`border-r border-secondary-200 last:border-r-0 ${isPivotRow ? 'bg-secondary-200' : 'bg-secondary-100'}`}
                          style={{ width: header.getSize(), ...stickyStyle }}
                        />
                      );
                    }

                    const isGroupHeader = header.column.columnDef.meta?.isGroupHeader;
                    const isPivotRow = header.column.columnDef.meta?.isPivotRow;
                    const isLeaf = !header.subHeaders || header.subHeaders.length === 0;
                    const stickyStyle = isLeaf && stickyLeftOffsets?.has(header.column.id)
                      ? { position: 'sticky', left: stickyLeftOffsets.get(header.column.id), zIndex: 3 }
                      : {};

                    let headerClass = 'border-r border-secondary-200 last:border-r-0 relative';
                    if (isPivotRow) {
                      headerClass += ' bg-secondary-200 font-semibold';
                    } else if (isGroupHeader) {
                      headerClass += ' bg-secondary-100 border-b border-secondary-200';
                    }

                    return (
                      <div
                        key={header.id}
                        className={headerClass}
                        style={{ width: header.getSize(), ...stickyStyle }}
                        colSpan={header.colSpan}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {isLeaf && (
                          <div
                            role="separator"
                            aria-orientation="vertical"
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none
                              ${header.column.getIsResizing() ? 'bg-primary-400' : 'hover:bg-secondary-300'}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
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
                  {row.getVisibleCells().map(cell => {
                    const isPivotRow = cell.column.columnDef.meta?.isPivotRow;
                    const isMerged = mergeMap?.get(`${virtualRow.index}-${cell.column.id}`);
                    const cellStyle = getCellStyle
                      ? {
                          width: cell.column.getSize(),
                          ...getCellStyle(virtualRow.index, cell.column.id),
                        }
                      : { width: cell.column.getSize() };

                    // Apply sticky left positioning for row columns
                    if (stickyLeftOffsets?.has(cell.column.id)) {
                      cellStyle.position = 'sticky';
                      cellStyle.left = stickyLeftOffsets.get(cell.column.id);
                      cellStyle.zIndex = 2;
                    }

                    let cellClass = 'border-r border-secondary-100 last:border-r-0 overflow-hidden';
                    if (isPivotRow) {
                      cellClass += ' bg-secondary-100 font-semibold';
                    }
                    if (isMerged) {
                      cellClass += ' border-t-0';
                    }

                    return (
                      <div
                        key={cell.id}
                        className={cellClass}
                        style={cellStyle}
                      >
                        {isMerged ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-secondary-200 bg-secondary-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary-500">
            {totalRowCount.toLocaleString()} total rows
          </span>
          <ColumnVisibilityPicker table={table} />
        </div>

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
