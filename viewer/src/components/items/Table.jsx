import Loading from '../common/Loading';
import React, { useEffect, useState } from 'react';
import {
  tableDataFromCohortData,
  tableColumnsWithDot,
  tableColumnsWithUnderscores,
} from '../../models/Table';
import { createTheme, ThemeProvider, Box, Button } from '@mui/material';
import { useTracesData } from '../../hooks/useTracesData';
import { useModelsData } from '../../hooks/useModelsData';
import { ItemContainer } from './ItemContainer';
import CohortSelect from '../select/CohortSelect';
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
import { mkConfig, generateCsv } from 'export-to-csv';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

const Table = ({ table, project, itemWidth, height, width }) => {
  const isDirectQueryResult = table.traces[0]?.data !== undefined;
  const isModelTable = table.models && table.models.length > 0;
  // Always call the hook, but with empty array if it's a direct query
  const tracesData = useTracesData(
    project.id,
    isDirectQueryResult ? [] : table.traces.map(trace => trace.name)
  );
  const modelsData = useModelsData(
    project.id,
    isModelTable ? table.models.map(model => model.name) : []
  );
  const [selectedTableCohort, setSelectedTableCohort] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tableData, setTableData] = useState([]);

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  useEffect(() => {
    if (isModelTable && modelsData) {
      const modelName = table.models[0].name;
      const rows = modelsData[modelName] || [];
      const modelColumns = Object.keys(rows[0] || {}).map(key => ({
        id: key,
        header: key,
        accessorKey: key.replace(/\./g, '___'),
        enableGrouping: false,
        markdown: false,
      }));
      setColumns(modelColumns);
    } else if (selectedTableCohort && tracesData) {
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
  }, [selectedTableCohort, tracesData, modelsData, table, isDirectQueryResult, isModelTable]);

  useEffect(() => {
    if (isModelTable && modelsData && columns.length > 0) {
      const modelName = table.models[0].name;
      const rows = modelsData[modelName] || [];
      setTableData(
        rows.map((row, index) => {
          const transformed = {};
          Object.entries(row).forEach(([key, value]) => {
            transformed[key.replace(/\./g, '___')] = value;
          });
          return { id: index, ...transformed };
        })
      );
    } else if (selectedTableCohort && columns) {
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
  }, [selectedTableCohort, columns, table.traces, isDirectQueryResult, modelsData, isModelTable]);

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

  // Show loading state appropriately
  if (isModelTable && !modelsData) {
    return <Loading text={table.name} width={itemWidth} />;
  }
  if (!isDirectQueryResult && !isModelTable && !tracesData) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  const tableTheme = createTheme({
    palette: {
      primary: { main: 'rgb(210, 89, 70)' },
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
      <ItemContainer>
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
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <MRT_GlobalFilterTextField table={useTable} />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <MRT_ToggleFiltersButton table={useTable} />
              <MRT_ShowHideColumnsButton table={useTable} />
              <MRT_ToggleDensePaddingButton table={useTable} />
              <Button
                aria-label="DownloadCsv"
                onClick={handleExportData}
                startIcon={<FileDownloadIcon />}
              />
              {!isDirectQueryResult && !isModelTable && tracesData && (
                <CohortSelect
                  tracesData={tracesData}
                  onChange={onSelectedCohortChange}
                  selector={table.selector}
                  parentName={table.name}
                  parentType="table"
                />
              )}
            </Box>
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
