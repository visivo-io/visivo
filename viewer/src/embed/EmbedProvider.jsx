import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryProvider } from '../contexts/QueryContext';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

/**
 * Provider that sets up the necessary context for embed components
 * This provides the same context as the main viewer but adapted for embed usage
 */
export const EmbedProvider = ({ children, projectId, traceData = {}, useMemoryRouter = false }) => {
  // Create a mock query context value that works with embed data
  const queryContextValue = {
    fetchTracesQuery: (projectId, traceNames) => ({
      queryKey: ['embed-traces', projectId, traceNames],
      queryFn: () => {
        // Return the trace data we already have
        const traces = traceNames.reduce((acc, traceName) => {
          if (traceData[traceName]) {
            acc[traceName] = traceData[traceName];
          }
          return acc;
        }, {});
        return Promise.resolve(traces);
      },
      enabled: traceNames.length > 0,
    }),
  };

  const Router = useMemoryRouter ? MemoryRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <QueryProvider value={queryContextValue}>{children}</QueryProvider>
      </Router>
    </QueryClientProvider>
  );
};
