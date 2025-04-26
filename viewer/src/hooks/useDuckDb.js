import { useState, useEffect } from "react";
import { initializeDuckDB } from "../components/items/duckdb-wasm-init/duckDBWasmInit";

const DUCK_DB_COMPLETED_LOADING_STATUS = "success";

export const useDuckDBInitialization = () => {
  const [db, setDb] = useState(null);
  const [isLoadingDuckDB, setIsLoadingDuckDB] = useState(false);
  const [duckDBStatus, setDuckDBStatus] = useState({
    state: "idle",
    message: "",
    progress: 0,
  });

  // Initialize DuckDB on component mount
  useEffect(() => {
    if (!db) {
      console.info("Starting DuckDB initialization on component mount");

      initializeDuckDB(setDuckDBStatus)
        .then((dbInstance) => {
          console.info("DuckDB initialized successfully");
          setDb(dbInstance);
        })
        .catch((error) => {
          console.error("DuckDB initialization failed:", error);
        });
    }
  }, [db]);

  const duckDBLoaded = duckDBStatus.state === DUCK_DB_COMPLETED_LOADING_STATUS

  return {
    db,
    setDb,
    duckDBLoaded,
    isLoadingDuckDB,
    setIsLoadingDuckDB,
    duckDBStatus,
    setDuckDBStatus
  };
}