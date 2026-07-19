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

  // VIS-1092 — per-insight state: a mixed-lane chart (one insight succeeds,
  // one errors) must never let the erroring insight's status contaminate
  // the succeeding insight's status.
  test('mixed-lane chart: one insight succeeding does not get contaminated by a sibling insight erroring', async () => {
    seedState({
      explorerChartInsightNames: ['ins_ok', 'ins_bad'],
      explorerInsightStates: {
        ins_ok: {
          type: 'scatter',
          props: { x: '?{${ref(orders_q).region}}' },
          interactions: [],
        },
        ins_bad: {
          type: 'scatter',
          props: { x: '?{${ref(orders_q).region}}' },
          interactions: [],
        },
      },
    });
    compileDraftInsight
      .mockResolvedValueOnce({
        post_query: 'SELECT 1',
        static_props: {},
        props_mapping: {},
        props_slices: {},
        split_key: null,
        type: 'scatter',
        models: [],
      })
      .mockRejectedValueOnce(new Error('ins_bad blew up'));
    runDuckDBQuery.mockResolvedValueOnce({ fake: 'arrow-result' });
    processArrowResult.mockReturnValueOnce([{ a: 1 }]);

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // ins_ok rendered fine — its own entry landed and its per-insight status
    // carries no error/loading, regardless of ins_bad's fate.
    expect(useStore.getState().insightJobs[draftInsightKey('ins_ok')]?.data).toEqual([{ a: 1 }]);
    expect(result.current.perInsight.ins_ok).toMatchObject({
      isLoading: false,
      error: null,
      blockedReason: null,
    });

    // ins_bad's OWN status carries the error — it never leaks onto ins_ok.
    expect(result.current.perInsight.ins_bad).toMatchObject({
      isLoading: false,
      error: 'ins_bad blew up',
    });
    expect(useStore.getState().insightJobs[draftInsightKey('ins_bad')]).toBeUndefined();
  });

  // VIS-1094 — request-ordering guard: a slower FIRST compile chain must
  // never clobber a faster SECOND chain's already-applied write, even
  // though the first one was triggered earlier.
  test('a slower first compile chain does not clobber a faster second chain (out-of-order resolution guard)', async () => {
    let resolveFirstCompile;
    let resolveSecondCompile;
    compileDraftInsight
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirstCompile = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecondCompile = resolve; }));

    const compiledBase = {
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    };
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow-result' });
    processArrowResult.mockReturnValue([{ value: 'FRESH_SECOND' }]);

    const { rerender } = renderHook(() => useDraftInsightPreview());

    // Generation 1 fires; its compile call is left pending.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(1);

    // A rapid second edit (still before generation 1 resolves) arms + fires
    // generation 2.
    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: {
            ...s.explorerInsightStates.my_insight,
            props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' },
          },
        },
      }));
    });
    rerender();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(2);

    // Generation 2 (the NEWER pass) resolves and completes its full chain
    // FIRST — this is the realistic "second edit's response comes back
    // faster" case.
    await act(async () => {
      resolveSecondCompile(compiledBase);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([
      { value: 'FRESH_SECOND' },
    ]);

    // Generation 1 (the STALE, slower pass) FINALLY resolves — the guard
    // must stop it BEFORE it ever writes: its own downstream pipeline
    // short-circuits once it notices it's stale (processArrowResult/
    // updateInsightJob are never called a second time), so generation 2's
    // already-applied result is left untouched.
    await act(async () => {
      resolveFirstCompile(compiledBase);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(processArrowResult).toHaveBeenCalledTimes(1);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([
      { value: 'FRESH_SECOND' },
    ]);
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
