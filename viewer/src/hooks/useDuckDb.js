import { useState, useEffect } from "react";
import { initializeDuckDB } from "../components/items/duckdb-wasm-init/duckDBWasmInit";

export const useDuckDBInitialization= () =>{
  const [db, setDb] = useState(null);
  const [duckDBLoaded, setDuckDBLoaded] = useState(false);
  const [isLoadingDuckDB, setIsLoadingDuckDB] = useState(false);
  const [duckDBStatus, setDuckDBStatus] = useState({
    state: "idle",
    message: "",
    progress: 0,
  });

  // Initialize DuckDB on component mount
  useEffect(() => {
    if (!db) {
      console.log("Starting DuckDB initialization on component mount");

      initializeDuckDB(setDuckDBStatus)
        .then((dbInstance) => {
          console.log("DuckDB initialized successfully");
          setDb(dbInstance);
        })
        .catch((error) => {
          console.error("DuckDB initialization failed:", error);
        });
    }
  }, [db]);

  // this should retry for an error
  // or display an error message
  // internet issue perhaps
  useEffect(() => {
    if (duckDBStatus.state === "done") {
      setDuckDBLoaded(true);
    } else if (duckDBStatus.state === "error") {
      setDuckDBLoaded(false);
    }
  }, [duckDBStatus]);

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