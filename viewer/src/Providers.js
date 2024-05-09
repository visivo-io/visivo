

import React from "react";
import Viewer from './Viewer'
import { RouterProvider } from "react-router-dom";
import { FetchTracesQueryProvider } from './contexts/FetchTracesQueryContext'
import { fetchTracesQuery } from "./queries/traces"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            <FetchTracesQueryProvider value={fetchTracesQuery}>
                <RouterProvider router={Viewer} />
            </FetchTracesQueryProvider>
        </QueryClientProvider>
    );
}

export default Providers;