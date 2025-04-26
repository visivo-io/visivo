import Loading from "../Loading";
import { initializeDuckDB } from "./duckdb-wasm-init";
import React, { useEffect, useState, useCallback } from "react";
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
  Collapse,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  Typography,
  LinearProgress,
  CircularProgress,
  Backdrop,
  TextField,
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
import Papa from "papaparse"; // Ensure PapaParse is installed: npm install papaparse
import canBeAggregated from "./table-helpers/canBeAggregated";

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
  const [customQuery, setCustomQuery] = useState("");
  const [queryResult, setQueryResult] = useState([]);
  const [showQueryInput, setShowQueryInput] = useState(false);
  const [selectedTableCohort, setSelectedTableCohort] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [expandedBar, setExpandedBar] = useState(false);
  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueField, setValueField] = useState("");
  const [aggregateFunc, setAggregateFunc] = useState("SUM");
  const [pivotedData, setPivotedData] = useState(null);
  const [pivotedColumns, setPivotedColumns] = useState([]);
  const [isPivoted, setIsPivoted] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const handleCSVUpload = (event) => {
    console.log("File selected:", event);
    const file = event.target.files[0];

    if (!file) {
      console.error("No file selected.");
      return;
    }

    if (file.type !== "text/csv") {
      console.error("Invalid file type. Please upload a CSV file.");
      return;
    }

    Papa.parse(file, {
      header: true, // Use first row as headers
      skipEmptyLines: true, // Skip empty rows
      dynamicTyping: true, // Auto-convert numbers and booleans
      transformHeader: (header) => {
        // Sanitize header names for React Table
        return header.trim().replace(/[^\w\s.]/g, "_");
      },
      complete: handleParseComplete,
      error: (error) => console.error("CSV parsing error:", error),
    });
  };

  const runCustomQuery = async () => {
    if (!db) {
      console.error("DuckDB is not initialized.");
      return;
    }

    try {
      const conn = await db.connect();
      console.log("Executing query:", customQuery);

      const result = await conn.query(customQuery);
      const data = await result.toArray();

      console.log("Query result:", data);
      setQueryResult(data); // Store the result in state for display

      await conn.close();
    } catch (error) {
      console.error("Error executing query:", error);
    }
  };
  const handleParseComplete = (result) => {
    console.log("CSV parse complete with", result.data.length, "rows");

    if (result.errors.length > 0) {
      console.error("CSV contains errors:", result.errors);
      // You could display these errors to the user
      return;
    }

    if (!result.data || result.data.length === 0) {
      console.error("CSV file contains no data");
      return;
    }

    // Process the data for table format
    const processedData = result.data.map((row, index) => {
      // Add an id field if not present
      const uniqueId = row.id ?? index;

      // Process each field value
      return {
        id: uniqueId,
        ...Object.fromEntries(
          Object.entries(row).map(([key, value]) => {
            // Handle special values
            if (value === "-" || value === "" || value === undefined) {
              return [key, null];
            }

            // Clean numeric values for DuckDB
            if (
              typeof value === "string" &&
              !isNaN(value.replace(/[$,\s]/g, ""))
            ) {
              return [key, value]; // Keep as string for display, DuckDB will handle conversion
            }

            return [key, value];
          })
        ),
      };
    });

    const detectColumnType = (data, key) => {
      // Sample first few rows (up to 10)
      const sample = data.slice(0, Math.min(10, data.length));

      const numericCount = sample.reduce((count, row) => {
        const val = row[key];
        if (val === null || val === undefined || val === "") return count;

        // Check if it's a number or can be converted to one
        const isNumeric =
          typeof val === "number" ||
          (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));

        return isNumeric ? count + 1 : count;
      }, 0);

      // If 70% or more values are numeric, consider it numeric
      if (numericCount / sample.length >= 0.7) return "numeric";

      return "text";
    };

    // Create columns configuration
    const parsedColumns = Object.keys(result.data[0] || {}).map((key) => ({
      id: key,
      header: key,
      accessorKey: key,
      // Add type detection for columns to help with filtering/sorting
      type: detectColumnType(result.data, key),
    }));

    console.log("Setting tableData with", processedData.length, "rows");
    console.log("Setting columns:", parsedColumns.length, "columns");

    // Update state with new data
    setTableData(processedData);
    setColumns(parsedColumns);

    // Reset pivot state when loading new data
    setIsPivoted(false);
    setPivotedData(null);
    setPivotedColumns([]);

    // Reset table pagination to first page
    if (useTable) {
      useTable.setPageIndex(0);
      // Clear any active filters or sorting
      useTable.resetColumnFilters();
      useTable.resetSorting();
    }

    // Load data into DuckDB if expanded bar is open
    if (expandedBar && db) {
      loadDataToDuckDB(db);
    }

    // Optionally: Force a re-render to make sure the table updates
    // This is sometimes necessary in complex components
    setTimeout(() => {
      console.log("Forcing table refresh...");
      setTableData([...processedData]);
    }, 10);
  };
  const sanitizeColumnName = (name) =>
    name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/\s+/g, "_");

  // Move this function definition up so it's available to other functions

  const handleRowFieldsChange = (event) => {
    const value = event.target.value;
    setRowFields(typeof value === "string" ? value.split(",") : value);
  };

  const handleColumnFieldsChange = (event) => {
    const value = event.target.value;
    setColumnFields(typeof value === "string" ? value.split(",") : value);
  };

  const handleValueFieldChange = (event) => {
    setValueField(event.target.value);
  };

  const handleAggregateFuncChange = (event) => {
    setAggregateFunc(event.target.value);
  };

  const csvConfig = mkConfig({
    fieldSeparator: ",",
    decimalSeparator: ".",
    useKeysAsHeaders: true,
  });

  useEffect(() => {
    if (!db) return;

    const testConnection = async () => {
      try {
        const conn = await db.connect();
        console.log("Database connection successful!");
        await conn.close();
      } catch (error) {
        console.error("Database connection failed:", error);
      }
    };

    testConnection();
  }, [db]);

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

  // for testing set default feilds

  // Remove these unused functions
  // const getDistinctCombos = async (conn, fields) => { ... };
  // const makeCaseExpr = (combo, fields, valField, aggFunc) => { ... };

  const loadDataToDuckDB = useCallback(
    async (dbInstance) => {
      try {
        if (!tableData.length) {
          console.log("No table data to load into DuckDB");
          return;
        }

        const conn = await dbInstance.connect();

        try {
          await conn.query(`DROP TABLE IF EXISTS table_data`);
        } catch (dropErr) {
          console.error("Error dropping existing table:", dropErr);
        }

        const columnTypes = {};
        Object.keys(tableData[0] || {}).forEach((key) => {
          const allValues = tableData
            .map((row) => row[key])
            .filter((v) => v !== null && v !== undefined);
          const allNumeric =
            allValues.length > 0 &&
            allValues.every(
              (value) =>
                typeof value === "number" ||
                (typeof value === "string" &&
                  value !== "-" &&
                  value.trim() !== "" &&
                  !isNaN(Number(value.replace(/[$,\s]/g, ""))))
            );

          columnTypes[key] = allNumeric ? "DOUBLE" : "VARCHAR";
        });

        const columnDefs = Object.entries(columnTypes)
          .map(([key, type]) => `"${key}" ${type}`)
          .join(", ");

        await conn.query(`CREATE TABLE table_data (${columnDefs})`);

        for (const row of tableData) {
          const columns = Object.keys(row).join('", "');
          const values = Object.values(row)
            .map((value, index) => {
              if (value === null || value === undefined) return "NULL";

              const key = Object.keys(row)[index];

              if (columnTypes[key] === "DOUBLE") {
                if (typeof value === "number") {
                  return value;
                } else if (typeof value === "string") {
                  if (value === "-" || value.trim() === "") {
                    return "NULL";
                  }
                  const cleanValue = value.replace(/[$,\s]/g, "");
                  return !isNaN(Number(cleanValue))
                    ? Number(cleanValue)
                    : "NULL";
                }
                return "NULL";
              } else {
                // Normalize strings: trim and convert to lowercase
                return `'${String(value)
                  .trim()
                  .toLowerCase()
                  .replace(/'/g, "''")}'`;
              }
            })
            .join(", ");

          try {
            await conn.query(
              `INSERT INTO table_data ("${columns}") VALUES (${values})`
            );
          } catch (insertErr) {
            console.error(`Error inserting row:`, insertErr, { row });
          }
        }

        await conn.close();
      } catch (e) {
        console.error("Error loading data to DuckDB:", e);
      }
    },
    [tableData]
  );

  const testValues = [
    "$1,234.56", // Dollar sign and commas
    "€1.234,56", // Euro sign and European number format
    "1,234.56", // Commas
    "1234.56", // Plain number
    " 1234.56 ", // Leading/trailing spaces
    "-", // Dash (should be treated as NULL)
    "", // Empty string (should default to 0)
    null, // Null value (should default to 0)
    "abc", // Non-numeric string (should default to 0)
  ];

  const runCastingTests = async () => {
    console.log("Running casting tests...");
    for (const value of testValues) {
      await testCasting(value);
    }
  };

  useEffect(() => {
    if (expandedBar && !db) {
      console.log("Starting DuckDB initialization");

      // Call the initialization function directly
      initializeDuckDB(setDuckDBStatus)
        .then((dbInstance) => {
          console.log("DuckDB initialized successfully");
          setDb(dbInstance);

          // Load data if available
          if (tableData && tableData.length > 0) {
            loadDataToDuckDB(dbInstance);
          }
        })
        .catch((error) => {
          console.error("DuckDB initialization failed:", error);
        });
    }
  }, [expandedBar, db, tableData, loadDataToDuckDB]); // Added loadDataToDuckDB to dependency array
  useEffect(() => {
    if (db) {
      console.log("Database is loaded. Running casting tests...");
      runCastingTests();
    }
  }, [db]);

  const testCasting = async (value) => {
    if (!db) {
      console.error("DuckDB is not initialized.");
      return;
    }

    try {
      const conn = await db.connect();

      // Escape the value for SQL safely
      const sanitizedValue = value
        ? `'${String(value).replace(/'/g, "''")}'` // Escape single quotes
        : "''"; // Default to an empty string if null or undefined

      console.log(`Testing value: "${value}"`);
      const query = `
        WITH sanitized AS (
          SELECT 
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(${sanitizedValue}, '$', ''), -- Remove dollar signs
                  '€', '' -- Remove euro signs
                ),
                ',', '' -- Remove commas
              ),
              ' ', '' -- Remove spaces
            ) AS clean_value
        )
        SELECT 
          COALESCE(
            TRY_CAST(
              CASE 
                WHEN clean_value = '-' THEN NULL
                ELSE clean_value
              END AS DOUBLE
            ), 0
          ) AS sanitized_value
        FROM sanitized;
      `;

      console.log("Executing query:", query);

      const result = await conn.query(query);
      const sanitizedValueResult = (await result.toArray())[0]?.sanitized_value;

      console.log(`Input value: "${value}"`);
      console.log("Sanitized value:", sanitizedValueResult);

      await conn.close();
    } catch (error) {
      console.error("Error running testCasting in DuckDB:", error);
    }
  };

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

  const executePivot = useCallback(async () => {
    if (!db || !valueField || rowFields.length === 0) return;
    setPivotLoading(true); // Start the spinner
    const conn = await db.connect();

    try {
      const schemaQ = await conn.query(`SELECT * FROM table_data LIMIT 1`);
      const dbCols = schemaQ.schema.fields.map((f) => f.name);

      // Create a column map that handles both original and sanitized names
      const dbColumnMap = dbCols.reduce((m, col) => {
        m[col] = col; // Map the column to itself
        m[col.replace(/_/g, ".")] = col; // Map dot notation to underscores
        m[col.replace(/\./g, "_")] = col; // Map underscores to dot notation
        return m;
      }, {});

      const localFindDbCol = (f) => {
        const sanitized = f.replace(/\./g, "_"); // Sanitize user input
        return dbColumnMap[sanitized] ?? dbColumnMap[f] ?? f;
      };

      // Sanitize user fields while preserving their order
      const safeRowFields = rowFields.map(localFindDbCol);
      const safeColFields = columnFields.map(localFindDbCol);
      const safeValField = localFindDbCol(valueField);

      console.log("Safe row fields (ordered):", safeRowFields);
      console.log("Safe column fields (ordered):", safeColFields);
      console.log("Safe value field:", safeValField);

      // Fetch distinct combinations of column fields
      if (safeColFields.length > 0) {
        const cols = safeColFields.map((c) => `"${c}"`).join(", ");
        const q = await conn.query(`SELECT DISTINCT ${cols} FROM table_data`);
        const combos = await q.toArray();

        // Convert Proxy(StructRow) to plain objects
        const plainCombos = combos.map((row) => ({ ...row }));

        console.log(
          "Distinct column combinations (plain objects):",
          plainCombos
        );

        const groupedLabels = {}; // Track labels and their corresponding conditions
        plainCombos.forEach((combo) => {
          // Generate a label for the combination
          let label = safeColFields
            .map(
              (f) =>
                `${sanitizeColumnName(f)}_${sanitizeColumnName(
                  combo[f] ?? "NULL"
                )}`
            )
            .join("_");

          // Trim any leading or trailing underscores
          label = label.replace(/^_+|_+$/g, "");

          // Generate SQL conditions for the combination
          const conditions = safeColFields
            .map((f) => {
              const value = combo[f];
              if (value === null) return `"${f}" IS NULL`;
              if (typeof value === "number") return `"${f}" = ${value}`;
              return `"${f}" = '${String(value).replace(/'/g, "''")}'`;
            })
            .join(" AND ");

          // Group conditions under the same label
          if (!groupedLabels[label]) {
            groupedLabels[label] = [];
          }
          groupedLabels[label].push(conditions);
        });

        console.log("Grouped labels and conditions:", groupedLabels);

        // Generate CASE expressions for each combination
        const caseExpressions = Object.entries(groupedLabels).map(
          ([label, conditions]) => {
            const combinedConditions = conditions
              .map((cond) => `(${cond})`)
              .join(" OR ");

            const sanitizedValueField = `
              COALESCE(
                TRY_CAST(
                  CASE
                    WHEN REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            CAST("${safeValField}" AS VARCHAR),
                            '$', ''  -- Remove dollar signs
                          ),
                          '€', ''    -- Remove euro signs
                        ),
                        ',', ''     -- Remove commas
                      ),
                      ' ', ''      -- Remove spaces
                    ) = '-' THEN NULL
                    ELSE REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            CAST("${safeValField}" AS VARCHAR),
                            '$', ''
                          ),
                          '€', ''
                        ),
                        ',', ''
                      ),
                      ' ', ''
                    )
                  END AS DOUBLE
                ),
                0
              )
            `;

            if (aggregateFunc === "COUNT") {
              // For COUNT, count rows where the conditions are met
              return `COUNT(CASE WHEN ${combinedConditions} THEN 1 END) AS "${label}"`;
            }

            // For other aggregate functions, use the sanitized value field
            return `ROUND(${aggregateFunc}(CASE WHEN ${combinedConditions} THEN ${sanitizedValueField} END), 2) AS "${label}"`;
          }
        );

        // Generate the final SQL query
        const groupBy = safeRowFields.map((f) => `"${f}"`).join(", ");
        const sql = `
          SELECT ${groupBy}, ${caseExpressions.join(",\n       ")}
          FROM table_data
          GROUP BY ${groupBy}
          ORDER BY ${groupBy}
        `;

        console.log("Generated SQL query:", sql);

        // Execute the pivot query
        const result = await conn.query(sql);
        const pivotedData = await result.toArray();
        const pivotedColumns = result.schema.fields.map((field) => ({
          id: sanitizeColumnName(field.name),
          header: field.name,
          accessorKey: sanitizeColumnName(field.name),
        }));
        console.log("Pivoted data:", pivotedData);
        console.log("Pivoted columns:", pivotedColumns);

        // Update state with pivoted data
        setPivotedData(pivotedData);
        setPivotedColumns(pivotedColumns);
        setIsPivoted(true);
      } else {
        console.log("No column fields selected.");
      }
    } catch (error) {
      console.error("Error executing pivot query:", error);
    } finally {
      setPivotLoading(false);
      await conn.close();
    }
  }, [db, rowFields, columnFields, valueField, aggregateFunc]);

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

  const tableTheme = createTheme({
    palette: {
      primary: { main: "rgb(210, 89, 70)" },
      info: { main: "rgb(79, 73, 76)" },
    },
  });
  const addNewData = () => {
    const newData = [
      { id: tableData.length + 1, name: "New Widget", sales: 500 },
      { id: tableData.length + 2, name: "Another Widget", sales: 300 },
    ];

    setTableData((prevData) => [...prevData, ...newData]);
  };

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
  const bigIntReplacer = (key, value) =>
    typeof value === "bigint" ? value.toString() : value;
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
              justifyContent: "space-between",
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
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <MRT_GlobalFilterTextField table={useTable} />
            </Box>
            {/* <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <Button
                variant="contained"
                component="label"
                color="primary"
                sx={{ marginRight: "10px" }}
              >
                Upload CSV
                <input
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={(event) => {
                    console.log("File input changed");
                    handleCSVUpload(event);
                  }}
                />
              </Button>
              <MRT_ToggleFiltersButton table={useTable} />
              <MRT_ShowHideColumnsButton table={useTable} />
              <MRT_ToggleDensePaddingButton table={useTable} />
            </Box> */}
            {showQueryInput && (
              <Box
                sx={{
                  marginTop: "20px",
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                <Typography variant="h6">Run Custom SQL Query</Typography>
                <TextField
                  label="SQL Query"
                  variant="outlined"
                  fullWidth
                  multiline
                  rows={4}
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  sx={{ marginBottom: "10px" }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={runCustomQuery}
                  disabled={!customQuery.trim()}
                >
                  Run Query
                </Button>

                {/* Display query results */}
                {queryResult.length > 0 && (
                  <Box sx={{ marginTop: "20px" }}>
                    <Typography variant="h6">Query Results</Typography>
                    <pre
                      style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
                    >
                      {JSON.stringify(queryResult, bigIntReplacer, 2)}
                    </pre>
                  </Box>
                )}
              </Box>
            )}
            <Button
              variant="contained"
              component="label"
              color="primary"
              sx={{ marginRight: "10px" }}
            >
              Upload CSV
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={(event) => {
                  console.log("File input changed");
                  handleCSVUpload(event);
                }}
              />
            </Button>
            <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* Button to toggle SQL Query Input */}
              <Button
                variant="outlined"
                onClick={() => setShowQueryInput(!showQueryInput)}
              >
                {showQueryInput ? "Hide Query Input" : "Show Query Input"}
              </Button>

              {/* Button to toggle Pivot Table Options */}
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
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
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

          <Collapse in={expandedBar}>
            <Box
              sx={{
                padding: "10px",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px",
                marginBottom: "10px",
              }}
            >
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: "10px" }}
              >
                <Box sx={{ fontWeight: "bold", fontSize: "16px", mb: 1 }}>
                  Pivot Table Options
                </Box>
                {expandedBar && !db && duckDBStatus.state === "loading" && (
                  <Box sx={{ mb: 2, p: 2, border: "1px solid #e0e0e0" }}>
                    <Typography>{duckDBStatus.message}</Typography>
                    <LinearProgress
                      value={duckDBStatus.progress}
                      variant="determinate"
                    />
                  </Box>
                )}
                {/* Existing Pivot Table Options */}

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                  {/* Row Fields Selection */}
                  <FormControl sx={{ minWidth: 200, maxWidth: 300 }}>
                    <InputLabel id="row-fields-label">Row Fields</InputLabel>
                    <Select
                      labelId="row-fields-label"
                      id="row-fields"
                      multiple
                      value={rowFields}
                      onChange={handleRowFieldsChange}
                      input={
                        <OutlinedInput
                          id="select-row-fields"
                          label="Row Fields"
                        />
                      }
                      renderValue={(selected) => (
                        <Box
                          sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                        >
                          {selected.map((value) => (
                            <Chip
                              key={value}
                              label={
                                columns.find(
                                  (col) =>
                                    col.accessorKey === value ||
                                    col.id === value
                                )?.header || value
                              }
                              size="small"
                            />
                          ))}
                        </Box>
                      )}
                    >
                      {columns.map((column) => (
                        <MenuItem
                          key={column.accessorKey || column.id}
                          value={column.accessorKey || column.id}
                        >
                          {column.header}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {/* Column Fields Selection */}
                  <FormControl sx={{ minWidth: 200, maxWidth: 300 }}>
                    <InputLabel id="column-fields-label">
                      Column Fields
                    </InputLabel>
                    <Select
                      labelId="column-fields-label"
                      id="column-fields"
                      multiple
                      value={columnFields}
                      onChange={handleColumnFieldsChange}
                      input={
                        <OutlinedInput
                          id="select-column-fields"
                          label="Column Fields"
                        />
                      }
                      renderValue={(selected) => (
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "16px",
                          }}
                        >
                          {selected.map((value) => (
                            <Chip
                              key={value}
                              label={
                                columns.find(
                                  (col) =>
                                    col.accessorKey === value ||
                                    col.id === value
                                )?.header || value
                              }
                              size="small"
                            />
                          ))}
                        </Box>
                      )}
                    >
                      {columns.map((column) => (
                        <MenuItem
                          key={column.accessorKey || column.id}
                          value={column.accessorKey || column.id}
                        >
                          {column.header}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel id="value-field-label">Value Field</InputLabel>
                    <Select
                      labelId="value-field-label"
                      id="value-field"
                      value={valueField}
                      onChange={handleValueFieldChange}
                      label="Value Field"
                    >
                      {columns
                        .filter((column) => {
                          // Always include all fields when using COUNT aggregation
                          if (aggregateFunc === "COUNT") return true;

                          // If no data, include all columns
                          if (!tableData.length) return true;

                          // Get the column identifiers
                          const accessorKey = column.accessorKey || column.id;
                          const header = column.header;

                          // Look for case-insensitive matches for y amount/y ammount
                          if (
                            header &&
                            (header.toLowerCase().includes("y amount") ||
                              header.toLowerCase().includes("y ammount"))
                          ) {
                            return true; // Always include y amount fields
                          }

                          // Try to find the actual key in the data
                          const actualKey = Object.keys(
                            tableData[0] || {}
                          ).find(
                            (key) =>
                              key === accessorKey ||
                              key.replace(/\./g, "___") === accessorKey ||
                              key.replace(/___/g, ".") === accessorKey
                          );

                          if (actualKey) {
                            // Check if any values can be aggregated for this column
                            return tableData.some((row) =>
                              canBeAggregated(row[actualKey])
                            );
                          }

                          // Try matching by header
                          const headerMatchKey = Object.keys(
                            tableData[0] || {}
                          ).find(
                            (key) =>
                              key === header ||
                              key.toLowerCase().includes(header.toLowerCase())
                          );

                          if (headerMatchKey) {
                            return tableData.some((row) =>
                              canBeAggregated(row[headerMatchKey])
                            );
                          }

                          return false;
                        })
                        .map((column) => (
                          <MenuItem
                            key={column.accessorKey || column.id}
                            value={column.accessorKey || column.id}
                          >
                            {column.header}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  {/* Aggregate Function Selection */}
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel id="aggregate-func-label">Aggregate</InputLabel>
                    <Select
                      labelId="aggregate-func-label"
                      id="aggregate-func"
                      value={aggregateFunc}
                      onChange={handleAggregateFuncChange}
                      label="Aggregate"
                    >
                      <MenuItem value="SUM">Sum</MenuItem>
                      <MenuItem value="AVG">Average</MenuItem>
                      <MenuItem value="COUNT">Count</MenuItem>
                      <MenuItem value="MIN">Min</MenuItem>
                      <MenuItem value="MAX">Max</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: "flex", gap: "10px" }}>
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={
                      !valueField ||
                      rowFields.length === 0 ||
                      !db ||
                      pivotLoading
                    }
                    onClick={executePivot}
                  >
                    {pivotLoading ? "Processing..." : "Apply Pivot"}
                  </Button>

                  {isPivoted && (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setIsPivoted(false);
                      }}
                    >
                      Reset to Original
                    </Button>
                  )}
                </Box>
                <Box sx={{ mt: 1, fontSize: "0.85rem", fontStyle: "italic" }}>
                  Select row and column fields to group by, a value field to
                  aggregate, and an aggregation function.
                </Box>
              </Box>
            </Box>
          </Collapse>

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
