import React from 'react';
import DistRouter, { distURLConfig } from './DistRouter';
import { futureFlags } from './router-config';
import { RouterProvider } from 'react-router-dom';
import { URLProvider } from './contexts/URLContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function DistProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <URLProvider urlConfig={distURLConfig}>
        <RouterProvider
          router={DistRouter}
          future={futureFlags}
        />
      </URLProvider>
    </QueryClientProvider>
  );
}
