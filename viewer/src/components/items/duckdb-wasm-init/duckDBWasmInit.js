import * as duckdb from "@duckdb/duckdb-wasm";

// We'll keep a singleton reference to the initialization promise
let dbPromise = null;
// Track initialization status
let initStatus = { state: "idle", progress: 0, message: "" };

const wasmTimeOutDownloadInms = 100 * 1000;

// Get current initialization status
export function getDuckDBStatus() {
  return { ...initStatus };
}

export function initializeDuckDB(onStatusChange) {
  const updateStatus = (newStatus) => {
    initStatus = { ...initStatus, ...newStatus };
    if (onStatusChange) {
      onStatusChange({ ...initStatus });
    }
  };

  // Return existing promise if already initializing/initialized
  if (dbPromise) {
    // Still notify of current status
    if (onStatusChange) {
      onStatusChange({ ...initStatus });
    }
    return dbPromise;
  }

  // Update status to loading
  updateStatus({
    state: "loading",
    progress: 0,
    message: "Preparing DuckDB...",
  });

  // Create new initialization promise
  dbPromise = (async () => {
    try {
      updateStatus({ progress: 10, message: "Loading DuckDB modules..." });
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

      updateStatus({
        progress: 20,
        message: "Selecting compatible bundle...",
      });
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      updateStatus({ progress: 30, message: "Creating worker..." });
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
          type: "text/javascript",
        })
      );

      updateStatus({ progress: 40, message: "Starting DuckDB worker..." });
      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);

      updateStatus({
        progress: 50,
        message: "Downloading WASM modules (this may take a while)...",
      });
      console.log("Starting DuckDB WASM module download...");

      // Hard-code timeout in case download gets stuck
      const downloadPromise = db.instantiate(
        bundle.mainModule,
        bundle.pthreadWorker,
        (progress) => {
          const loaded = progress.bytesLoaded / 5 || 0;
          const total = progress.bytesTotal || 1;

          let percentage;
          if (loaded >= total) {
            percentage = 95;
          } else {
            percentage = Math.round((loaded / total) * 45) + 50;
            percentage = Math.max(50, Math.min(95, percentage));
          }

          updateStatus({
            state: "loading",
            progress: percentage,
            message: `Downloading WASM: ${Math.round(
              loaded / 1024 / 1024
            )}MB / ${Math.round(total / 1024 / 1024)}MB`,
          });
        }
      );

      // Add a timeout for downloading the WASM modules
      // perhaps this should be configurable based on internet speed?
      // 100 seconds should be enough for most cases
      // but we can always increase it if needed
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Download timeout")),
          wasmTimeOutDownloadInms
        );
      });

      // Wait for download or timeout
      await Promise.race([downloadPromise, timeoutPromise]);

      updateStatus({
        state: "success",
        progress: 100,
        message: "DuckDB ready!",
      });

      URL.revokeObjectURL(worker_url);
      return db;
    } catch (error) {
      // Reset the promise so it can be tried again
      dbPromise = null;
      updateStatus({
        state: "error",
        message: `Error: ${
          error.message || "Unknown error during initialization"
        }`,
      });
      console.error("Failed to initialize DuckDB:", error);
      throw error;
    }
  })();

  return dbPromise;
}

// Create a function to clean up DuckDB resources
export function cleanupDuckDB(db) {
  if (db) {
    try {
      db.terminate();
      // Reset the promise when we clean up
      dbPromise = null;
      // Reset status
      initStatus = { state: "idle", progress: 0, message: "" };
      console.log("DuckDB resources cleaned up");
    } catch (error) {
      console.error("Error cleaning up DuckDB:", error);
    }
  }
}
