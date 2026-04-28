import React, { createContext, useContext } from 'react';
import { fetchDashboard as defaultFetchDashboard } from '../api/dashboard';
import { fetchInsightJobs as defaultFetchInsightJobs } from '../api/insightJobs';
import { fetchInputJobs as defaultFetchInputJobs } from '../api/inputJobs';

const defaultQueries = {
  fetchDashboard: defaultFetchDashboard,
  fetchInsightJobs: defaultFetchInsightJobs,
  fetchInputJobs: defaultFetchInputJobs,
};

const QueryContext = createContext(defaultQueries);

/**
 * Provider component for custom query functions
 * Allows the host application to inject authenticated API functions
 *
 * @param {Object} props
 * @param {Function} props.fetchInsightJobs - Custom insight jobs fetch function
 * @param {Function} props.fetchDashboard - Custom dashboard fetch function
 * @param {Function} props.fetchInputJobs - Custom input jobs metadata fetch function
 * @param {ReactNode} props.children
 */
export function QueryProvider({
  fetchInsightJobs,
  fetchDashboard,
  fetchInputJobs,
  children,
}) {
  const queries = {
    fetchInsightJobs: fetchInsightJobs || defaultFetchInsightJobs,
    fetchDashboard: fetchDashboard || defaultFetchDashboard,
    fetchInputJobs: fetchInputJobs || defaultFetchInputJobs,
  };

  return <QueryContext.Provider value={queries}>{children}</QueryContext.Provider>;
}

/**
 * Hook to access query functions
 * @returns {Object} Object containing fetchInsightJobs, fetchDashboard, and fetchInputJobs functions
 */
export function useQueries() {
  const context = useContext(QueryContext);
  if (!context) {
    throw new Error('useQueries must be used within a QueryProvider');
  }
  return context;
}

export function useFetchInsightJobs() {
  const { fetchInsightJobs } = useQueries();
  return fetchInsightJobs;
}

/**
 * Hook to get the fetchDashboard function
 * @returns {Function} fetchDashboard function
 */
export function useFetchDashboard() {
  const { fetchDashboard } = useQueries();
  return fetchDashboard;
}

/**
 * Hook to get the fetchInputJobs function
 * @returns {Function} fetchInputJobs function
 */
export function useFetchInputJobs() {
  const { fetchInputJobs } = useQueries();
  return fetchInputJobs;
}
