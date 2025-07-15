import React, { createContext, useContext } from 'react';
import { useURLConfig } from './URLContext';
import md5 from 'md5';

/**
 * Context for query-related utilities
 */
const QueryContext = createContext();

/**
 * Enhanced QueryProvider that creates query functions based on URL configuration
 */
export function QueryProvider({ children }) {
  const urlConfig = useURLConfig();

  // Create query functions based on URL configuration
  const queryUtils = {
    /**
     * Create a traces query for React Query
     * @param {string} projectId - Project ID
     * @param {string[]} names - Array of trace names
     * @returns {object} React Query configuration
     */
    fetchTracesQuery: (projectId, names) => ({
      queryKey: ['trace', projectId, names],
      queryFn: async () => {
        return names.map(name => ({
          name: name,
          id: name,
          signed_data_file_url: urlConfig.getUrl('traceData', { name }),
        }));
      },
    }),

    /**
     * Create a dashboard query for React Query
     * @param {string} projectId - Project ID  
     * @param {string} name - Dashboard name
     * @returns {object} React Query configuration
     */
    fetchDashboardQuery: (projectId, name) => ({
      queryKey: ['dashboard', projectId, name],
      queryFn: async () => {
        const hash = md5(name);
        return {
          name: name,
          id: name,
          signed_thumbnail_file_url: urlConfig.getUrl('dashboardThumbnail', { hash }),
        };
      },
    }),

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
