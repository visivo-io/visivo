/**
 * VIS-831 regression: useInsightsData input-driven render loop.
 *
 * Reproduces the "Maximum update depth exceeded" loop that fired on
 * input-driven insights (an input feeding an insight) in the Workspace
 * canvas. The loop originated at the `setInsightJobs` effect (useInsightsData.js):
 * the effect wrote react-query `data` into the store, the store write produced a
 * NEW `insightJobs` object reference (setInsightJobs always spreads), a
 * downstream memo (`relevantInputValues`) rebuilt a fresh object keyed off that
 * reference, `stableRelevantInputs` (its JSON) re-keyed the query, the queryFn
 * re-ran producing a FRESH `data` reference, and the effect fired again — an
 * unbounded update→re-render→new-ref→update cycle.
 *
 * These tests use the REAL Zustand store and the REAL react-query useQuery
 * (the project-wide setupTests mock of useQuery is overridden here) so the
 * end-to-end feedback path is exercised; only DuckDB + the fetch function are
 * stubbed. We assert the effect settles (bounded queryFn executions, no setState
 * storm) and that a genuine input-value change still re-runs the query
 * (input-driven insights must re-execute).
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInsightsData } from './useInsightsData';
import { useFetchInsightJobs } from '../contexts/QueryContext';
import { useDuckDB } from '../contexts/DuckDBContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
import useStore from '../stores/store';

// Override the global setupTests mock of @tanstack/react-query so the REAL
// useQuery runs and the feedback path is genuinely exercised. (jest hoists
// jest.mock above the imports regardless of source position.)
jest.mock('@tanstack/react-query', () => jest.requireActual('@tanstack/react-query'));
jest.mock('../contexts/QueryContext');
jest.mock('../contexts/DuckDBContext');
jest.mock('../duckdb/queries');
jest.mock('../duckdb/resultProcessing');

// Input-driven insight: its query references the literal ${sort_dir.value}
// placeholder (Visivo's input-substitution syntax). String.raw keeps the
// ${...} as data rather than a JS template expression.
const INPUT_DRIVEN_INSIGHT = {
  name: 'sorted_insight',
  files: ['file1.parquet'],
  query: String.raw`SELECT * FROM t ORDER BY x ${'$'}{sort_dir.value}`,
  props_mapping: { 'props.x': 'x' },
  static_props: {},
  props_slices: {},
  split_key: null,
  type: 'bar',
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const flush = async (ms = 50) => {
  await act(async () => {
    await new Promise(r => setTimeout(r, ms));
  });
};

describe('useInsightsData VIS-831 input-driven render loop', () => {
  let fetchInsights;
  let runQueryCalls;

  beforeEach(() => {
    jest.clearAllMocks();
    runQueryCalls = 0;

    act(() => {
      useStore.setState({
        insightJobs: {},
        inputJobs: {},
        inputSelectedValues: {},
        inputJobsInitialized: {},
        db: null,
      });
    });

    fetchInsights = jest.fn(async () => [INPUT_DRIVEN_INSIGHT]);
    useFetchInsightJobs.mockReturnValue(fetchInsights);
    useDuckDB.mockReturnValue({ mock: 'db' });

    loadInsightParquetFiles.mockResolvedValue({ loaded: ['file1.parquet'], failed: [] });
    prepPostQuery.mockImplementation(({ query }, inputs) => `${query}::${inputs?.sort_dir?.value}`);
    runDuckDBQuery.mockImplementation(async () => {
      runQueryCalls += 1;
      return { mock: 'arrow' };
    });
    // Fresh array/object reference each call but value-stable content — mirrors
    // a real fetch returning identical rows on identical inputs.
    processArrowResult.mockImplementation(() => [{ x: 1 }, { x: 2 }]);
  });

  test('input-driven insight settles without a setState storm', async () => {
    // Seed the input value so the insight is NOT pending — the input-driven path
    // that previously looped.
    act(() => {
      useStore.getState().setDefaultInputJobValue('sort_dir', 'ASC');
    });

    const { result } = renderHook(() => useInsightsData('project1', ['sorted_insight']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['sorted_insight']?.data).toEqual([
        { x: 1 },
        { x: 2 },
      ]);
    });

    // Let any feedback-driven refetches flush. If the effect were unstable the
    // queryFn (and runDuckDBQuery) would fire unbounded times here.
    const fetchesAfterSettle = fetchInsights.mock.calls.length;
    const queriesAfterSettle = runQueryCalls;
    await flush(150);

    // A healthy hook does not re-fetch/re-query on its own write-back. Allow a
    // tiny slack (<=1) for a single metadata-discovery refetch, but NOT a storm.
    expect(fetchInsights.mock.calls.length - fetchesAfterSettle).toBeLessThanOrEqual(1);
    expect(runQueryCalls - queriesAfterSettle).toBeLessThanOrEqual(1);

    // Total executions stay bounded across the whole lifecycle.
    expect(fetchInsights.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.current.hasAllInsightData).toBe(true);
  });

  test('pending→ready transition settles without a queryFn storm', async () => {
    // Mirror the canvas first-load: the insight depends on an input whose value
    // is NOT yet set. processInsight returns data:null + pendingInputs, then the
    // input default lands and the query re-runs. This pending→ready flip is the
    // suspected canvas loop trigger.
    const { result } = renderHook(() => useInsightsData('project1', ['sorted_insight']), {
      wrapper: createWrapper(),
    });

    // First settle: insight should be pending (no input yet).
    await waitFor(() => {
      expect(useStore.getState().insightJobs['sorted_insight']).toBeTruthy();
    });
    await flush(80);
    expect(useStore.getState().insightJobs['sorted_insight']?.data).toBeNull();

    // Now the input default arrives (as it does on dashboard mount).
    act(() => {
      useStore.getState().setDefaultInputJobValue('sort_dir', 'ASC');
    });

    await waitFor(
      () => {
        expect(useStore.getState().insightJobs['sorted_insight']?.data).toEqual([
          { x: 1 },
          { x: 2 },
        ]);
      },
      { timeout: 3000 }
    );

    const fetchesAfterReady = fetchInsights.mock.calls.length;
    const queriesAfterReady = runQueryCalls;
    await flush(200);

    // After it becomes ready, no runaway re-fetch from the store write-back.
    expect(fetchInsights.mock.calls.length - fetchesAfterReady).toBeLessThanOrEqual(1);
    expect(runQueryCalls - queriesAfterReady).toBeLessThanOrEqual(1);
    expect(result.current.hasAllInsightData).toBe(true);
  });

  test('a genuine input-value change re-runs the query (input-driven refresh preserved)', async () => {
    act(() => {
      useStore.getState().setDefaultInputJobValue('sort_dir', 'ASC');
    });

    renderHook(() => useInsightsData('project1', ['sorted_insight']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['sorted_insight']?.data).toBeTruthy();
    });
    await flush();

    const fetchesBeforeChange = fetchInsights.mock.calls.length;

    // Change the relevant input value — this MUST re-key the query and re-run
    // the queryFn (the insight depends on ${sort_dir.value}).
    act(() => {
      useStore.getState().setInputJobValue('sort_dir', 'DESC');
    });

    await waitFor(
      () => {
        expect(fetchInsights.mock.calls.length).toBeGreaterThan(fetchesBeforeChange);
      },
      { timeout: 3000 }
    );
  });
});
