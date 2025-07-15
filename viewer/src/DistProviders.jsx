import React from 'react';
import DistRouter from './DistRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from './contexts/QueryContext';
import { URLProvider } from './contexts/URLContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function DistProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <URLProvider environment="dist">
        <QueryProvider>
          <RouterProvider
            router={DistRouter}
            future={futureFlags}
          />
        </QueryProvider>
      </URLProvider>
    </QueryClientProvider>
  );
}
