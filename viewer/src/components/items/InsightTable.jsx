import React, { useState, useMemo, useCallback } from 'react';
import DataTable from '../common/DataTable';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import { usePivotData } from '../../hooks/usePivotData';
import { computeGradientStyles } from '../../utils/cellFormatting';
import { COLUMN_TYPES } from '../../duckdb/schemaUtils';
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

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

const InsightTable = ({ table, insightData, itemWidth, height, width }) => {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(table.rows_per_page || 50);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  const isPivotMode = !!(table.columns && table.rows && table.values);
  const isColumnSelectMode = !!(table.columns && !table.rows && !table.values);
  const hasDuckDBMode = isPivotMode || isColumnSelectMode;

  const duckDBConfig = useMemo(() => {
    if (!hasDuckDBMode) return null;
    if (isPivotMode) {
      return { columns: table.columns, rows: table.rows, values: table.values };
    }
    return { columns: table.columns };
  }, [hasDuckDBMode, isPivotMode, table.columns, table.rows, table.values]);

  const { rows: pivotRows, columns: pivotColumns, isLoading: pivotLoading, error: pivotError } =
    usePivotData(hasDuckDBMode ? duckDBConfig : null, hasDuckDBMode ? insightData : null);

  const { allRows, dataTableColumns } = useMemo(() => {
    if (hasDuckDBMode) {
      const cols = pivotColumns.map(col => ({
        name: col.accessorKey || col.id,
        displayName: col.header,
        normalizedType: COLUMN_TYPES.UNKNOWN,
        duckdbType: 'VARCHAR',
      }));
      return { allRows: pivotRows, dataTableColumns: cols };
    }

    const data = insightData?.data || [];
    if (data.length === 0) return { allRows: [], dataTableColumns: [] };

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
      name: key,
      displayName: reverseMapping[key] || formatColumnHeader(key),
      normalizedType: inferType(data, key),
      duckdbType: inferType(data, key) === COLUMN_TYPES.NUMBER ? 'DOUBLE' : 'VARCHAR',
    }));

    return { allRows: data, dataTableColumns: cols };
  }, [hasDuckDBMode, pivotRows, pivotColumns, insightData]);

  // Client-side global filter
  const filteredRows = useMemo(() => {
    if (!globalFilter) return allRows;
    const lower = globalFilter.toLowerCase();
    return allRows.filter(row =>
      Object.values(row).some(val => val != null && String(val).toLowerCase().includes(lower))
    );
  }, [allRows, globalFilter]);

  // Client-side sorting
  const sortedRows = useMemo(() => {
    if (!sorting) return filteredRows;
    const { column, direction } = sorting;
    const sorted = [...filteredRows].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
      return String(aVal).localeCompare(String(bVal));
    });
    return direction === 'desc' ? sorted.reverse() : sorted;
  }, [filteredRows, sorting]);

  // Client-side pagination
  const totalRowCount = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRowCount / pageSize));
  const pagedRows = useMemo(() => {
    const start = page * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  // Gradient cell styles
  const numericColumnIds = useMemo(() => {
    if (!pagedRows.length || !dataTableColumns.length) return [];
    return dataTableColumns
      .filter(col => pagedRows.some(row => typeof row[col.name] === 'number'))
      .map(col => col.name);
  }, [pagedRows, dataTableColumns]);

  const gradientStyles = useMemo(() => {
    if (!table.format_cells) return null;
    return computeGradientStyles(pagedRows, numericColumnIds, table.format_cells);
  }, [pagedRows, numericColumnIds, table.format_cells]);

  const getCellStyle = useCallback(
    (rowIndex, columnId) => {
      if (!gradientStyles) return undefined;
      return gradientStyles.get(`${rowIndex}-${columnId}`);
    },
    [gradientStyles]
  );

  const handlePageChange = useCallback(newPage => setPage(newPage), []);
  const handlePageSizeChange = useCallback(
    newSize => {
      setPageSize(newSize);
      setPage(0);
    },
    []
  );

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  const handleExportData = useCallback(() => {
    const csv = generateCsv(csvConfig)(allRows);
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${table.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [allRows, table.name, csvConfig]);

  const handleCopyText = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('element_id', window.scrollY);
    copyText(url.toString());
  }, [copyText]);

  if (hasDuckDBMode && pivotLoading) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (hasDuckDBMode && pivotError) {
    return (
      <ItemContainer id={itemNameToSlug(table.name)}>
        <Box sx={{ p: 2, color: 'error.main' }}>Pivot error: {pivotError}</Box>
      </ItemContainer>
    );
  }

  const tableHeight = height ? height - 60 : undefined;

  return (
    <ItemContainer id={itemNameToSlug(table.name)}>
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
          value={globalFilter}
          onChange={e => {
            setGlobalFilter(e.target.value);
            setPage(0);
          }}
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
                <IconButton
                  onClick={() => {
                    setGlobalFilter('');
                    setPage(0);
                  }}
                  size="small"
                  edge="end"
                >
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

      <DataTable
        columns={dataTableColumns}
        rows={pagedRows}
        totalRowCount={totalRowCount}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        sorting={sorting}
        onSortChange={setSorting}
        isLoading={false}
        height={tableHeight}
        getCellStyle={table.format_cells ? getCellStyle : undefined}
      />
    </ItemContainer>
  );
};

function formatColumnHeader(key) {
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function inferType(rows, key) {
  for (const row of rows) {
    const val = row[key];
    if (val != null) {
      if (typeof val === 'number') return COLUMN_TYPES.NUMBER;
      if (typeof val === 'boolean') return COLUMN_TYPES.BOOLEAN;
      return COLUMN_TYPES.STRING;
    }
  }
  return COLUMN_TYPES.UNKNOWN;
}

export default InsightTable;
