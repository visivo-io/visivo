import React, { useState, useMemo, useCallback } from 'react';
import DataTable from '../common/DataTable';
import { formatCellText } from '../common/DataTableCell';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import { usePivotData } from '../../hooks/usePivotData';
import { computeGradientStyles, selectGradientColumns } from '../../utils/cellFormatting';
import { COLUMN_TYPES } from '../../duckdb/schemaUtils';
import Loading from '../common/Loading';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  ThemeProvider,
} from '@mui/material';
import { useDashboardTheme } from '../../theme/DashboardThemeContext';
import { createDashboardMuiTheme } from '../../theme/muiTheme';
import { mkConfig, generateCsv } from 'export-to-csv';
import { ROWS_PER_PAGE_OPTIONS } from './rowsPerPageOptions';
import { buildReverseMapping, formatColumnHeader } from '../../utils/pivotRefResolver';

const isDateColumn = type => type === COLUMN_TYPES.DATE || type === COLUMN_TYPES.TIMESTAMP;

export const csvRowsFor = (rows, columns) =>
  rows.map(row => {
    const out = { ...row };
    columns.forEach(({ name, normalizedType }) => {
      const value = row[name];
      if (value === null || value === undefined) out[name] = '';
      else if (isDateColumn(normalizedType) || typeof value === 'object') {
        out[name] = formatCellText(value, normalizedType);
      } else if (typeof value === 'bigint') out[name] = value.toString();
    });
    return out;
  });

const PivotableTable = ({ table, sourceData, itemWidth, height, width }) => {
  const { tokens: themeTokens } = useDashboardTheme();
  const pivotToolbarTheme = createDashboardMuiTheme(themeTokens);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(table.rows_per_page || 50);

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

  const { rows: pivotRows, columns: pivotColumns, nestedColumns, pivotMeta, isLoading: pivotLoading, error: pivotError } =
    usePivotData(hasDuckDBMode ? duckDBConfig : null, hasDuckDBMode ? sourceData : null);

  const { allRows, dataTableColumns } = useMemo(() => {
    if (hasDuckDBMode) {
      const cols = pivotColumns.map(col => {
        const name = col.accessorKey || col.id;
        return {
          name,
          displayName: col.header,
          normalizedType: inferType(pivotRows, name),
          duckdbType: 'VARCHAR',
          isPivotRow: col.isPivotRow || false,
        };
      });
      return { allRows: pivotRows, dataTableColumns: cols };
    }

    const data = sourceData?.data || [];
    if (data.length === 0) return { allRows: [], dataTableColumns: [] };

    const reverseMapping = buildReverseMapping(sourceData.props_mapping);

    const firstRow = data[0];
    const cols = Object.keys(firstRow).map(key => {
      const normalizedType = inferType(data, key);
      return {
        name: key,
        displayName: reverseMapping[key] || formatColumnHeader(key),
        normalizedType,
        duckdbType: normalizedType === COLUMN_TYPES.NUMBER ? 'DOUBLE' : 'VARCHAR',
      };
    });

    return { allRows: data, dataTableColumns: cols };
  }, [hasDuckDBMode, pivotRows, pivotColumns, sourceData]);

  // Client-side global filter
  const isSearching = globalFilter !== '';
  const rowSearchText = useMemo(() => {
    if (!isSearching) return null;
    return allRows.map(row =>
      dataTableColumns
        .filter(col => row[col.name] != null)
        .flatMap(col => [String(row[col.name]), formatCellText(row[col.name], col.normalizedType)])
        .join('\n')
        .toLowerCase()
    );
  }, [allRows, dataTableColumns, isSearching]);

  const filteredRows = useMemo(() => {
    if (!isSearching) return allRows;
    const lower = globalFilter.toLowerCase();
    return allRows.filter((_, i) => rowSearchText[i].includes(lower));
  }, [allRows, rowSearchText, isSearching, globalFilter]);

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

  // Gradient cell styles (VIS-1463 T4): the min/max is computed over ALL rows
  // of the table — not the visible page — so a value keeps its colour across
  // pages, filters and sorts. Only measure columns are coloured: every non-row
  // column in pivot mode, genuinely numeric columns otherwise.
  const gradientColumnIds = useMemo(
    () => (table.format_cells ? selectGradientColumns(dataTableColumns, allRows, isPivotMode) : []),
    [table.format_cells, dataTableColumns, allRows, isPivotMode]
  );

  const gradientStyles = useMemo(() => {
    if (!table.format_cells) return null;
    return computeGradientStyles(allRows, gradientColumnIds, table.format_cells);
  }, [allRows, gradientColumnIds, table.format_cells]);

  // Styles are keyed by the row's index in `allRows`; DataTable asks by its
  // index in the current page, so map page row -> whole-table index.
  const allRowIndex = useMemo(() => new Map(allRows.map((row, i) => [row, i])), [allRows]);

  const getCellStyle = useCallback(
    (rowIndex, columnId) => {
      if (!gradientStyles) return undefined;
      const row = pagedRows[rowIndex];
      if (!row) return undefined;
      return gradientStyles.get(`${allRowIndex.get(row)}-${columnId}`);
    },
    [gradientStyles, pagedRows, allRowIndex]
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
    const csv = generateCsv(csvConfig)(csvRowsFor(allRows, dataTableColumns));
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${table.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [allRows, dataTableColumns, table.name, csvConfig]);

  const rowColumnIds = useMemo(() => {
    if (!isPivotMode) return null;
    return dataTableColumns.filter(c => c.isPivotRow).map(c => c.name);
  }, [isPivotMode, dataTableColumns]);

  if (hasDuckDBMode && pivotLoading) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (hasDuckDBMode && pivotError) {
    // A columns-only (column-select) table has no pivot, so labeling its render
    // error "Pivot error" is misleading (smoke-test bug #16). Label by mode.
    const errorLabel = isPivotMode ? 'Pivot error' : 'Table error';
    return (
      <ItemContainer id={itemNameToSlug(table.name)}>
        <Box sx={{ p: 2, color: 'error.main', whiteSpace: 'pre-wrap' }}>
          {errorLabel}: {pivotError}
        </Box>
      </ItemContainer>
    );
  }

  const tableHeight = height ? height - 60 : undefined;

  const headerBanner = isPivotMode && pivotMeta ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-secondary-600">
      <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary-700">
        {pivotMeta.aggregationLabel}
      </span>
      <span className="text-secondary-500">
        Columns: <span className="font-medium text-secondary-700">{pivotMeta.pivotFieldName}</span>
      </span>
      <span className="text-secondary-300" aria-hidden="true">·</span>
      <span className="text-secondary-500">
        Rows: <span className="font-medium text-secondary-700">{pivotMeta.rowFieldNames.join(', ')}</span>
      </span>
    </div>
  ) : null;

  return (
    <ItemContainer id={itemNameToSlug(table.name)}>
      {/* Toolbar */}
      <ThemeProvider theme={pivotToolbarTheme}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            gap: '8px',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--color-secondary-100)',
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
            color="primary"
            sx={{ maxWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'var(--color-secondary-400)' }} />
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
              color="primary"
              sx={{ minWidth: '40px', color: 'var(--color-secondary-500)', '&:hover': { color: 'var(--color-primary-600)' } }}
            >
              <FileDownloadIcon fontSize="medium" />
            </Button>
          </Box>
        </Box>
      </ThemeProvider>

      <DataTable
        columns={dataTableColumns}
        rows={pagedRows}
        totalRowCount={totalRowCount}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={ROWS_PER_PAGE_OPTIONS}
        sorting={sorting}
        onSortChange={setSorting}
        isLoading={false}
        height={tableHeight}
        getCellStyle={table.format_cells ? getCellStyle : undefined}
        headerBanner={headerBanner}
        nestedColumns={isPivotMode ? nestedColumns : null}
        stickyLeftColumns={rowColumnIds}
      />
    </ItemContainer>
  );
};

// The shape processArrowResult gives every DATE / TIMESTAMP value.
const ARROW_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isMidnight = value => value.endsWith('T00:00:00.000Z');

function inferType(rows, key) {
  const values = rows.map(row => row[key]).filter(val => val != null);
  if (values.length === 0) return COLUMN_TYPES.UNKNOWN;
  if (typeof values[0] === 'number') return COLUMN_TYPES.NUMBER;
  if (typeof values[0] === 'boolean') return COLUMN_TYPES.BOOLEAN;
  if (values.every(val => typeof val === 'string' && ARROW_DATE_RE.test(val))) {
    return values.every(isMidnight) ? COLUMN_TYPES.DATE : COLUMN_TYPES.TIMESTAMP;
  }
  return COLUMN_TYPES.STRING;
}

export default PivotableTable;
