import React, { createContext, useContext } from 'react';
import { fetchTraces as defaultFetchTraces } from '../api/traces';
import { fetchDashboard as defaultFetchDashboard } from '../api/dashboard';
import { fetchInsightJobs as defaultFetchInsightJobs } from '../api/insightJobs';
import { fetchInputOptions as defaultFetchInputOptions } from '../api/inputs';

// Default query functions
const defaultQueries = {
  fetchTraces: defaultFetchTraces,
  fetchDashboard: defaultFetchDashboard,
  fetchInsightJobs: defaultFetchInsightJobs,
  fetchInputOptions: defaultFetchInputOptions,
};

// Create context
const QueryContext = createContext(defaultQueries);

/**
 * Provider component for custom query functions
 * Allows the host application to inject authenticated API functions
 *
 * @param {Object} props
 * @param {Function} props.fetchTraces - Custom traces fetch function
 * @param {Function} props.fetchInsightJobs - Custom insight jobs fetch function
 * @param {Function} props.fetchDashboard - Custom dashboard fetch function
 * @param {Function} props.fetchInputOptions - Custom input options fetch function
 * @param {ReactNode} props.children
 */
export function QueryProvider({
  fetchTraces,
  fetchInsightJobs,
  fetchDashboard,
  fetchInputOptions,
  children,
}) {
  const queries = {
    fetchTraces: fetchTraces || defaultFetchTraces,
    fetchInsightJobs: fetchInsightJobs || defaultFetchInsightJobs,
    fetchDashboard: fetchDashboard || defaultFetchDashboard,
    fetchInputOptions: fetchInputOptions || defaultFetchInputOptions,
  };

  return <QueryContext.Provider value={queries}>{children}</QueryContext.Provider>;
}

/**
 * Hook to access query functions
 * @returns {Object} Object containing fetchTraces, fetchInsightJobs, fetchDashboard, and fetchInputOptions functions
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
 * Hook to get the fetchInsightJobs function
 * @returns {Function} fetchInsightJobs function
 */
export function useFetchInsightJobs() {
  const { fetchInsightJobs } = useQueries();
  return fetchInsightJobs;
}

// Backward compatibility alias
export const useFetchInsights = useFetchInsightJobs;

/**
 * Hook to get the fetchDashboard function
 * @returns {Function} fetchDashboard function
 */
export function useFetchDashboard() {
  const { fetchDashboard } = useQueries();
  return fetchDashboard;
}

/**
 * Hook to get the fetchInputOptions function
 * @returns {Function} fetchInputOptions function
 */
export function useFetchInputOptions() {
  const { fetchInputOptions } = useQueries();
  return fetchInputOptions;
}
