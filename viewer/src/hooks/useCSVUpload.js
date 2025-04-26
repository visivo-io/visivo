import { useState } from "react";
import Papa from "papaparse";

const useCSVUpload = () => {
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];

    if (!file) {
      console.error("No file selected.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true,
        skipEmptyLines: true,
        delimiter: ",",
        complete: (result) => {
          if (result.errors.length > 0) {
            console.error("Parsing errors:", result.errors);
            return;
          }

          const parsedData = result.data;

          if (!parsedData || parsedData.length === 0) {
            console.error("No data found in the CSV file.");
            return;
          }

          const parsedColumns = Object.keys(parsedData[0] || {}).map((key) => ({
            id: key,
            header: key,
            accessorKey: key,
          }));

          setTableData(parsedData);
          setColumns(parsedColumns);
        },
        error: (error) => {
          console.error("Error parsing CSV:", error);
        },
      });
    };

    reader.onerror = (error) => {
      console.error("Error reading file:", error);
    };

    reader.readAsText(file);
  };

  return { tableData, columns, handleCSVUpload };
};

export default useCSVUpload;
