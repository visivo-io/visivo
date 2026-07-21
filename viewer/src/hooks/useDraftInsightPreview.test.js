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

  // ux-audit.md "draft-preview execution gap" (BLOCKER — cold-start #1,
  // promote-roundtrip #1): compile can succeed (200) even when the model's
  // rows were never actually loaded client-side. Executing post_query
  // anyway used to hand DuckDB a query against a table this hook never
  // created, surfacing a raw "Catalog Error: Table with name <hash> does
  // not exist" — this must instead behave exactly like the server's own
  // model_not_run 422 (the guided "run the query" empty state), and DuckDB
  // must never even be asked.
  test('a compiled model with no loaded rows never reaches DuckDB — blocked like model_not_run instead', async () => {
    seedState({
      explorerModelStates: {
        orders_q: {
          sql: 'select * from orders',
          sourceName: 'warehouse',
          queryResult: null, // never run — no rows
        },
      },
    });
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

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.blockedReason).toBe('model_not_run');
    expect(result.current.blockedModel).toBe('orders_q');
    expect(FAKE_DB.registerFileText).not.toHaveBeenCalled();
    expect(runDuckDBQuery).not.toHaveBeenCalled();
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeUndefined();
  });

  // ux-audit.md "infinite spinner" finding (cold-start #2, pills #3): an
  // insight with nothing mapped (no data-bearing props at all) has nothing
  // to compile — the caller must be able to tell "nothing to preview" apart
  // from "still loading" instead of spinning forever.
  test('an insight with no data props at all is blocked as no_data_props, never compiled', async () => {
    seedState({
      explorerInsightStates: {
        my_insight: { type: 'scatter', props: {}, interactions: [] },
      },
    });

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(compileDraftInsight).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe('no_data_props');
    expect(result.current.isLoading).toBe(false);
  });

  // Belt-and-braces (ux-audit.md's own fix direction): even if some other
  // path still reaches DuckDB against an unregistered draft table, the raw
  // hashed-table error must never surface as `error` — it maps to the same
  // guided blocked state.
  test('a hashed-table DuckDB catalog error is treated as model_not_run, never leaked as a raw error', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT * FROM "mhash1"',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [], // empty models list bypasses the pre-execution guard on purpose
    });
    runDuckDBQuery.mockRejectedValueOnce(
      new Error('Catalog Error: Table with name mfiawdybhqqkwzuxbjzfxqbvbaibc does not exist! Did you mean "pg_index"?')
    );

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.blockedReason).toBe('model_not_run');
    expect(result.current.error).toBeNull();
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

  // A chart insight name with no matching entry in explorerInsightStates at
  // all (e.g. a name added to the chart before its state initialized) must
  // reset to the empty status and never attempt a compile for it.
  test('a chart insight name with no matching insightStates entry is reset to empty status, never compiled', async () => {
    seedState({
      explorerChartInsightNames: ['ghost_insight'],
      explorerInsightStates: {},
    });
    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).not.toHaveBeenCalled();
    expect(result.current.perInsight.ghost_insight).toEqual({
      isLoading: false,
      error: null,
      blockedReason: null,
      blockedModel: null,
    });
  });

  // extractInputDependencies recurses through arrays and nested objects in
  // static_props (the same extractor real insights use via `useInsightsData`)
  // — a ref buried in an array element or a nested object must still be
  // found, not just a bare top-level string.
  test('finds input refs nested inside arrays/objects in static_props, not just the top-level query string', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT 1', // no ${} refs here at all
      static_props: {
        title: '${quarter.value}',
        filters: ['${region.value}', 'a plain string'],
        nested: { deep: { value: '${segment.value}' } },
      },
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

    expect(runDuckDBQuery).not.toHaveBeenCalled(); // all 3 inputs are missing
    const entry = useStore.getState().insightJobs[draftInsightKey('my_insight')];
    expect(entry.pendingInputs.sort()).toEqual(['quarter', 'region', 'segment']);
  });

  // Interactions carrying a real filter value are forwarded to compile as
  // `{ [type]: value }`; an interaction with no value at all is dropped
  // rather than sent as e.g. `{ filter: undefined }`.
  test('forwards only interactions that carry a value, mapped to {[type]: value}', async () => {
    seedState({
      explorerInsightStates: {
        my_insight: {
          type: 'scatter',
          props: { x: '?{${ref(orders_q).region}}' },
          interactions: [
            { type: 'filter', value: 'region = "west"' },
            { type: 'sort', value: null }, // no value -> dropped
          ],
        },
      },
    });
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });
    runDuckDBQuery.mockResolvedValueOnce({ fake: 'arrow-result' });
    processArrowResult.mockReturnValueOnce([{ a: 1 }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(compileDraftInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        insight: expect.objectContaining({
          interactions: [{ filter: 'region = "west"' }],
        }),
      })
    );
  });

  // The recursive static_props scanner (extractInputNamesFromObject) must
  // tolerate empty strings (its own falsy-text guard), and values that are
  // neither strings, arrays, nor non-null objects (numbers, booleans, null)
  // — none of these should throw or contribute a bogus input name.
  test('the recursive static_props scanner tolerates empty strings and non-object/array/string values', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT 1',
      static_props: {
        title: '', // empty string -> extractInputNamesFromString's falsy-text guard
        count: 5, // number -> not string/array/non-null-object
        enabled: true, // boolean -> same
        nothing: null, // null -> excluded by the `value !== null` check
        real: '${quarter.value}',
      },
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
    const entry = useStore.getState().insightJobs[draftInsightKey('my_insight')];
    expect(entry.pendingInputs).toEqual(['quarter']);
  });

  // An insight that STAYS on the chart across a debounce re-fire must not be
  // touched by the "insight removed" cleanup pass — only insights that
  // actually left `chartInsightNames` get their synthetic entry removed.
  test('an insight that remains on the chart across re-fires keeps its synthetic entry (cleanup else-branch)', async () => {
    compileDraftInsight.mockResolvedValue({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow' });
    processArrowResult.mockReturnValue([{ a: 1 }]);

    const { rerender } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeDefined();

    // A second edit re-fires the debounce with the SAME insight still present.
    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: { ...s.explorerInsightStates.my_insight, props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' } },
        },
      }));
    });
    rerender();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Still present — the cleanup pass's "still current" branch never removed it.
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]).toBeDefined();
  });

  test('an insight state with no `props` key at all is treated exactly like no data props (state.props || {} fallback)', async () => {
    seedState({
      explorerInsightStates: {
        my_insight: { type: 'scatter', interactions: [] }, // no `props` key at all
      },
    });
    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe('no_data_props');
  });

  test('an insight state with no `interactions` key at all compiles with no interactions sent (state.interactions || [] fallback)', async () => {
    seedState({
      explorerInsightStates: {
        my_insight: { type: 'scatter', props: { x: '?{${ref(orders_q).region}}' } }, // no `interactions` key
      },
    });
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    });
    runDuckDBQuery.mockResolvedValueOnce({ fake: 'arrow' });
    processArrowResult.mockReturnValueOnce([{ a: 1 }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(compileDraftInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        insight: expect.not.objectContaining({ interactions: expect.anything() }),
      })
    );
  });

  test('a compile response with no `models` key at all is treated as zero referenced models (compiled.models || [] fallback)', async () => {
    compileDraftInsight.mockResolvedValueOnce({
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      // no `models` key at all
    });
    runDuckDBQuery.mockResolvedValueOnce({ fake: 'arrow' });
    processArrowResult.mockReturnValueOnce([{ a: 1 }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(FAKE_DB.registerFileText).not.toHaveBeenCalled();
    const entry = useStore.getState().insightJobs[draftInsightKey('my_insight')];
    expect(entry.data).toEqual([{ a: 1 }]);
  });

  // A model already registered under the SAME row-count+SQL fingerprint (no
  // change since the last successful debounce pass) must be skipped, never
  // re-materialized into DuckDB on every keystroke.
  test('re-registering the same unchanged model on a later debounce pass is skipped (fingerprint cache hit)', async () => {
    const compiledWithModel = {
      post_query: 'SELECT * FROM "mhash1"',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [{ name: 'orders_q', name_hash: 'mhash1' }],
    };
    compileDraftInsight.mockResolvedValue(compiledWithModel);
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow' });
    processArrowResult.mockReturnValue([{ a: 1 }]);

    const { rerender } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(FAKE_DB.registerFileText).toHaveBeenCalledTimes(1);

    // A second edit re-fires the debounce; orders_q's sql/row-count are
    // completely unchanged, so the fingerprint still matches.
    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: { ...s.explorerInsightStates.my_insight, props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' } },
        },
      }));
    });
    rerender();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Second pass skipped re-registration via the fingerprint cache.
    expect(FAKE_DB.registerFileText).toHaveBeenCalledTimes(1);
    expect(compileDraftInsight).toHaveBeenCalledTimes(2);
  });

  test('a model_not_run error with no modelName at all sets blockedModel to null (err.modelName || null fallback)', async () => {
    const err = new Error('Missing schema.');
    err.errorType = 'model_not_run';
    // no err.modelName at all
    compileDraftInsight.mockRejectedValueOnce(err);

    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.blockedReason).toBe('model_not_run');
    expect(result.current.blockedModel).toBeNull();
  });

  // Both the hashed-table detection AND the generic catch-all read
  // `err?.message` with a fallback (`''` / `String(err)`) — a rejection
  // value with no `.message` property at all (not an Error instance)
  // exercises both fallbacks in one shot.
  test('a rejection with no .message property at all is handled via both fallbacks, never throwing', async () => {
    compileDraftInsight.mockRejectedValueOnce({ code: 'WEIRD_FAILURE' }); // plain object, no .message
    const { result } = renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.blockedReason).toBeNull();
    expect(result.current.error).toBe('[object Object]');
  });

  // VIS-1094 — the request-ordering guard has FOUR separate isStale()
  // checkpoints, not just the one right after compile resolves. This one
  // covers the checkpoint AFTER the model-registration loop (line ~310) —
  // a stale generation whose registration work finishes late must not go on
  // to run the query or write insightJobs.
  test('a generation that goes stale during the model-registration loop is discarded (post-registration stale check)', async () => {
    const compiledWithModel = () => ({
      post_query: 'SELECT * FROM "mhash1"',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [{ name: 'orders_q', name_hash: 'mhash1' }],
    });
    let resolveGen1Register;
    compileDraftInsight.mockResolvedValueOnce(compiledWithModel()).mockResolvedValueOnce(compiledWithModel());
    FAKE_DB.registerFileText
      .mockImplementationOnce(() => new Promise(resolve => { resolveGen1Register = resolve; }))
      .mockResolvedValueOnce(undefined);
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow' });
    // gen1 is discarded at the post-registration stale check BEFORE it ever
    // reaches runDuckDBQuery/processArrowResult — only gen2 calls this, once.
    // `mockReset()` guards against any unconsumed `mockReturnValueOnce` queue
    // leaking in from an earlier test (`clearAllMocks` in beforeEach does not
    // clear queued "Once" implementations, only call history).
    processArrowResult.mockReset();
    processArrowResult.mockReturnValueOnce([{ value: 'FRESH' }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(1); // gen1 blocked inside registerFileText

    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: { ...s.explorerInsightStates.my_insight, props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' } },
        },
      }));
    });
    // Generation 2's own pass has a longer await chain (getConnection ->
    // registerFileText -> conn.query -> dropFile -> runDuckDBQuery) than a
    // single fake-timer advance flushes on its own — drain the extra
    // microtask hops explicitly rather than relying on one `act()` tick.
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(2);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);

    // gen1's deferred registration FINALLY resolves — generationRef has
    // already moved to gen2, so gen1 must stop at the post-registration
    // stale check without ever calling runDuckDBQuery/processArrowResult a
    // second time or clobbering gen2's data.
    await act(async () => {
      resolveGen1Register(undefined);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(processArrowResult).toHaveBeenCalledTimes(1);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);
  });

  // Same guard, the checkpoint right AFTER runDuckDBQuery resolves (line
  // ~335) — the actual VIS-1094 scenario the "slower first vs faster
  // second" test already covers up to the compile-resolution checkpoint;
  // this one specifically races the DB QUERY step instead of the compile
  // step.
  test('a generation that goes stale while its own runDuckDBQuery is still in flight is discarded (post-query stale check)', async () => {
    const compiledBase = {
      post_query: 'SELECT 1',
      static_props: {},
      props_mapping: {},
      props_slices: {},
      split_key: null,
      type: 'scatter',
      models: [],
    };
    let resolveGen1Query;
    compileDraftInsight.mockResolvedValueOnce(compiledBase).mockResolvedValueOnce(compiledBase);
    runDuckDBQuery
      .mockImplementationOnce(() => new Promise(resolve => { resolveGen1Query = resolve; }))
      .mockResolvedValueOnce({ fake: 'gen2-arrow' });
    // gen1 is discarded at the post-query stale check BEFORE it ever calls
    // processArrowResult — only gen2 calls this, once. See the mockReset()
    // note in the post-registration test above for why this is necessary.
    processArrowResult.mockReset();
    processArrowResult.mockReturnValueOnce([{ value: 'FRESH' }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(1);
    expect(runDuckDBQuery).toHaveBeenCalledTimes(1); // gen1 blocked inside runDuckDBQuery

    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: { ...s.explorerInsightStates.my_insight, props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' } },
        },
      }));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(2);
    expect(runDuckDBQuery).toHaveBeenCalledTimes(2);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);

    await act(async () => {
      resolveGen1Query({ fake: 'gen1-arrow' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(processArrowResult).toHaveBeenCalledTimes(1);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);
  });

  // The FOURTH isStale() checkpoint — inside the catch block (line ~352) —
  // a generation whose compile call ultimately REJECTS late (after a newer
  // generation already completed) must not clobber the fresh result with an
  // error either.
  test('a generation that goes stale before its own rejection resolves is discarded in the catch block (catch-block stale check)', async () => {
    let rejectGen1;
    compileDraftInsight
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectGen1 = reject; }))
      .mockResolvedValueOnce({
        post_query: 'SELECT 1',
        static_props: {},
        props_mapping: {},
        props_slices: {},
        split_key: null,
        type: 'scatter',
        models: [],
      });
    runDuckDBQuery.mockResolvedValue({ fake: 'arrow' });
    // Belt-and-braces against any unconsumed `mockReturnValueOnce` queue
    // leaking in from an earlier test (see the note in the two tests above).
    processArrowResult.mockReset();
    processArrowResult.mockReturnValue([{ value: 'FRESH' }]);

    renderHook(() => useDraftInsightPreview());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(1); // gen1 pending

    act(() => {
      useStore.setState(s => ({
        explorerInsightStates: {
          my_insight: { ...s.explorerInsightStates.my_insight, props: { ...s.explorerInsightStates.my_insight.props, x: '?{${ref(orders_q).other}}' } },
        },
      }));
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(compileDraftInsight).toHaveBeenCalledTimes(2);
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);

    // gen1's compile FINALLY rejects — already stale — must be swallowed
    // silently, never overwriting gen2's successful entry with an error.
    await act(async () => {
      rejectGen1(new Error('gen1 finally failed'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useStore.getState().insightJobs[draftInsightKey('my_insight')]?.data).toEqual([{ value: 'FRESH' }]);
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
