import React from 'react';
import DistRouter from './DistRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from './contexts/QueryContext';
import { fetchTracesQuery } from './queries/traces';
import { fetchDashboardQuery } from './queries/dashboards';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';

const queryClient = new QueryClient();

export default function DistProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
        <StoreProvider>
          <RouterProvider
            router={DistRouter}
            future={futureFlags}
          />
        </StoreProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
