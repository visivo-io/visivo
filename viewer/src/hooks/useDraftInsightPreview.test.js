/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { renderHook, act } from '@testing-library/react';
import useStore from '../stores/store';
import useDraftInsightPreview, { draftInsightKey } from './useDraftInsightPreview';
import { useDuckDB } from '../contexts/DuckDBContext';
import { getConnection } from '../duckdb/duckdb';
import { runDuckDBQuery } from '../duckdb/queries';
import { compileDraftInsight } from '../api/insightCompile';
import { processArrowResult } from '../duckdb/resultProcessing';

jest.mock('../contexts/DuckDBContext', () => ({ useDuckDB: jest.fn() }));
jest.mock('../duckdb/duckdb', () => ({ getConnection: jest.fn() }));
jest.mock('../duckdb/queries', () => ({
  runDuckDBQuery: jest.fn(),
  prepPostQuery: jest.fn(({ query }) => query),
}));
jest.mock('../duckdb/resultProcessing', () => ({ processArrowResult: jest.fn() }));
jest.mock('../api/insightCompile', () => ({ compileDraftInsight: jest.fn() }));

const FAKE_DB = { registerFileText: jest.fn(), dropFile: jest.fn() };
const FAKE_CONN = { query: jest.fn() };

const seedState = (overrides = {}) => {
  act(() => {
    useStore.setState({
      explorerChartInsightNames: ['my_insight'],
      explorerInsightStates: {
        my_insight: {
          type: 'scatter',
          props: { x: '?{${ref(orders_q).region}}', y: '?{sum(${ref(orders_q).amount})}' },
          interactions: [],
        },
      },
      explorerModelStates: {
        orders_q: {
          sql: 'select * from orders',
          sourceName: 'warehouse',
          queryResult: {
            columns: ['region', 'amount'],
            rows: [{ region: 'west', amount: 10 }],
          },
        },
      },
      inputJobs: {},
      insightJobs: {},
      updateInsightJob: (name, data) =>
        useStore.setState(s => ({ insightJobs: { ...s.insightJobs, [name]: { ...(s.insightJobs[name] || {}), ...data } } })),
      removeInsightJob: name =>
        useStore.setState(s => {
          const next = { ...s.insightJobs };
          delete next[name];
          return { insightJobs: next };
        }),
      ...overrides,
    });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useDuckDB.mockReturnValue(FAKE_DB);
  getConnection.mockResolvedValue(FAKE_CONN);
  seedState();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe('useDraftInsightPreview', () => {
  test('no chart insights -> no compile call, empty previewInsightKeys', () => {
    seedState({ explorerChartInsightNames: [], explorerInsightStates: {} });
    const { result } = renderHook(() => useDraftInsightPreview());
    expect(result.current.previewInsightKeys).toEqual([]);
    act(() => jest.advanceTimersByTime(2000));
    expect(compileDraftInsight).not.toHaveBeenCalled();
  });

  test('compiles a draft insight after the debounce, registers the model table, runs the query, and writes the synthetic entry', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT * FROM "mhash1"',
      pre_query: null,
      props_mapping: { 'props.x': 'a' },
      static_props: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [{ name: 'orders_q', name_hash: 'mhash1' }],
    });
    runDuckDBQuery.mockResolvedValueOnce({ fake: 'arrow-result' });
    processArrowResult.mockReturnValueOnce([{ a: 1 }]);

    const { result } = renderHook(() => useDraftInsightPreview());
    expect(result.current.previewInsightKeys).toEqual([draftInsightKey('my_insight')]);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(compileDraftInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        insight: expect.objectContaining({
          name: 'my_insight',
          props: expect.objectContaining({ type: 'scatter' }),
        }),
        draftModels: [
          { name: 'orders_q', sql: 'select * from orders', source: '${ref(warehouse)}' },
        ],
      })
    );
    // Model table registered under the compiled model_hash.
    expect(FAKE_DB.registerFileText).toHaveBeenCalledWith(
      expect.stringContaining('draft_model_mhash1_'),
      JSON.stringify([{ region: 'west', amount: 10 }])
    );
    expect(FAKE_CONN.query).toHaveBeenCalledWith(expect.stringContaining('"mhash1"'));
    expect(runDuckDBQuery).toHaveBeenCalled();

    const entry = useStore.getState().insightJobs[draftInsightKey('my_insight')];
    expect(entry.data).toEqual([{ a: 1 }]);
    expect(entry.type).toBe('scatter');
    expect(entry.pendingInputs).toBeNull();
  });

  test('a required-but-missing input yields pendingInputs instead of running the query', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT * WHERE region = ${region.value}',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(runDuckDBQuery).not.toHaveBeenCalled();
    const entry = useStore.getState().insightJobs[draftInsightKey('my_insight')];
    expect(entry.data).toBeNull();
    expect(entry.pendingInputs).toEqual(['region']);
  });

  test('a model_not_run 422 sets blockedReason and removes any stale draft entry', async () => {
    const err = new Error('Missing schema for model: orders_q.');
    err.errorType = 'model_not_run';
    err.modelName = 'orders_q';
    compileDraftInsight.mockRejectedValueOnce(err);

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.blockedReason).toBe('model_not_run');
    expect(result.current.blockedModel).toBe('orders_q');
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeUndefined();
  });

  test('a generic compile error surfaces via `error`, not blockedReason', async () => {
    compileDraftInsight.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.blockedReason).toBeNull();
  });

  test('removing an insight from the chart cleans up its synthetic entry', async () => {
    compileDraftInsight.mockResolvedValue({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow-result' });
    processArrowResult.mockReturnValue([{ a: 1 }]);

    const { rerender } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeDefined();

    act(() => {
      useStore.setState({ explorerChartInsightNames: [] });
    });
    rerender();

    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeUndefined();
  });

  test('unmount cleans up every synthetic entry it wrote', async () => {
    compileDraftInsight.mockResolvedValue({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow-result' });
    processArrowResult.mockReturnValue([{ a: 1 }]);

    const { unmount } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeDefined();

    unmount();
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeUndefined();
  });
});
