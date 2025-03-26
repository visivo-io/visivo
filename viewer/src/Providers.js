import React from "react";
import Viewer from './Viewer'
import Dist from './Dist'
import { RouterProvider } from "react-router-dom";
import { QueryProvider } from './contexts/QueryContext'
import { WorksheetProvider } from './contexts/WorksheetContext'
import { fetchTracesQuery } from "./queries/traces"
import { fetchDashboardQuery } from "./queries/dashboards"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchParamsProvider } from './contexts/SearchParamsContext'
import { Outlet } from "react-router-dom";

const queryClient = new QueryClient()

let Router = process.env.REACT_APP_USE_DIST === 'true' ? Dist : Viewer;

function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
                <WorksheetProvider>
                    <RouterProvider router={Router} />
                </WorksheetProvider>
            </QueryProvider>
        </QueryClientProvider>
    );
}

export default Providers;