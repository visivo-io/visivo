import { renderHook, waitFor } from "@testing-library/react";
import { useTracesData } from "./useTracesData";
import { withProviders } from "../utils/test-utils";
import { QueryProvider } from "../contexts/QueryContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as fetchTracesData from "../queries/tracesData";

describe("useTraceDate", () => {
    test("should return empty object when no traces", async () => {
        const { result } = renderHook(() => useTracesData("projectId", []), { wrapper: withProviders })

        await waitFor(() => {
            expect(result.current).toStrictEqual({});
        });
    });

    test("should return trace data", async () => {
        const fetchTracesQuery = (projectId, name) => ({
            queryKey: ['trace', projectId, name],
            queryFn: () => [{ "name": "traceName" }],
        })
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        })

        jest.spyOn(fetchTracesData, 'fetchTracesData').mockImplementation((projectId, traceNames) => ({ traceName: { data: "data" } }));
        const { result } = renderHook(() => useTracesData("projectId", ["traceName"]), {
            wrapper: ({ children }) => {
                return (
                    <QueryProvider value={{ fetchTracesQuery }}>
                        <QueryClientProvider client={queryClient}>
                            {children}
                        </QueryClientProvider>
                    </QueryProvider>
                )
            }
        })
        await waitFor(() => {
            expect(result.current).toStrictEqual({ traceName: { data: "data" } });
        });
    });
})
