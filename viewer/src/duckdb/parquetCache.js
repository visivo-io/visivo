/**
 * Minimal Parquet File Cache
 * Tracks loaded files and prevents duplicate concurrent fetches.
 */
const loadedFiles = new Set();
const pendingFetches = new Map();

export const parquetCache = {
  isLoaded: nameHash => loadedFiles.has(nameHash),

  markLoaded: nameHash => loadedFiles.add(nameHash),

  getOrFetch: async (nameHash, fetchFn) => {
    if (loadedFiles.has(nameHash)) return;
    if (pendingFetches.has(nameHash)) return pendingFetches.get(nameHash);

    const promise = fetchFn().finally(() => pendingFetches.delete(nameHash));
    pendingFetches.set(nameHash, promise);
    return promise;
  },
};

// For backward compatibility with getParquetCache() calls
export const getParquetCache = () => parquetCache;
