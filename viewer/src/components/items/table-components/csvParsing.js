import Papa from "papaparse";
import detectColumnType from "../table-helpers/detect-column-type/detectColumnType";

/**
 * Parses a CSV file and returns processed data with columns
 * @param {File} file - CSV file to parse
 * @returns {Promise<{data: Array, columns: Array, error: Error}>} - Processed data and columns
 */
export const parseCSVFile = (file) => {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== "text/csv") {
      reject(new Error("Invalid file format. Please provide a CSV file."));
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header) => {
        return header.trim().replace(/[^\w\s.]/g, "_");
      },
      complete: (result) => {
        try {
          if (result.errors.length > 0 || !result.data || result.data.length === 0) {
            reject(new Error("Error parsing CSV or empty data"));
            return;
          }

          // Process the data for table format
          const processedData = result.data.map((row, index) => {
            const uniqueId = row.id ?? index;
            return {
              id: uniqueId,
              ...Object.fromEntries(
                Object.entries(row).map(([key, value]) => {
                  if (value === "-" || value === "" || value === undefined) {
                    return [key, null];
                  }
                  if (typeof value === "string" && !isNaN(value.replace(/[$,\s]/g, ""))) {
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

          resolve({ data: processedData, columns: parsedColumns });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => reject(error),
    });
  });
};