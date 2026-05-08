import React from 'react';
import LocalRouter, { localURLConfig } from './LocalRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { QueryProvider } from './contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './StoreProvider';
import { DuckDBProvider } from './contexts/DuckDBContext';
import SourceCreationModal from './components/sources/SourceCreationModal';

const queryClient = new QueryClient();

export default function LocalProviders({
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
        <URLProvider urlConfig={localURLConfig}>
          <StoreProvider>
            <DuckDBProvider>
              <RouterProvider router={LocalRouter} future={futureFlags} />
              {/*
                Mounted at the app level so any route (Editor, Onboarding,
                Explorer empty state, etc.) can open the same shared modal
                via useSourceCreationModal().
              */}
              <SourceCreationModal />
            </DuckDBProvider>
          </StoreProvider>
        </URLProvider>
      </QueryProvider>
    </QueryClientProvider>
  );
}
