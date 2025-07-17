import React from 'react';
import LocalRouter from './LocalRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from './contexts/QueryContext';
import { WorksheetProvider } from './contexts/WorksheetContext';
import { fetchTracesQuery } from './queries/traces';
import { fetchDashboardQuery } from './queries/dashboards';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';
const queryClient = new QueryClient();

export default function LocalProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
        <WorksheetProvider>
          <StoreProvider>
            <RouterProvider
              router={LocalRouter}
              future={futureFlags}
            />
          </StoreProvider>
        </WorksheetProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
