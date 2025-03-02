import React from "react";
import Viewer from './Viewer'
import { RouterProvider } from "react-router-dom";
import { QueryProvider } from './contexts/QueryContext'
import { WorksheetProvider } from './contexts/WorksheetContext'
import { fetchTracesQuery } from "./queries/traces"
import { fetchDashboardQuery } from "./queries/dashboards"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
                <WorksheetProvider>
                    <RouterProvider router={Viewer} />
                </WorksheetProvider>
            </QueryProvider>
        </QueryClientProvider>
    );
}

export default Providers;