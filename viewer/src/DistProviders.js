import React from "react";
import DistRouter from './DistRouter'
import { RouterProvider } from "react-router-dom";
import { QueryProvider } from './contexts/QueryContext'
import { fetchTracesQuery } from "./queries/traces"
import { fetchDashboardQuery } from "./queries/dashboards"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function DistProviders() {
    return (
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
                <RouterProvider router={DistRouter} />
            </QueryProvider>
        </QueryClientProvider>
    );
}