import { renderHook } from "@testing-library/react";
import { useTracesData } from "./useTracesData";
import { withProviders } from "../utils/test-utils";

describe("useTraceDate", () => {
    test("should return trace data", () => {
        const { result } = renderHook(() => useTracesData(), { wrapper: withProviders })
        expect(result.current).toBe(null);
    });
})
