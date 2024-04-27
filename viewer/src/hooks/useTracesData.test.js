import { renderHook, waitFor } from "@testing-library/react";
import { useTracesData } from "./useTracesData";
import { withProviders } from "../utils/test-utils";

describe("useTraceDate", () => {
    test("should return null when no traces", () => {
        const { result } = renderHook(() => useTracesData(), { wrapper: withProviders })
        expect(result.current).toBe(null);
    });

    test("should return trace data", async () => {
        const { result } = renderHook(() => useTracesData(), {
            wrapper: withProviders,
            initialProps: {
                traces: [{ name: "trace" }]
            }
        })

        await waitFor(() => {
            expect(result.current).toStrictEqual({});
        });
    });
})
