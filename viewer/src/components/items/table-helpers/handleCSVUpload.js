import Papa from "papaparse"; // Ensure PapaParse is installed: npm install papaparse

/**
 * Handles CSV file upload and processing
 * @param {Event} event - The file upload event
 * @param {Function} setTableData - State setter for table data
 * @param {Function} setColumns - State setter for columns
 * @param {Function} setPivotedData - State setter for pivoted data
 * @param {Function} setPivotedColumns - State setter for pivoted columns
 * @param {Function} setIsPivoted - State setter for pivot state
 * @param {Function} loadDataToDuckDB - Function to load data to DuckDB
 * @param {Object} db - DuckDB instance
 * @param {Function} initializeDuckDB - Function to initialize DuckDB
 * @param {Function} setDb - State setter for DB instance
 * @param {Function} setDuckDBStatus - State setter for DuckDB status
 * @param {Object} useTable - Material React Table instance
 */
export async function handleCSVUpload(
  event,
  {
    setTableData,
    setColumns,
    setPivotedData,
    setPivotedColumns,
    setIsPivoted,
    loadDataToDuckDB,
    db,
    initializeDuckDB,
    setDb,
    setDuckDBStatus,
    useTable
  }
) {
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
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => {
      return header.trim().replace(/[^\w\s.]/g, "_");
    },
    complete: async (result) => {
      console.log("CSV parse complete with", result.data.length, "rows");

      if (result.errors.length > 0) {
        console.error("CSV contains errors:", result.errors);
        return;
      }

      if (!result.data || result.data.length === 0) {
        console.error("CSV file contains no data");
        return;
      }

      // Process data for table format
      const processedData = result.data.map((row, index) => {
        const uniqueId = row.id ?? index;
        return {
          id: uniqueId,
          ...Object.fromEntries(
            Object.entries(row).map(([key, value]) => {
              if (value === "-" || value === "" || value === undefined) {
                return [key, null];
              }
              if (
                typeof value === "string" &&
                !isNaN(value.replace(/[$,\s]/g, ""))
              ) {
                return [key, value];
              }
              return [key, value];
            })
          ),
        };
      });

      // Create columns configuration
      const parsedColumns = Object.keys(result.data[0] || {}).map((key) => ({
        id: key,
        header: key,
        accessorKey: key,
        type: detectColumnType(result.data, key),
      }));

      // Update state with new data
      setTableData(processedData);
      setColumns(parsedColumns);
      setIsPivoted(false);
      setPivotedData(null);
      setPivotedColumns([]);

      // Reset table pagination to first page
      if (useTable) {
        useTable.setPageIndex(0);
        useTable.resetColumnFilters();
        useTable.resetSorting();
      }

      // IMPORTANT: Always ensure DuckDB is loaded and updated with new data
      let dbInstance = db;
      if (!dbInstance) {
        try {
          // Initialize DuckDB if not already initialized
          dbInstance = await initializeDuckDB(setDuckDBStatus);
          setDb(dbInstance);
        } catch (error) {
          console.error("Failed to initialize DuckDB:", error);
        }
      }

      // Load data into DuckDB if we have a database instance
      if (dbInstance && processedData.length > 0) {
        await loadDataToDuckDB(dbInstance, processedData);
      }
    },
    error: (error) => console.error("CSV parsing error:", error),
  });
}

// Helper function to detect column type
function detectColumnType(data, key) {
  const sample = data.slice(0, Math.min(10, data.length));
  const numericCount = sample.reduce((count, row) => {
    const val = row[key];
    if (val === null || val === undefined || val === "") return count;
    const isNumeric =
      typeof val === "number" ||
      (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));
    return isNumeric ? count + 1 : count;
  }, 0);
  return numericCount / sample.length >= 0.7 ? "numeric" : "text";
}