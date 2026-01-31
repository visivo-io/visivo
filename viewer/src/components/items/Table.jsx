import Loading from '../common/Loading';
import React, { useEffect, useState, useMemo } from 'react';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';
import {
  tableDataFromCohortData,
  tableColumnsWithDot,
  tableColumnsWithUnderscores,
} from '../../models/Table';
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
import { useTracesData } from '../../hooks/useTracesData';
import { ItemContainer } from './ItemContainer';
import CohortSelect from '../select/CohortSelect';
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

const Table = ({ table, project, itemWidth, height, width, shouldLoad = true }) => {
  const isDirectQueryResult = table.traces[0]?.data !== undefined;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Memoize insight names to prevent array recreation on every render
  const insightNames = useMemo(() => {
    if (!table.insights?.length) return [];
    return table.insights.map(insight => insight.name);
  }, [table.insights]);

  // Memoize trace names to prevent array recreation
  const traceNames = useMemo(() => {
    if (isDirectQueryResult) return [];
    return table.traces.map(trace => trace.name);
  }, [table.traces, isDirectQueryResult]);

  // Viewport-based loading: Only fetch data when shouldLoad is true
  const tracesData = useTracesData(project.id, shouldLoad ? traceNames : []);

  const isInsightTable = table.insights?.length > 0;

  // Read insights data from store (Dashboard prefetches all visible insights)
  // Uses useShallow for shallow equality comparison to avoid infinite re-renders
  const insightsData = useStore(
    useShallow(state => {
      if (!insightNames.length) return null;
      const data = {};
      for (const name of insightNames) {
        if (state.insightJobs[name]) data[name] = state.insightJobs[name];
      }
      return Object.keys(data).length > 0 ? data : null;
    })
  );

  const [selectedTableCohort, setSelectedTableCohort] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [searchIsVisible, setSearchIsVisible] = useState(false);

  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  useEffect(() => {
    if (selectedTableCohort && tracesData) {
      // Handle trace-based queries
      setColumns(
        tableColumnsWithDot(table, selectedTableCohort.data, selectedTableCohort.traceName)
      );
    } else if (isDirectQueryResult) {
      // Handle direct query results
      const directQueryColumns = Object.keys(table.traces[0].data[0] || {}).map(key => ({
        id: key, // Unique identifier for the column
        header: key, // Display name
        accessorKey: key.replace(/\./g, '___'), // Replace dots with a safe separator
        enableGrouping: false, // Disable grouping for these columns
        markdown: false,
      }));
      setColumns(directQueryColumns);
    }
  }, [selectedTableCohort, tracesData, table, isDirectQueryResult]);

  useEffect(() => {
    if (selectedTableCohort && columns) {
      // Handle trace-based queries
      setTableData(tableDataFromCohortData(selectedTableCohort.data, columns));
    } else if (isDirectQueryResult) {
      // Handle direct query results
      setTableData(
        table.traces[0].data.map((row, index) => {
          const transformedRow = {};
          Object.entries(row).forEach(([key, value]) => {
            // Replace dots with underscores in the keys
            transformedRow[key.replace(/\./g, '___')] = value;
          });
          return {
            id: index,
            ...transformedRow,
          };
        })
      );
    }
  }, [selectedTableCohort, columns, table.traces, isDirectQueryResult]);

  useEffect(() => {
    if (isInsightTable && insightsData) {
      const insightName = table.insights[0]?.name;
      const insightObj = insightsData?.[insightName];
      const insightColObj =
        table.column_defs.filter(column => column.insight_name === insightName)[0]?.columns ?? [];

      if (insightObj?.insight && insightColObj) {
        const insightColumns = insightColObj.map((col, idx) => ({
          id: col.id ?? `col_${idx}`,
          header: col.header,
          accessorKey: col.key.replace(/^columns\./, '').replace(/^props\./, ''),
          enableGrouping: false,
          markdown: col.markdown,
        }));

        setColumns(insightColumns);

        setTableData(
          insightObj.insight.map((row, idx) => {
            const transformedRow = {};
            Object.entries(row).forEach(([key, value]) => {
              transformedRow[key.replace(/\./g, '___')] = value;
            });
            return { id: idx, ...transformedRow };
          })
        );
      }
    }
  }, [isInsightTable, insightsData, table.insights, table.column_defs]);

  const handleExportData = () => {
    const csv = generateCsv(csvConfig)(tableData);
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;

    const cohortName = selectedTableCohort?.cohortName || 'cohort';
    const traceName = selectedTableCohort?.traceName || 'trace';

    link.setAttribute('download', `${table.name}_${traceName}_${cohortName}.csv`);

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

  const useTable = useMaterialReactTable({
    columns: tableColumnsWithUnderscores(columns).map(column => ({
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
    data: tableData,
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

  // Viewport-based loading: Show loading if not yet visible (shouldLoad=false)
  // Only show loading state if we're waiting for trace data and this isn't a direct query result
  if (!shouldLoad || (!isDirectQueryResult && !tracesData)) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  if (isInsightTable && !insightsData) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  const tableTheme = createTheme({
    palette: {
      primary: { main: 'rgba(252, 64, 35, 1)' },
      info: { main: 'rgb(79, 73, 76)' },
    },
  });

  const onSelectedCohortChange = changedSelectedTracesData => {
    const traceName = Object.keys(changedSelectedTracesData)[0];
    if (traceName) {
      const cohortName = Object.keys(changedSelectedTracesData[traceName])[0];
      setSelectedTableCohort({
        traceName,
        data: changedSelectedTracesData[traceName][cohortName],
        cohortName,
      });
    }
  };

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

              {!isDirectQueryResult && !isInsightTable && tracesData && (
                <CohortSelect
                  tracesData={tracesData}
                  onChange={onSelectedCohortChange}
                  selector={table.selector}
                  parentName={table.name}
                  parentType="table"
                />
              )}
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
