import React, { memo, useEffect, useState } from "react";
import { Box, Typography, Button } from "@mui/material";

const DuckDBCacheStatus = memo(() => {
  const [cacheInfo, setCacheInfo] = useState({
    exists: false,
    version: null,
    timestamp: null,
    size: null,
  });

  const checkCache = async () => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("duckdb-wasm-cache", 1);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      });

      const tx = db.transaction("duckdb_bundles", "readonly");
      const store = tx.objectStore("duckdb_bundles");
      const result = await new Promise((resolve) => {
        const request = store.get("duckdb-bundle");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });

      if (result) {
        // Calculate size in MB
        const mainModuleSize = result.mainModule.byteLength;
        const workerSize = new Blob([result.mainWorker]).size;
        const totalSizeMB = (
          (mainModuleSize + workerSize) /
          (1024 * 1024)
        ).toFixed(2);

        setCacheInfo({
          exists: true,
          version: result.version,
          timestamp: new Date(result.timestamp).toLocaleString(),
          size: totalSizeMB,
        });
      } else {
        setCacheInfo({ exists: false });
      }
    } catch (err) {
      console.error("Error checking cache:", err);
      setCacheInfo({ exists: false, error: err.message });
    }
  };

  const clearCache = async () => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("duckdb-wasm-cache", 1);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      });

      const tx = db.transaction("duckdb_bundles", "readwrite");
      const store = tx.objectStore("duckdb_bundles");
      await store.clear();
      setCacheInfo({ exists: false });
      alert("Cache cleared successfully");
    } catch (err) {
      console.error("Error clearing cache:", err);
      alert(`Failed to clear cache: ${err.message}`);
    }
  };

  useEffect(() => {
    checkCache();
  }, []);

  return (
    <Box sx={{ mt: 2, p: 1, border: "1px dashed #ccc", borderRadius: "4px" }}>
      <Typography variant="subtitle2">DuckDB WASM Cache Status:</Typography>

      {cacheInfo.exists ? (
        <>
          <Typography variant="body2">
            • Version: {cacheInfo.version}
          </Typography>
          <Typography variant="body2">
            • Cached on: {cacheInfo.timestamp}
          </Typography>
          <Typography variant="body2">• Size: {cacheInfo.size} MB</Typography>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            onClick={clearCache}
            sx={{ mt: 1 }}
          >
            Clear Cache
          </Button>
        </>
      ) : (
        <Typography variant="body2">
          • No cached version available. WASM files will be downloaded on next
          initialization.
          {cacheInfo.error && (
            <Box sx={{ color: "error.main" }}>Error: {cacheInfo.error}</Box>
          )}
        </Typography>
      )}
    </Box>
  );
});

export default DuckDBCacheStatus;

// not currently using this