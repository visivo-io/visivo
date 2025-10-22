/**
 * Parquet File Cache Manager
 *
 * Tracks which parquet files have been loaded into DuckDB to prevent duplicate downloads
 * and ensure efficient multi-model insight rendering.
 */

class ParquetCache {
  constructor() {
    // Map of name_hash -> { url, loaded, loading, error }
    this.cache = new Map();
    // Ongoing fetch promises to prevent duplicate concurrent fetches
    this.fetchPromises = new Map();
  }

  /**
   * Check if a parquet file is already loaded in DuckDB
   * @param {string} nameHash - The name hash of the file
   * @returns {boolean} True if loaded
   */
  isLoaded(nameHash) {
    const entry = this.cache.get(nameHash);
    return entry && entry.loaded === true;
  }

  /**
   * Check if a parquet file is currently being loaded
   * @param {string} nameHash - The name hash of the file
   * @returns {boolean} True if loading
   */
  isLoading(nameHash) {
    const entry = this.cache.get(nameHash);
    return entry && entry.loading === true;
  }

  /**
   * Get the cached entry for a name hash
   * @param {string} nameHash - The name hash of the file
   * @returns {Object|undefined} Cache entry or undefined
   */
  get(nameHash) {
    return this.cache.get(nameHash);
  }

  /**
   * Mark a file as currently being loaded
   * @param {string} nameHash - The name hash of the file
   * @param {string} url - The URL of the file
   */
  markLoading(nameHash, url) {
    this.cache.set(nameHash, {
      url,
      loaded: false,
      loading: true,
      error: null,
      timestamp: Date.now(),
    });
  }

  /**
   * Mark a file as successfully loaded
   * @param {string} nameHash - The name hash of the file
   * @param {string} url - The URL of the file
   */
  markLoaded(nameHash, url) {
    this.cache.set(nameHash, {
      url,
      loaded: true,
      loading: false,
      error: null,
      timestamp: Date.now(),
    });
  }

  /**
   * Mark a file as failed to load
   * @param {string} nameHash - The name hash of the file
   * @param {string} url - The URL of the file
   * @param {Error} error - The error that occurred
   */
  markError(nameHash, url, error) {
    this.cache.set(nameHash, {
      url,
      loaded: false,
      loading: false,
      error: error.message || String(error),
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
    this.fetchPromises.clear();
  }

  /**
   * Remove a specific entry from the cache
   * @param {string} nameHash - The name hash of the file to remove
   */
  remove(nameHash) {
    this.cache.delete(nameHash);
    this.fetchPromises.delete(nameHash);
  }

  /**
   * Get or create a fetch promise for a name hash to prevent duplicate concurrent fetches
   * @param {string} nameHash - The name hash of the file
   * @param {Function} fetchFn - Function that returns a promise to fetch the file
   * @returns {Promise} The fetch promise
   */
  async getOrFetch(nameHash, fetchFn) {
    // If already loaded, return immediately
    if (this.isLoaded(nameHash)) {
      return this.get(nameHash);
    }

    // If there's an ongoing fetch, return that promise
    if (this.fetchPromises.has(nameHash)) {
      return this.fetchPromises.get(nameHash);
    }

    // Start a new fetch
    const fetchPromise = fetchFn().finally(() => {
      // Clean up the promise after it resolves/rejects
      this.fetchPromises.delete(nameHash);
    });

    this.fetchPromises.set(nameHash, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    return {
      total: entries.length,
      loaded: entries.filter(e => e.loaded).length,
      loading: entries.filter(e => e.loading).length,
      errors: entries.filter(e => e.error).length,
    };
  }

  /**
   * Get all loaded file hashes
   * @returns {string[]} Array of name hashes
   */
  getLoadedHashes() {
    return Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.loaded)
      .map(([hash, _]) => hash);
  }

  /**
   * Get cache entries as a plain object for debugging
   * @returns {Object} Cache entries
   */
  toJSON() {
    const obj = {};
    this.cache.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get the singleton parquet cache instance
 * @returns {ParquetCache} The cache instance
 */
export const getParquetCache = () => {
  if (!cacheInstance) {
    cacheInstance = new ParquetCache();
  }
  return cacheInstance;
};

/**
 * Reset the cache (useful for testing)
 */
export const resetParquetCache = () => {
  if (cacheInstance) {
    cacheInstance.clear();
  }
  cacheInstance = null;
};

export default ParquetCache;
