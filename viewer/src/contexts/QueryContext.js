import React, { createContext, useContext } from 'react';
import { useURLConfig } from './URLContext';

/**
 * Context for query-related utilities
 */
const QueryContext = createContext();

/**
 * Enhanced QueryProvider that provides URL utilities
 * Query functions have been moved to their respective API modules
 */
export function QueryProvider({ children }) {
  const urlConfig = useURLConfig();

  // Provide URL utilities - query functions are now in API modules
  const queryUtils = {
    /**
     * Get URL for any endpoint
     * @param {string} key - Endpoint key
     * @param {object} params - URL parameters
     * @returns {string} Complete URL
     */
    getUrl: (key, params = {}) => urlConfig.getUrl(key, params),

    /**
     * Check if an endpoint is available in current environment
     * @param {string} key - Endpoint key
     * @returns {boolean}
     */
    isAvailable: (key) => urlConfig.isAvailable(key),

    /**
     * Get the URL configuration instance
     * @returns {URLConfig}
     */
    getConfig: () => urlConfig,
  };

  return (
    <QueryContext.Provider value={queryUtils}>
      {children}
    </QueryContext.Provider>
  );
}

/**
 * Hook to access query utilities
 * @returns {object} Query utilities
 */
export function useQueryContext() {
  const context = useContext(QueryContext);
  if (!context) {
    throw new Error('useQueryContext must be used within a QueryProvider');
  }
  return context;
}

export default QueryContext;
