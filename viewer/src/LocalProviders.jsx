import React from 'react';
import LocalRouter, { localURLConfig } from './LocalRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { WorksheetProvider } from './contexts/WorksheetContext';
import { QueryProvider } from './contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';
import { DuckDBProvider } from './contexts/DuckDBContext';

const queryClient = new QueryClient();

export default function LocalProviders({ fetchTraces, fetchInsights, fetchDashboard }) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider
        fetchTraces={fetchTraces}
        fetchInsights={fetchInsights}
        fetchDashboard={fetchDashboard}
      >
        <URLProvider urlConfig={localURLConfig}>
          <WorksheetProvider>
            <StoreProvider>
              <DuckDBProvider>
                <RouterProvider router={LocalRouter} future={futureFlags} />
              </DuckDBProvider>
            </StoreProvider>
          </WorksheetProvider>
        </URLProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
