

import React from "react";
import Viewer from './Viewer'
import { RouterProvider } from "react-router-dom";
import { QueryProvider } from './contexts/QueryContext'
import { fetchTracesQuery } from "./queries/traces"
import { fetchProjectHistoryQuery } from "./queries/project_history";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()


function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            <QueryProvider value={{ fetchTracesQuery, fetchProjectHistoryQuery }}>
                <RouterProvider router={Viewer} />
            </QueryProvider>
        </QueryClientProvider>
    );
}

export default Providers;