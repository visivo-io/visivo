/**
 * Minimal Parquet File Cache
 * Tracks loaded files and prevents duplicate concurrent fetches.
 *
 * IMPORTANT: This is an in-memory cache that can become stale if the DuckDB
 * instance is re-initialized. Always verify table existence in DuckDB before
 * trusting this cache.
 */
const loadedFiles = new Set();
const pendingFetches = new Map();

export const parquetCache = {
  isLoaded: nameHash => loadedFiles.has(nameHash),

  markLoaded: nameHash => loadedFiles.add(nameHash),

  clearLoaded: nameHash => loadedFiles.delete(nameHash),

  clearAll: () => {
    loadedFiles.clear();
    pendingFetches.clear();
  },

  getOrFetch: async (nameHash, fetchFn) => {
    // Don't skip based on loadedFiles here - caller should verify with DuckDB first
    // This cache is primarily for preventing duplicate concurrent fetches
    if (pendingFetches.has(nameHash)) return pendingFetches.get(nameHash);

    const promise = fetchFn().finally(() => pendingFetches.delete(nameHash));
    pendingFetches.set(nameHash, promise);
    return promise;
  },
};

// For backward compatibility with getParquetCache() calls
export const getParquetCache = () => parquetCache;
