import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import { usePivotData } from '../../hooks/usePivotData';
import { computeGradientStyles } from '../../utils/cellFormatting';
import Loading from '../common/Loading';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ShareIcon from '@mui/icons-material/Share';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  IconButton,
  Button,
  Tooltip,
  TextField,
  InputAdornment,
} from '@mui/material';
import { mkConfig, generateCsv } from 'export-to-csv';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

const ROW_HEIGHT = 36;

const InsightTable = ({ table, insightData, itemWidth, height, width }) => {
  const parentRef = useRef(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  const isPivotMode = !!(table.columns && table.rows && table.value);

  const pivotConfig = useMemo(() => {
    if (!isPivotMode) return null;
    return { columns: table.columns, rows: table.rows, value: table.value };
  }, [isPivotMode, table.columns, table.rows, table.value]);

  const { rows: pivotRows, columns: pivotColumns, isLoading: pivotLoading, error: pivotError } =
    usePivotData(isPivotMode ? pivotConfig : null, isPivotMode ? insightData : null);

  const { flatRows, flatColumns } = useMemo(() => {
    if (isPivotMode) return { flatRows: [], flatColumns: [] };

    const data = insightData?.data || [];
    if (data.length === 0) return { flatRows: [], flatColumns: [] };

    const reverseMapping = {};
    if (insightData.props_mapping) {
      for (const [propPath, columnKey] of Object.entries(insightData.props_mapping)) {
        const displayName = propPath
          .replace(/^props\./, '')
          .replace(/\./g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase());
        reverseMapping[columnKey] = displayName;
      }
    }

    const firstRow = data[0];
    const cols = Object.keys(firstRow).map(key => ({
      id: key,
      header: reverseMapping[key] || formatColumnHeader(key),
      accessorKey: key.replace(/\./g, '___'),
    }));

    const rows = data.map((row, idx) => {
      const transformed = { __rowId: idx };
      Object.entries(row).forEach(([key, value]) => {
        transformed[key.replace(/\./g, '___')] = value;
      });
      return transformed;
    });

    return { flatRows: rows, flatColumns: cols };
  }, [isPivotMode, insightData]);

  const displayRows = isPivotMode
    ? pivotRows.map((row, idx) => ({ __rowId: idx, ...row }))
    : flatRows;
  const displayColumns = isPivotMode ? pivotColumns : flatColumns;

  const numericColumnIds = useMemo(() => {
    if (!displayRows.length || !displayColumns.length) return [];
    return displayColumns
      .filter(col => {
        const key = col.accessorKey || col.id;
        return displayRows.some(row => typeof row[key] === 'number');
      })
      .map(col => col.accessorKey || col.id);
  }, [displayRows, displayColumns]);

  const gradientStyles = useMemo(() => {
    if (!table.format_cells) return new Map();
    return computeGradientStyles(displayRows, numericColumnIds, table.format_cells);
  }, [displayRows, numericColumnIds, table.format_cells]);

  const tanstackColumns = useMemo(
    () =>
      displayColumns.map(col => ({
        id: col.id,
        header: col.header,
        accessorKey: col.accessorKey || col.id,
        cell: info => {
          const value = info.getValue();
          if (typeof value === 'number' && `${value}`.length < 18) {
            return new Intl.NumberFormat(navigator.language).format(value);
          }
          return value != null ? String(value) : '';
        },
      })),
    [displayColumns]
  );

  const tanstackTable = useReactTable({
    data: displayRows,
    columns: tanstackColumns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: table.rows_per_page || 50 },
    },
    getRowId: row => String(row.__rowId),
  });

  const tableRows = tanstackTable.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  const handleExportData = useCallback(() => {
    const csv = generateCsv(csvConfig)(displayRows);
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${table.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [displayRows, table.name, csvConfig]);

  const handleCopyText = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('element_id', window.scrollY);
    copyText(url.toString());
  }, [copyText]);

  if (isPivotMode && pivotLoading) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (isPivotMode && pivotError) {
    return (
      <ItemContainer id={itemNameToSlug(table.name)}>
        <Box sx={{ p: 2, color: 'error.main' }}>Pivot error: {pivotError}</Box>
      </ItemContainer>
    );
  }

  if (!displayColumns.length) {
    return (
      <ItemContainer id={itemNameToSlug(table.name)}>
        <Box sx={{ p: 2, color: 'text.secondary' }}>No data available</Box>
      </ItemContainer>
    );
  }

  const headerGroups = tanstackTable.getHeaderGroups();
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <ItemContainer id={itemNameToSlug(table.name)}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: height || 'auto' }}>
        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <TextField
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value || '')}
            placeholder="Search..."
            size="small"
            variant="outlined"
            sx={{ maxWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: globalFilter ? (
                <InputAdornment position="end">
                  <IconButton onClick={() => setGlobalFilter('')} size="small" edge="end">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              aria-label="DownloadCsv"
              onClick={handleExportData}
              size="small"
              sx={{ minWidth: '40px' }}
            >
              <FileDownloadIcon fontSize="medium" />
            </Button>
            <Button
              aria-label="Share Table"
              onClick={handleCopyText}
              size="small"
              sx={{ minWidth: '40px' }}
            >
              <Tooltip title={toolTip} onMouseLeave={resetToolTip}>
                <ShareIcon fontSize="medium" />
              </Tooltip>
            </Button>
          </Box>
        </Box>

        {/* Table */}
        <Box
          ref={parentRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            maxHeight: height ? `${height - 120}px` : undefined,
            width: width,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: '#f5f5f5',
              borderBottom: '1px solid #e0e0e0',
            }}
          >
            {headerGroups.map(headerGroup => (
              <Box key={headerGroup.id} sx={{ display: 'flex' }}>
                {headerGroup.headers.map(header => (
                  <Box
                    key={header.id}
                    sx={{
                      flex: `0 0 ${Math.max(120, Math.floor((width || 800) / displayColumns.length))}px`,
                      padding: '8px 12px',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      borderRight: '1px solid #e0e0e0',
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      '&:last-child': { borderRight: 'none' },
                      '&:hover': header.column.getCanSort()
                        ? { backgroundColor: '#eeeeee' }
                        : {},
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted()] ?? ''}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>

          {/* Body */}
          <Box sx={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualRows.map(virtualRow => {
              const row = tableRows[virtualRow.index];
              return (
                <Box
                  key={row.id}
                  sx={{
                    display: 'flex',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    borderBottom: '1px solid #f0f0f0',
                    '&:hover': { backgroundColor: '#fafafa' },
                  }}
                >
                  {row.getVisibleCells().map(cell => {
                    const colId = cell.column.columnDef.accessorKey || cell.column.id;
                    const styleKey = `${virtualRow.index}-${colId}`;
                    const cellGradient = gradientStyles.get(styleKey);
                    return (
                      <Box
                        key={cell.id}
                        sx={{
                          flex: `0 0 ${Math.max(120, Math.floor((width || 800) / displayColumns.length))}px`,
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid #f0f0f0',
                          '&:last-child': { borderRight: 'none' },
                          ...(cellGradient || {}),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Pagination */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 12px',
            borderTop: '1px solid #e0e0e0',
            fontSize: '0.75rem',
            color: 'text.secondary',
          }}
        >
          <span>{displayRows.length.toLocaleString()} rows</span>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              size="small"
              disabled={!tanstackTable.getCanPreviousPage()}
              onClick={() => tanstackTable.previousPage()}
            >
              Prev
            </Button>
            <span>
              Page {tanstackTable.getState().pagination.pageIndex + 1} of{' '}
              {tanstackTable.getPageCount()}
            </span>
            <Button
              size="small"
              disabled={!tanstackTable.getCanNextPage()}
              onClick={() => tanstackTable.nextPage()}
            >
              Next
            </Button>
          </Box>
        </Box>
      </Box>
    </ItemContainer>
  );
};

function formatColumnHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default InsightTable;
