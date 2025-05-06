import { useState, useCallback } from "react";
import Papa from "papaparse";

export function useCSVUpload({
  loadDataToDuckDB = null,
  initializeDuckDB = null,
  setDuckDBStatus = null,
  db = null,
  setDb = null,
  onDataLoaded = null,
} = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper function to detect column type
  const detectColumnType = useCallback((data, key) => {
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
  }, []);

  const handleFileUpload = useCallback(
    async (
      event,
      {
        setTableData,
        setColumns,
        setPivotedData,
        setPivotedColumns,
        setIsPivoted,
        // useTable,
      }
    ) => {
      setError(null);
      setIsLoading(true);

      const file = event.target.files[0];

      if (!file) {
        setError("No file selected.");
        setIsLoading(false);
        return;
      }

      if (file.type !== "text/csv") {
        setError("Invalid file type. Please upload a CSV file.");
        setIsLoading(false);
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

          try {
            if (result.errors.length > 0) {
              throw new Error(
                `CSV contains errors: ${result.errors[0].message}`
              );
            }

            if (!result.data || result.data.length === 0) {
              throw new Error("CSV file contains no data");
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
            const parsedColumns = Object.keys(result.data[0] || {}).map(
              (key) => ({
                id: key,
                header: key,
                accessorKey: key,
                type: detectColumnType(result.data, key),
              })
            );

            // IMPORTANT: Update the actual table data state in the parent component
            if (setTableData) setTableData(processedData);
            if (setColumns) setColumns(parsedColumns);

            // Reset pivot state
            if (setIsPivoted) setIsPivoted(false);
            if (setPivotedData) setPivotedData(null);
            if (setPivotedColumns) setPivotedColumns([]);

            // Reset table pagination and filters
            // if (useTable) {
            //   useTable.setPageIndex(0);
            //   useTable.resetColumnFilters();
            //   useTable.resetSorting();
            // }

            // Call custom data loaded callback if provided
            if (onDataLoaded) {
              onDataLoaded(processedData, parsedColumns);
            }

            // Handle DuckDB integration if configured
            let dbInstance = db;
            if (!dbInstance && initializeDuckDB && setDb) {
              try {
                // Initialize DuckDB if not already initialized
                dbInstance = await initializeDuckDB(
                  setDuckDBStatus || (() => {})
                );
                setDb(dbInstance);
              } catch (dbError) {
                console.error("Failed to initialize DuckDB:", dbError);
                setError("Failed to initialize database");
              }
            }

            // Load data into DuckDB if we have a database instance
            if (dbInstance && processedData.length > 0 && loadDataToDuckDB) {
              await loadDataToDuckDB(dbInstance, processedData);
            }
          } catch (err) {
            console.error("Error processing CSV:", err);
            setError(err.message);
          } finally {
            setIsLoading(false);
          }
        },
        error: (parseError) => {
          console.error("CSV parsing error:", parseError);
          setError(`CSV parsing error: ${parseError.message}`);
          setIsLoading(false);
        },
      });
    },
    [
      detectColumnType,
      db,
      initializeDuckDB,
      loadDataToDuckDB,
      onDataLoaded,
      setDb,
      setDuckDBStatus,
    ]
  );

  return {
    handleFileUpload,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

export default useCSVUpload;
