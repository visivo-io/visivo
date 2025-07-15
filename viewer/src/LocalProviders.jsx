import React from 'react';
import LocalRouter from './LocalRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from './contexts/QueryContext';
import { URLProvider } from './contexts/URLContext';
import { WorksheetProvider } from './contexts/WorksheetContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';

const queryClient = new QueryClient();

export default function LocalProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <URLProvider environment="local">
        <QueryProvider>
          <WorksheetProvider>
            <StoreProvider>
              <RouterProvider
                router={LocalRouter}
                future={futureFlags}
              />
            </StoreProvider>
          </WorksheetProvider>
        </QueryProvider>
      </URLProvider>
    </QueryClientProvider>
  );
}
