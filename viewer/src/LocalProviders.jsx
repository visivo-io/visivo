import React from 'react';
import LocalRouter, { localURLConfig } from './LocalRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { QueryProvider } from './contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';
import { DuckDBProvider } from './contexts/DuckDBContext';

const queryClient = new QueryClient();

export default function LocalProviders({
  fetchInsights,
  fetchDashboard,
  fetchInputOptions,
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider
        fetchInsights={fetchInsights}
        fetchDashboard={fetchDashboard}
        fetchInputOptions={fetchInputOptions}
      >
        <URLProvider urlConfig={localURLConfig}>
          <StoreProvider>
            <DuckDBProvider>
              <RouterProvider router={LocalRouter} future={futureFlags} />
            </DuckDBProvider>
          </StoreProvider>
        </URLProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
