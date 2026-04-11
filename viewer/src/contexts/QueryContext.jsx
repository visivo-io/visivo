import React, { createContext, useContext } from 'react';
import { fetchDashboard as defaultFetchDashboard } from '../api/dashboard';
import { fetchInsightJobs as defaultFetchInsightJobs } from '../api/insightJobs';
import {
  fetchInputJobOptions as defaultFetchInputJobOptions,
  fetchInputJobs as defaultFetchInputJobs,
} from '../api/inputJobs';

const defaultQueries = {
  fetchDashboard: defaultFetchDashboard,
  fetchInsightJobs: defaultFetchInsightJobs,
  fetchInputJobOptions: defaultFetchInputJobOptions,
  fetchInputJobs: defaultFetchInputJobs,
};

const QueryContext = createContext(defaultQueries);

export function QueryProvider({
  fetchInsightJobs,
  fetchDashboard,
  fetchInputJobOptions,
  fetchInputJobs,
  children,
}) {
  const queries = {
    fetchInsightJobs: fetchInsightJobs || defaultFetchInsightJobs,
    fetchDashboard: fetchDashboard || defaultFetchDashboard,
    fetchInputJobOptions: fetchInputJobOptions || defaultFetchInputJobOptions,
    fetchInputJobs: fetchInputJobs || defaultFetchInputJobs,
  };

  return <QueryContext.Provider value={queries}>{children}</QueryContext.Provider>;
}

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

export const useFetchInsights = useFetchInsightJobs;

export function useFetchDashboard() {
  const { fetchDashboard } = useQueries();
  return fetchDashboard;
}

export function useFetchInputJobOptions() {
  const { fetchInputJobOptions } = useQueries();
  return fetchInputJobOptions;
}

export const useFetchInputOptions = useFetchInputJobOptions;

export function useFetchInputJobs() {
  const { fetchInputJobs } = useQueries();
  return fetchInputJobs;
}

export const useFetchInputs = useFetchInputJobs;
