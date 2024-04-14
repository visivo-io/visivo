

import React from "react";
import Viewer from './Viewer'
import { RouterProvider } from "react-router-dom";
import { FetchTraceQueryProvider } from './contexts/FetchTraceQueryContext'
import { fetchTraceQuery } from "./queries/traces"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            <FetchTraceQueryProvider value={fetchTraceQuery}>
                <RouterProvider router={Viewer} />
            </FetchTraceQueryProvider>
        </QueryClientProvider>
    );
}

export default Providers;