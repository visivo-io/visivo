import Loading from '../common/Loading';
import React, { useState, useMemo, useRef } from 'react';
import isEqual from 'lodash/isEqual';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';
import PivotableTable from './PivotableTable';
import {
  createTheme,
  ThemeProvider,
  Box,
  IconButton,
  Button,
  Tooltip,
  useMediaQuery,
  useTheme,
  TextField,
  InputAdornment,
} from '@mui/material';
import { ItemContainer } from './ItemContainer';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

/* eslint-disable react/jsx-pascal-case */
import {
  MRT_ShowHideColumnsButton,
  MRT_TablePagination,
  MRT_ToggleDensePaddingButton,
  MRT_ToggleFiltersButton,
  MRT_ToolbarAlertBanner,
  MRT_GlobalFilterTextField,
  useMaterialReactTable,
  MRT_TableContainer,
} from 'material-react-table';
/* eslint-enable react/jsx-pascal-case */
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ShareIcon from '@mui/icons-material/Share';
import { mkConfig, generateCsv } from 'export-to-csv';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { itemNameToSlug } from './utils';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { parseRefValue, extractRefNamesFromStrings } from '../../utils/refString';

const Table = ({ table, itemWidth, height, width, shouldLoad = true }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isModelData = table.data && (table.data.sql || table.data.args || table.data.models);

  const dataName = useMemo(() => {
    if (table.data) {
      if (typeof table.data === 'object' && table.data.name) return table.data.name;
      if (typeof table.data === 'string') return parseRefValue(table.data);
    }
    const refStrings = [
      ...(table.columns || []),
      ...(table.rows || []),
      ...(table.values || []),
    ];
    const names = extractRefNamesFromStrings(refStrings);
    return names.length > 0 ? names[0] : null;
  }, [table.data, table.columns, table.rows, table.values]);

  const isPivotableTable = !!dataName;

  const sourceData = useStore(
    useShallow(state => {
      if (!dataName) return null;
      if (isModelData) return state.modelJobs?.[dataName] || null;
      return state.insightJobs[dataName] || state.modelJobs?.[dataName] || null;
    })
  );

  const [searchIsVisible, setSearchIsVisible] = useState(false);

  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  const formatColumnHeader = key => {
    const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
    return cleanKey
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  // Derive columns/tableData via useMemo (keyed on the actual data + props_mapping)
  // rather than setState-inside-useEffect. The store re-creates job objects with a
  // fresh `data` array reference on every input-driven refresh, so a setState effect
  // keyed on the unstable `sourceData` ref would re-render → re-fire → re-render in an
  // unbounded loop ("Maximum update depth exceeded"). useMemo recomputes during render
  // and never schedules an extra render, so it is loop-proof while still updating
  // whenever the underlying data genuinely changes. (VIS-830)
  const data = sourceData?.data || sourceData?.insight;
  const propsMapping = sourceData?.props_mapping;

  const computed = useMemo(() => {
    if (!dataName || !data || data.length === 0) {
      return { columns: [], tableData: [] };
    }

    const firstRow = data[0];

    const reverseMapping = {};
    if (propsMapping) {
      for (const [propPath, columnKey] of Object.entries(propsMapping)) {
        const displayName = propPath
          .replace(/^props\./, '')
          .replace(/\./g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase());
        reverseMapping[columnKey] = displayName;
      }
    }

    const autoColumns = Object.keys(firstRow).map(key => ({
      id: key,
      header: reverseMapping[key] || formatColumnHeader(key),
      accessorKey: key.replace(/\./g, '___'),
      enableGrouping: false,
      markdown: false,
    }));

    const transformedData = data.map((row, idx) => {
      const transformedRow = { id: idx };
      Object.entries(row).forEach(([key, value]) => {
        transformedRow[key.replace(/\./g, '___')] = value;
      });
      return transformedRow;
    });

    return { columns: autoColumns, tableData: transformedData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataName, data, propsMapping]);

  // Preserve referential identity when the underlying data is unchanged. The store
  // hands us a fresh `data` array (new ref, same content) on every input refresh; if
  // we passed a brand-new columns/tableData object to MRT each time it would force
  // material-react-table's own internal effects to re-sync, re-rendering needlessly.
  // Returning the previous deep-equal value keeps the table stable. (VIS-830)
  const stableRef = useRef(computed);
  if (!isEqual(stableRef.current, computed)) {
    stableRef.current = computed;
  }
  const { columns, tableData } = stableRef.current;


  const handleExportData = () => {
    const csv = generateCsv(csvConfig)(tableData);
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${table.name}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyText = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('element_id', window.scrollY);
    copyText(url.toString());
  };

  const toggleSearch = () => setSearchIsVisible(!searchIsVisible);

  // material-react-table (MRT) is the legacy renderer used ONLY for the non-data-ref
  // table path below. Every data-ref / pivot table (dataName truthy) is rendered by
  // PivotableTable, which returns before the MRT JSX. However `useMaterialReactTable`
  // is a hook and runs on every render regardless of the early returns, so when a
  // data-backed table feeds MRT a column set that churns (the store re-supplies job
  // data on input refreshes / canvas polling), MRT's internal columnOrder-sync effect
  // (`getDefaultColumnOrderIds` unions stale + new ids) flaps `setColumnOrder`
  // → re-render → effect → "Maximum update depth exceeded" (VIS-830). Since MRT's
  // output is discarded for those tables, feed it empty columns/data whenever a
  // PivotableTable will render. This removes the churn entirely with no visible change.
  const usesPivotableRenderer = isPivotableTable;

  // Memoize the columns passed to MRT. `columns.map(...)` builds a brand-new array
  // (with fresh Cell closures) each render; a new ref every render would itself
  // re-trigger MRT's columnOrder effect, so this is keyed on the (stable) `columns`.
  const mrtColumns = useMemo(
    () =>
      usesPivotableRenderer
        ? []
        : columns.map(column => ({
            ...column,
            Cell: ({ cell }) => {
              const value = cell.getValue();
              if (column.markdown) {
                return (
                  <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
                    {value}
                  </Markdown>
                );
              } else if (typeof value === 'number' && `${value}`.length < 18) {
                return new Intl.NumberFormat(navigator.language).format(value);
              }
              return value;
            },
          })),
    [columns, usesPivotableRenderer]
  );

  const mrtData = useMemo(
    () => (usesPivotableRenderer ? [] : tableData),
    [tableData, usesPivotableRenderer]
  );

  const useTable = useMaterialReactTable({
    columns: mrtColumns,
    data: mrtData,
    enableRowSelection: true,
    enableGlobalFilter: true,
    enableTopToolbar: true,
    enableFullScreenToggle: true,
    enableGrouping: true,
    enableColumnDragging: false,
    enableStickyHeader: true,
    muiTableContainerProps: {
      sx: { maxHeight: '100%' },
    },
    muiTableHeadProps: {
      sx: {
        '& tr': {
          backgroundColor: 'white',
        },
      },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [3, 5, 15, 25, 50, 100, 500, 1000],
    },
    initialState: {
      showGlobalFilter: true,
      density: 'compact',
      pagination: {
        pageSize: table.rows_per_page || 50,
      },
    },
  });

  if (!shouldLoad) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (isPivotableTable && !sourceData) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (dataName && sourceData) {
    return (
      <PivotableTable
        table={table}
        sourceData={sourceData}
        itemWidth={itemWidth}
        height={height}
        width={width}
      />
    );
  }

  const tableTheme = createTheme({
    palette: {
      primary: { main: 'rgba(252, 64, 35, 1)' },
      info: { main: 'rgb(79, 73, 76)' },
    },
  });

  /* eslint-disable react/jsx-pascal-case */
  return (
    <ThemeProvider theme={tableTheme}>
      <ItemContainer id={itemNameToSlug(table.name)}>
        <Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              backgroundColor: 'inherit',
              borderRadius: '4px',
              gap: '6px',
              alignItems: 'center',
              padding: '11px 11px',
              flexWrap: 'wrap',
              '@media max-width: 768px': {
                flexDirection: 'column',
              },
            }}
          >
            <Box
              sx={{
                display: isMobile ? 'none' : 'flex',
                alignItems: 'center',
              }}
            >
              <MRT_GlobalFilterTextField table={useTable} />
            </Box>

            {!searchIsVisible ? (
              <Box
                sx={{
                  display: !isMobile ? 'none' : 'flex',
                  alignItems: 'center',
                }}
              >
                <IconButton
                  onClick={toggleSearch}
                  sx={{
                    minWidth: '40px',
                    height: '40px',
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                  aria-label="Open search"
                >
                  <SearchIcon />
                </IconButton>
              </Box>
            ) : (
              <Box
                sx={{
                  display: !isMobile ? 'none' : 'flex',
                  alignItems: 'center',
                }}
              >
                <IconButton
                  onClick={toggleSearch}
                  sx={{
                    minWidth: '40px',
                    height: '40px',
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                  aria-label="Open search"
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? '' : '16px' }}>
              <MRT_ToggleFiltersButton table={useTable} />
              <MRT_ShowHideColumnsButton table={useTable} />
              <MRT_ToggleDensePaddingButton table={useTable} />
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
            {searchIsVisible && isMobile ? (
              <Box sx={{ display: 'flex', width: '100%', minWidth: 0, flexBasis: '100%' }}>
                <TextField
                  value={useTable.getState().globalFilter ?? ''}
                  onChange={e => useTable.setGlobalFilter(e.target.value || undefined)}
                  placeholder="Search..."
                  size="small"
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: useTable.getState().globalFilter ? (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => useTable.setGlobalFilter(undefined)}
                          size="small"
                          edge="end"
                        >
                          <CloseIcon />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                />
              </Box>
            ) : undefined}
          </Box>

          <MRT_TableContainer
            table={useTable}
            sx={{ width: width, maxHeight: `${height - 120}px` }}
          />

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <MRT_TablePagination table={useTable} />
            </Box>
            <Box sx={{ display: 'grid', width: '100%' }}>
              <MRT_ToolbarAlertBanner stackAlertBanner table={useTable} />
            </Box>
          </Box>
        </Box>
      </ItemContainer>
    </ThemeProvider>
  );
  /* eslint-enable react/jsx-pascal-case */
};

export default Table;
