import {
  Collapse,
  Box,
  LinearProgress,
  Button,
  Typography,
  Select,
  Chip,
  MenuItem,
  OutlinedInput,
  FormControl,
  Drawer,
  TextField,
  InputLabel,
} from "@mui/material";
import { memo } from "react";
import CSVUploadButton from "../CSVUploadButton";
import DuckDBStatus from "../DuckDBStatus";
import ValueFieldDropdown from "../ValueFieldDropdown";
import { initializeDuckDB } from "../../duckdb-wasm-init/duckDBWasmInit";
import createSanitizedValueSql from "../../table-helpers/create-sanitized-value-sql/createSanitizedValueSql";
import sanitizeColumnName from "../../table-helpers/sanitizeColumnName";
import { useState, useCallback, useEffect } from "react";
import RowFieldsSelector from "../RowFieldsSelector";
import AggregateFunctionSelector from "../AggregateFunctionSelector";
import ColumnFieldsSelector from "../ColumnFieldsSelector";
import PivotFields from "../PivotFields";

// import DuckDBCacheStatus from "../../duckdb-wasm-init/DuckDBCacheStatus";

const bigIntReplacer = (key, value) =>
  typeof value === "bigint" ? value.toString() : value;

const PivotColumnSelection = ({
  initialData = [],
  initialColumns = [],
  setPivotedColumns,
  setPivotedData,
  setIsPivoted,
  setColumns: setColumnsFromParent,
  setTableData: setTableDataFromParent,
  useTable: useTableFromParent,
}) => {
  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueField, setValueField] = useState("");
  const [aggregateFunc, setAggregateFunc] = useState("SUM");
  const [customQuery, setCustomQuery] = useState("");
  const [showQueryDrawer, setShowQueryDrawer] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [duckDBLoaded, setDuckDBLoaded] = useState(false);
  const [isLoadingDuckDB, setIsLoadingDuckDB] = useState(false);
  const [duckDBStatus, setDuckDBStatus] = useState({
    state: "idle",
    message: "",
    progress: 0,
  });
  const [debugInformation] = useState(false);
  const [db, setDb] = useState(null);
  const [tableData, setTableData] = useState(initialData);
  const [columns, setColumns] = useState(initialColumns);
  const [isDevMode] = useState(false);
  const [localPivotedData, setLocalPivotedData] = useState([]);
  const [localPivotedColumns, setLocalPivotedColumns] = useState([]);
  const [localIsPivoted, setLocalIsPivoted] = useState(false);

  useEffect(() => {
    if (!db) {
      console.log("Starting DuckDB initialization on component mount");

      // Call the initialization function directly
      initializeDuckDB(setDuckDBStatus)
        .then((dbInstance) => {
          console.log("DuckDB initialized successfully");
          setDb(dbInstance);

          // Load data if already available
          if (tableData && tableData.length > 0) {
            loadDataToDuckDB(dbInstance);
          }
        })
        .catch((error) => {
          console.error("DuckDB initialization failed:", error);
        });
    }
  }, []); // Empty dependency array ensures this runs once on mount

  useEffect(() => {
    // This one is reasonable to keep since it handles external state
    // im not sure it is
    if (duckDBStatus.state === "done") {
      setDuckDBLoaded(true);
    } else if (duckDBStatus.state === "error") {
      setDuckDBLoaded(false);
    }
  }, [duckDBStatus]);

  const updatePivotData = (data, columns) => {
    // Update local state
    setLocalPivotedData(data);
    setLocalPivotedColumns(columns);
    setLocalIsPivoted(true);

    // Notify parent - directly, no need for an effect
    if (setPivotedData) setPivotedData(data);
    if (setPivotedColumns) setPivotedColumns(columns);
    if (setIsPivoted) setIsPivoted(true);
  };

  // Reset pivot data - both local and parent
  const resetPivotData = () => {
    console.log(
      "🔄 RESET called - THIS SHOULD ONLY HAPPEN WHEN BUTTON CLICKED"
    );
    console.log("Current local state:", {
      tableData: tableData?.length || 0,
      columns: columns?.length || 0,
      localIsPivoted,
      localPivotedData: localPivotedData?.length || 0,
    });
    setLocalIsPivoted(false);
    setLocalPivotedData([]);
    setLocalPivotedColumns([]);

    // Also reset parent state
    if (setIsPivoted) setIsPivoted(false);
    if (setPivotedData) {
      console.log("Setting parent pivotedData to EMPTY ARRAY instead of null");
      setPivotedData([]); // Empty array instead of null
    }
    if (setPivotedColumns) {
      setPivotedColumns([]); // Empty array instead of null
    }
  };

  const loadDataToDuckDB = useCallback(
    async (dbInstance, dataToLoad) => {
      if (isLoadingDuckDB) {
        console.log("DuckDB load already in progress, skipping");
        return;
      }

      try {
        setIsLoadingDuckDB(true);
        const data = dataToLoad || tableData;
        if (!data.length) {
          console.log("No table data to load into DuckDB");
          return;
        }

        const conn = await dbInstance.connect();

        try {
          await conn.query(`DROP TABLE IF EXISTS table_data`);
          console.log("Dropped existing table_data");
        } catch (dropErr) {
          console.error("Error dropping existing table:", dropErr);
        }

        const columnTypes = {};
        Object.keys(data[0] || {}).forEach((key) => {
          const allValues = data
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

        let insertedRows = 0;
        let errorRows = 0;

        for (const row of data) {
          try {
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

            await conn.query(
              `INSERT INTO table_data ("${columns}") VALUES (${values})`
            );
            insertedRows++;
          } catch (insertErr) {
            console.error(`Error inserting row:`, insertErr, { row });
            errorRows++;
          }
        }
        console.log(
          `Inserted ${insertedRows} rows successfully, ${errorRows} rows failed`
        );

        try {
          const verifyResult = await conn.query(
            "SELECT COUNT(*) FROM table_data"
          );
          const count = await verifyResult.toArray();
          console.log(`DuckDB table now contains ${count[0]} rows`);
        } catch (verifyErr) {
          console.error("Error verifying data count:", verifyErr);
        }

        await conn.close();
        console.log("DuckDB connection closed");
      } catch (e) {
        console.error("Error loading data to DuckDB:", e);
      } finally {
        setIsLoadingDuckDB(false);
      }
    },
    [tableData]
  );

  const toggleQueryDrawer = (open) => () => {
    console.log("Toggling Query Drawer:", open);
    setShowQueryDrawer(open);
  };

  const runCustomQuery = async () => {
    if (!db) {
      console.error("DuckDB is not initialized.");
      return;
    }

    try {
      const conn = await db.connect();
      // console.log("Executing query:", customQuery);

      const result = await conn.query(customQuery);
      const data = await result.toArray();

      // Log the viewable data
      console.log(
        "Query result (viewable):",
        JSON.stringify(data, bigIntReplacer, 2)
      );
      await conn.close();
    } catch (error) {
      console.error("Error executing query:", error);
    }
  };

  const handleRowFieldsChange = useCallback((event) => {
    const value = event.target.value;
    setRowFields(typeof value === "string" ? value.split(",") : value);
  }, []);

  const handleColumnFieldsChange = useCallback((event) => {
    const value = event.target.value;
    setColumnFields(typeof value === "string" ? value.split(",") : value);
  }, []);

  const handleValueFieldChange = useCallback((event) => {
    setValueField(event.target.value);
  }, []);

  const handleAggregateFuncChange = useCallback((event) => {
    setAggregateFunc(event.target.value);
  }, []);

  const executePivot = async () => {
    if (!db || !valueField || rowFields.length === 0) return;
    setPivotLoading(true);
    const conn = await db.connect();

    try {
      const schemaQ = await conn.query(`SELECT * FROM table_data LIMIT 1`);
      const dbCols = schemaQ.schema.fields.map((f) => f.name);

      // Create a column map that handles both original and sanitized names
      const dbColumnMap = dbCols.reduce((m, col) => {
        m[col] = col; // Map the column to itself

        // Create a single, consistent mapping for dots/underscores
        // This handles cases where column names in UI might use dots
        // but database columns use underscores
        const withUnderscores = col.replace(/\./g, "_");
        if (withUnderscores !== col) {
          m[withUnderscores] = col;
        }

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

            const sanitizedValueField = createSanitizedValueSql(safeValField);

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
        const convertedData = pivotedData.map((row) => {
          const newRow = {};
          Object.entries(row).forEach(([key, value]) => {
            // Check if the value is a BigInt
            if (typeof value === "bigint") {
              newRow[key] = Number(value);
            } else if (typeof value === "string" && !isNaN(value)) {
              newRow[key] = Number(value);
            } else {
              newRow[key] = value;
            }
          });
          return newRow;
        });
        const pivotedColumns = result.schema.fields.map((field) => ({
          id: sanitizeColumnName(field.name),
          header: field.name,
          accessorKey: sanitizeColumnName(field.name),
        }));
        // stringify the data for better readability
        // const stringifiedData = JSON.stringify(pivotedData, bigIntReplacer, 2);

        updatePivotData(convertedData, pivotedColumns);
      } else {
        console.log("No column fields selected.");
      }
    } catch (error) {
      console.error("Error executing pivot query:", error);
    } finally {
      setPivotLoading(false);
      await conn.close();
    }
  };

  return (
    <Box
      sx={{
        padding: "10px",
        backgroundColor: "#f5f5f5",
        borderRadius: "4px",
        marginBottom: "10px",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "20px", // Add space between DuckDB status and Pivot Table Options
            padding: "10px",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
            marginBottom: "10px",
          }}
        >
          {/* DuckDB Status - Always Visible */}
        </Box>
        {duckDBStatus.state === "loading" && (
          <Box sx={{ mb: 2, p: 2, border: "1px solid #e0e0e0" }}>
            <Typography>{duckDBStatus.message}</Typography>
            <LinearProgress
              value={duckDBStatus.progress}
              variant="determinate"
            />
          </Box>
        )}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          {debugInformation && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                border: "1px dashed #ccc",
                backgroundColor: "#f9f9f9",
                fontSize: "0.8rem",
              }}
            >
              <>
                <Typography variant="subtitle2">Debug Information:</Typography>
                <div>• TableData rows: {tableData?.length || 0}</div>
                <div>• Available columns: {columns?.length || 0}</div>
                <div>
                  • Pivot status: {localIsPivoted ? "Active" : "Inactive"}
                </div>
                <div>• Pivoted data rows: {localPivotedData?.length || 0}</div>
              </>
              {localPivotedData?.length > 0 && (
                <div>
                  • First pivoted item:{" "}
                  {JSON.stringify(Object.keys(localPivotedData[0]).slice(0, 2))}
                </div>
              )}
            </Box>
          )}

          {/* Add DuckDBCacheStatus here */}
          {/* <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}> */}
          {/* <DuckDBStatus duckDBStatus={duckDBStatus} db={db} /> */}
          {/* <DuckDBCacheStatus /> */}
          {/* </Box> */}
          {isDevMode && (
            <Box sx={{ mt: 1, mb: 2 }}>
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={() => {
                  if (localPivotedData.length > 0) {
                    updatePivotData(localPivotedData, localPivotedColumns);
                  }
                }}
                disabled={localPivotedData.length === 0}
              >
                Force Update Parent Table
              </Button>
            </Box>
          )}
          {isDevMode && (
            <CSVUploadButton
              duckDBStatus={duckDBStatus}
              setIsPivoted={setIsPivoted}
              setPivotedData={(data) => {
                console.log(
                  "CSV setting pivotedData:",
                  data ? "has data" : "null/empty"
                );
                setPivotedData(data || []); // Never set to null, use empty array
              }}
              setPivotedColumns={(cols) => {
                console.log("CSV setting pivotedColumns:", cols?.length || 0);
                setPivotedColumns(cols || []); // Never set to null, use empty array
              }}
              db={db}
              useTable={useTableFromParent}
              loadDataToDuckDB={loadDataToDuckDB}
              initializeDuckDB={initializeDuckDB}
              setDb={setDb}
              setColumns={(cols) => {
                console.log("Setting columns from CSV:", cols?.length);
                // Update local state
                setColumns(cols);
                // Update parent state
                if (setColumnsFromParent) setColumnsFromParent(cols);
                // Update Material React Table directly
                if (useTableFromParent && useTableFromParent.setOptions) {
                  useTableFromParent.setOptions((prev) => ({
                    ...prev,
                    columns: cols.map((col) => ({
                      accessorKey: col.accessorKey || col.id,
                      header: col.header,
                      id: col.id,
                    })),
                  }));
                }
              }}
              setTableData={(data) => {
                console.log("Setting tableData from CSV:", data?.length);
                // Update local state
                setTableData(data);
                // Update parent state
                if (setTableDataFromParent) setTableDataFromParent(data);
                // Update Material React Table directly
                if (useTableFromParent && useTableFromParent.setOptions) {
                  useTableFromParent.setOptions((prev) => ({
                    ...prev,
                    data: data,
                  }));
                  // Reset pagination to first page
                  useTableFromParent.setPageIndex(0);
                  useTableFromParent.resetColumnFilters();
                  useTableFromParent.resetSorting();
                }
              }}
            />
          )}
          {isDevMode && (
            <Button
              disabled={duckDBStatus.state === "loading" || !db}
              variant="contained"
              onClick={() => {
                console.log("Button clicked");
                setShowQueryDrawer((prev) => !showQueryDrawer);
              }}
            >
              {showQueryDrawer
                ? "Hide Query Input"
                : "Show Custom Query Input Screen"}
            </Button>
          )}
          <DuckDBStatus duckDBStatus={duckDBStatus} db={db} />
        </Box>
        <PivotFields
          rowFields={rowFields}
          columnFields={columnFields}
          valueField={valueField}
          aggregateFunc={aggregateFunc}
          columns={columns}
          handleRowFieldsChange={handleRowFieldsChange}
          handleColumnFieldsChange={handleColumnFieldsChange}
          handleValueFieldChange={handleValueFieldChange}
          handleAggregateFuncChange={handleAggregateFuncChange}
        />
        <Button
          variant="contained"
          color="primary"
          disabled={
            !valueField || rowFields.length === 0 || !db || pivotLoading
          }
          onClick={executePivot}
        >
          {pivotLoading
            ? "Processing..."
            : localIsPivoted
            ? "Update Pivot"
            : "Apply Pivot"}
        </Button>
        {localIsPivoted && (
          <Button variant="outlined" onClick={resetPivotData}>
            Reset to Original
          </Button>
        )}
        <Box sx={{ mt: 1, fontSize: "0.85rem", fontStyle: "italic" }}>
          Select row and column fields to group by, a value field to aggregate,
          and an aggregation function.
        </Box>
      </Box>
      <Drawer
        anchor="right"
        open={showQueryDrawer}
        onClose={toggleQueryDrawer(false)}
      >
        <Box
          sx={{
            width: 300,
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <Typography variant="h6">Run Custom SQL Query</Typography>
          <Typography variant="body2" color="textSecondary">
            Note: Query results will be displayed in the browser console.
          </Typography>
          <TextField
            label="SQL Query"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            defaultValue={"SELECT * FROM table_data;"}
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
          <Button
            variant="outlined"
            color="secondary"
            onClick={toggleQueryDrawer(false)}
          >
            Close Query
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
};

export default memo(PivotColumnSelection);
