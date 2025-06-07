import Loading from "../common/Loading";

import React, { useEffect, useState, useCallback } from "react";
import PivotColumnSelection from "./table-components/pivot-column-selection/PivotColumnSelection";
import sanitizeColumnName from "./table-helpers/sanitizeColumnName";
import {
  tableDataFromCohortData,
  tableColumnsWithDot,
  tableColumnsWithUnderscores,
} from "../../models/Table";
import {
  createTheme,
  ThemeProvider,
  Box,
  Button,
  IconButton,
  CircularProgress,
  Backdrop,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTracesData } from "../../hooks/useTracesData";
import { ItemContainer } from "./ItemContainer";
import CohortSelect from "../select/CohortSelect";
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
} from "material-react-table";

/* eslint-enable react/jsx-pascal-case */
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PivotTableChartIcon from "@mui/icons-material/PivotTableChart";
import { mkConfig, generateCsv } from "export-to-csv";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

const Table = ({ table, project, itemWidth, height, width }) => {
  const [db, setDb] = useState(null);
  const [duckDBStatus, setDuckDBStatus] = useState({
    state: "idle",
    progress: 0,
  });
  const isDirectQueryResult = table.traces[0]?.data !== undefined;
  // Always call the hook, but with empty array if it's a direct query
  const tracesData = useTracesData(
    project.id,
    isDirectQueryResult ? [] : table.traces.map((trace) => trace.name)
  );

  const [selectedTableCohort, setSelectedTableCohort] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [expandedBar, setExpandedBar] = useState(false);
  const [pivotedData, setPivotedData] = useState(null);
  const [pivotedColumns, setPivotedColumns] = useState([]);
  const [isPivoted, setIsPivoted] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [isCSVData, setIsCSVData] = useState(false);
  const csvConfig = mkConfig({
    fieldSeparator: ",",
    decimalSeparator: ".",
    useKeysAsHeaders: true,
  });

  useEffect(() => {
    if (selectedTableCohort && tracesData) {
      // Handle trace-based queries
      setColumns(
        tableColumnsWithDot(
          table,
          selectedTableCohort.data,
          selectedTableCohort.traceName
        )
      );
    } else if (isDirectQueryResult) {
      // Handle direct query results
      const directQueryColumns = Object.keys(table.traces[0].data[0] || {}).map(
        (key) => ({
          id: sanitizeColumnName(key), // Sanitize column names
          header: key, // Display name
          accessorKey: sanitizeColumnName(key), // Sanitize column names
          markdown: false,
        })
      );
      setColumns(directQueryColumns);
    }
  }, [selectedTableCohort, tracesData, table, isDirectQueryResult]);

  useEffect(() => {
    if (isCSVData) {
      return;
    }
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
            transformedRow[key.replace(/\./g, "___")] = value;
          });
          return {
            id: index,
            ...transformedRow,
          };
        })
      );
    }
  }, [selectedTableCohort, columns, table.traces, isDirectQueryResult]);

  const handleExportData = () => {
    // Use pivotedData if the table is pivoted, otherwise use tableData
    const dataToExport = isPivoted ? pivotedData : tableData;

    if (!dataToExport || dataToExport.length === 0) {
      console.error("No data available to export.");
      return;
    }

    const csv = generateCsv(csvConfig)(dataToExport);
    const csvBlob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.href = url;

    const cohortName = selectedTableCohort?.cohortName || "cohort";
    const traceName = selectedTableCohort?.traceName || "trace";

    // Include "pivoted" in the filename if the table is pivoted
    const fileName = isPivoted
      ? `${table.name}_${traceName}_${cohortName}_pivoted.csv`
      : `${table.name}_${traceName}_${cohortName}.csv`;

    link.setAttribute("download", fileName);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const useTable = useMaterialReactTable({
    columns: isPivoted
      ? pivotedColumns.map((column) => ({
          ...column,
          Cell: ({ cell }) => {
            const value = cell.getValue();

            if (typeof value === "number" && `${value}`.length < 18) {
              return new Intl.NumberFormat(navigator.language).format(value);
            }
            return value;
          },
        }))
      : tableColumnsWithUnderscores(columns).map((column) => ({
          ...column,
          Cell: ({ cell }) => {
            const value = cell.getValue();
            if (column.markdown) {
              return (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeSanitize]}
                >
                  {value}
                </Markdown>
              );
            } else if (typeof value === "number" && `${value}`.length < 18) {
              return new Intl.NumberFormat(navigator.language).format(value);
            }
            return value;
          },
        })),

    data: isPivoted ? pivotedData : tableData,
    enableRowSelection: true,
    enableGlobalFilter: true,
    enableTopToolbar: true,
    enableFullScreenToggle: true,
    enableGrouping: true,
    enableColumnDragging: false,
    enableStickyHeader: true,
    muiTableContainerProps: {
      sx: { maxHeight: "100%" },
    },
    muiTableHeadProps: {
      sx: {
        "& tr": {
          backgroundColor: "white",
        },
      },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [3, 5, 15, 25, 50, 100, 500, 1000],
    },
    initialState: {
      showGlobalFilter: true,
      density: "compact",
      pagination: {
        pageSize: 50,
      },
    },
  });

  if (!isDirectQueryResult && !tracesData) {
    return <Loading text={table.name} width={itemWidth} />;
  }

  const onSelectedCohortChange = (changedSelectedTracesData) => {
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

  const tableTheme = createTheme({
    palette: {
      primary: {
        main: "#D25946",
      },
      secondary: {
        main: "#D25946",
      },
    },
    typography: {
      fontFamily: "Inter, sans-serif",
      fontSize: 14,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
    },
  });

  const toggleExpandedBar = () => {
    setExpandedBar(!expandedBar);
  };
  /* eslint-disable react/jsx-pascal-case */
  return (
    <ThemeProvider theme={tableTheme}>
      <ItemContainer>
        <Box>
          <Box
            sx={{
              display: "flex",
              backgroundColor: "inherit",
              borderRadius: "4px",
              gap: "6px",
              alignItems: "center",
              padding: "11px 11px",
              flexWrap: "wrap",
              "@media max-width: 768px": {
                flexDirection: "column",
              },
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <MRT_GlobalFilterTextField table={useTable} />

              <IconButton
                onClick={toggleExpandedBar}
                sx={{
                  transition: "transform 0.3s",
                }}
              >
                <PivotTableChartIcon
                  sx={{
                    color: isPivoted ? "rgb(210, 89, 70)" : "inherit",
                  }}
                />
                <Box
                  component={ExpandMoreIcon}
                  fontSize="small"
                  sx={{
                    transform: expandedBar ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                  }}
                />
              </IconButton>
              <Box sx={{ display: "flex", gap: "6px" }}>
                <MRT_ToggleFiltersButton table={useTable} />
                <MRT_ShowHideColumnsButton table={useTable} />
                <MRT_ToggleDensePaddingButton table={useTable} />

                <Button
                  aria-label="DownloadCsv"
                  onClick={handleExportData}
                  startIcon={<FileDownloadIcon />}
                />

                {!isDirectQueryResult && tracesData && (
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
            <Box sx={{ width: "100%" }}>
              {expandedBar && (
                <PivotColumnSelection
                  initialData={tableData}
                  initialColumns={columns}
                  expandedBar={expandedBar}
                  tracesData={tracesData}
                  table={table}
                  useTable={useTable}
                  setPivotLoading={setPivotLoading}
                  db={db}
                  setDb={setDb}
                  duckDBStatus={duckDBStatus}
                  setDuckDBStatus={setDuckDBStatus}
                  setColumns={(cols) => {
                    setColumns(cols);
                    setIsCSVData(true); // Set the flag when CSV column data is loaded
                  }}
                  setTableData={(data) => {
                    setTableData(data);
                    setIsCSVData(true); // Set the flag when CSV table data is loaded
                  }}
                  setIsPivoted={setIsPivoted}
                  setPivotedData={setPivotedData}
                  setPivotedColumns={setPivotedColumns}
                />
              )}
            </Box>
          </Box>

          <Box sx={{ position: "relative" }}>
            <Backdrop
              sx={{
                color: "#fff",
                zIndex: (theme) => theme.zIndex.drawer + 1,
                position: "absolute",
                width: "100%",
                height: "100%",
              }}
              open={pivotLoading}
            >
              <CircularProgress color="inherit" />
            </Backdrop>

            <MRT_TableContainer
              table={useTable}
              sx={{ width: width, maxHeight: `${height - 120}px` }}
            />
          </Box>
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <MRT_TablePagination table={useTable} />
            </Box>
            <Box sx={{ display: "grid", width: "100%" }}>
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
