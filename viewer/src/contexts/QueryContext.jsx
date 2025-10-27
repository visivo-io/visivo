import React, { createContext, useContext } from 'react';
import { fetchTraces as defaultFetchTraces } from '../api/traces';
import { fetchDashboard as defaultFetchDashboard } from '../api/dashboard';
import { fetchInsights as defaultFetchInsights } from '../api/insights';

// Default query functions
const defaultQueries = {
  fetchTraces: defaultFetchTraces,
  fetchDashboard: defaultFetchDashboard,
  fetchInsights: defaultFetchInsights,
};

// Create context
const QueryContext = createContext(defaultQueries);

/**
 * Provider component for custom query functions
 * Allows the host application to inject authenticated API functions
 *
 * @param {Object} props
 * @param {Function} props.fetchTraces - Custom traces fetch function
 * @param {Function} props.fetchInsights - Custom insights fetch function
 * @param {Function} props.fetchDashboard - Custom dashboard fetch function
 * @param {ReactNode} props.children
 */
export function QueryProvider({ fetchTraces, fetchInsights, fetchDashboard, children }) {
  const queries = {
    fetchTraces: fetchTraces || defaultFetchTraces,
    fetchInsights: fetchInsights || defaultFetchInsights,
    fetchDashboard: fetchDashboard || defaultFetchDashboard,
  };

  return <QueryContext.Provider value={queries}>{children}</QueryContext.Provider>;
}

/**
 * Hook to access query functions
 * @returns {Object} Object containing fetchTraces, fetchInsights and fetchDashboard functions
 */
export function useQueries() {
  const context = useContext(QueryContext);
  if (!context) {
    throw new Error('useQueries must be used within a QueryProvider');
  }
  return context;
}

/**
 * Hook to get the fetchTraces function
 * @returns {Function} fetchTraces function
 */
export function useFetchTraces() {
  const { fetchTraces } = useQueries();
  return fetchTraces;
}

/**
 * Hook to get the fetchInsights function
 * @returns {Function} fetchInsights function
 */
export function useFetchInsights() {
  const { fetchInsights } = useQueries();
  return fetchInsights;
}

/**
 * Hook to get the fetchDashboard function
 * @returns {Function} fetchDashboard function
 */
export function useFetchDashboard() {
  const { fetchDashboard } = useQueries();
  return fetchDashboard;
}
