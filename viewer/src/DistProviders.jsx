import React from 'react';
import DistRouter, { distURLConfig } from './DistRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { QueryProvider } from './contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DuckDBProvider } from './contexts/DuckDBContext';

const queryClient = new QueryClient();

export default function DistProviders({
  fetchInsightJobs,
  fetchDashboard,
  fetchInputJobs,
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider
        fetchInsightJobs={fetchInsightJobs}
        fetchDashboard={fetchDashboard}
        fetchInputJobs={fetchInputJobs}
      >
        <URLProvider urlConfig={distURLConfig}>
          <DuckDBProvider>
            <RouterProvider router={DistRouter} future={futureFlags} />
          </DuckDBProvider>
        </URLProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
