import React from 'react';
import DistRouter, { distURLConfig } from './DistRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { QueryProvider } from './contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function DistProviders({ fetchTraces, fetchInsights, fetchDashboard }) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryProvider
        fetchTraces={fetchTraces}
        fetchInsights={fetchInsights}
        fetchDashboard={fetchDashboard}
      >
        <URLProvider urlConfig={distURLConfig}>
          <RouterProvider router={DistRouter} future={futureFlags} />
        </URLProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
