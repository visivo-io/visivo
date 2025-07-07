import { useState, useCallback } from "react";
import { Button } from "@mui/material";
import { parseCSVFile } from "./csvParsing";

const CSVUploadButton = ({
  disabled,
  isProcessing: externalProcessing,
  onFileUpload,
  onError,
}) => {
  const [fileInputKey, setFileInputKey] = useState(Math.random());
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCSVUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (isProcessing || externalProcessing) return;
    setIsProcessing(true);
    
    try {
      // Only handle CSV parsing
      const { data, columns } = await parseCSVFile(file);
      
      // Let parent handle what to do with the data
      if (onFileUpload) {
        await onFileUpload({ data, columns, fileName: file.name });
      }
    } catch (err) {
      console.error("Error parsing CSV:", err);
      if (onError) onError(err);
    } finally {
      setFileInputKey(Math.random() + Date.now());
      setIsProcessing(false);
    }
  }, [isProcessing, externalProcessing, onFileUpload, onError]);

  return (
    <Button
      variant="contained"
      component="label"
      color="primary"
      disabled={disabled || isProcessing || externalProcessing}
      sx={{ marginRight: "10px" }}
    >
      {isProcessing || externalProcessing ? "Processing..." : "Upload CSV"}
      <input
        key={fileInputKey}
        type="file"
        accept=".csv"
        hidden
        disabled={isProcessing || externalProcessing}
        onChange={handleCSVUpload}
      />
    </Button>
  );
};

export default CSVUploadButton;