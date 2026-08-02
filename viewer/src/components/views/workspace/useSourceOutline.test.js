/**
 * useSourceOutline cancellation + load tests (VIS-1004).
 *
 * The hook feeds the right-rail source outline from the backend-cached schema.
 * Two contracts are pinned here.
 *
 * 1. Cancellation is PER-INVOCATION (an epoch captured by each async closure),
 *    so an in-flight load started for source A can never write A's tables into
 *    source B's panel state after a switch. (A single shared `cancelledRef`
 *    boolean was reset by the NEXT source's effect, which is exactly how that
 *    cross-write happened — RightRail mounts SourceOutlineTreePanel without a
 *    key, so the instance is reused across source selections.)
 *
 * 2. ONE request per source. Tables and columns are both sliced from a single
 *    schema envelope; expanding a table costs nothing. It used to cost a
 *    request per table on top of one for the list.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useStore from '../../../stores/store';
import useSourceOutline from './useSourceOutline';
import {
  fetchSourceSchemaJobs,
  fetchSourceSchema,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../../api/sourceSchemaJobs';

jest.mock('../../../contexts/URLContext', () => ({
  isAvailable: () => true,
}));
jest.mock('../../../api/sourceSchemaJobs', () => {
  // The slicers are pure functions over the fetched record — keep the real
  // ones so these tests exercise the same derivation the hook does.
  const actual = jest.requireActual('../../../api/sourceSchemaJobs');
  return {
    ...actual,
    fetchSourceSchemaJobs: jest.fn(),
    generateSourceSchema: jest.fn(),
    fetchSchemaGenerationStatus: jest.fn(),
    fetchSourceSchema: jest.fn(),
  };
});

/** The stored envelope: tables -> columns -> {type, nullable}. */
const envelope = tables => ({ source_name: 'A', tables });

const ONE_TABLE = envelope({
  t1: { columns: { id: { type: 'INTEGER' }, amount: { type: 'DOUBLE' } } },
});

describe('useSourceOutline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Evict the per-session outline cache so every test fetches fresh.
    act(() => {
      useStore.setState({ workspaceSourceOutlineDataCache: {} });
    });
  });

  test('loads the cached flat tables for a warm source', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockResolvedValue(ONE_TABLE);

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.nodes).toHaveLength(1);
    // NB: `children` here is the hook's plain data tree, not a DOM node —
    // matched structurally to keep testing-library/no-node-access happy.
    expect(result.current.nodes[0]).toMatchObject({
      kind: 'database',
      name: 'A',
      children: [expect.objectContaining({ kind: 'table', name: 't1', columnCount: 2 })],
    });
  });

  test("a source switch cancels the previous source's in-flight load (shared-cancel regression)", async () => {
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: 'A', has_cached_schema: true },
      { source_name: 'B', has_cached_schema: true },
    ]);
    let resolveA;
    const aSchema = new Promise(resolve => {
      resolveA = resolve;
    });
    fetchSourceSchema.mockImplementation(src =>
      src === 'A' ? aSchema : Promise.resolve(envelope({ b_table: { columns: {} } }))
    );

    const { result, rerender } = renderHook(({ src }) => useSourceOutline(src), {
      initialProps: { src: 'A' },
    });
    // Switch to B while A's schema fetch is still in flight. A shared boolean
    // cancel flag gets RESET by B's effect, so A's late write would land in
    // B's panel state; the per-invocation epoch must keep A cancelled.
    rerender({ src: 'B' });
    await waitFor(() => expect(result.current.nodes?.[0]?.name).toBe('B'));

    await act(async () => {
      resolveA(envelope({ a_table: { columns: {} } }));
      await Promise.resolve();
    });

    expect(result.current.nodes[0]).toMatchObject({
      name: 'B',
      children: [expect.objectContaining({ name: 'b_table' })],
    });
    expect(result.current.status).toBe('ready');
  });

  test('a transient schema-jobs failure is retryable and never poisons the session cache', async () => {
    // The listing fails once (network blip), then succeeds. The failed read
    // resolves hasCachedSchema to null (UNKNOWN) — caching that as a 'ready'
    // entry dead-ended every re-select for the rest of the session (no tree,
    // and no Generate prompt since isCold requires an authoritative false).
    fetchSourceSchemaJobs
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockResolvedValue(ONE_TABLE);

    const { result: firstResult, unmount: unmountFirst } = renderHook(() =>
      useSourceOutline('A')
    );
    // The failure surfaces as a retryable error — NOT a silent 'ready'.
    await waitFor(() => expect(firstResult.current.status).toBe('error'));
    expect(firstResult.current.error).toBeTruthy();
    // (a) The unknown result is never written to the session cache.
    expect(useStore.getState().workspaceSourceOutlineDataCache?.A).toBeUndefined();
    unmountFirst();

    // (b) Re-selecting the source misses the cache, re-fetches, and recovers
    // with the real tree.
    const { result: secondResult, unmount: unmountSecond } = renderHook(() =>
      useSourceOutline('A')
    );
    await waitFor(() => expect(secondResult.current.status).toBe('ready'));
    expect(secondResult.current.nodes[0]).toMatchObject({
      name: 'A',
      children: [expect.objectContaining({ name: 't1' })],
    });
    unmountSecond();
  });

  test('an authoritative COLD source is still cached (only UNKNOWN skips the cache)', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: false }]);

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isCold).toBe(true);
    expect(useStore.getState().workspaceSourceOutlineDataCache?.A).toMatchObject({
      hasCachedSchema: false,
    });
    // Cold means "nothing stored yet", so there is no envelope to ask for.
    expect(fetchSourceSchema).not.toHaveBeenCalled();
  });

  test('a failing SCHEMA fetch (warm source) surfaces a retryable error, not a bare tree', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockRejectedValue(new Error('schema boom'));

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('schema boom');
    // The error is not cached — a re-select would re-fetch.
    expect(useStore.getState().workspaceSourceOutlineDataCache?.A).toBeUndefined();
  });

  test('a FAILED schema generation surfaces the run error and clears the progress state', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: false }]);
    generateSourceSchema.mockResolvedValue({ run_id: 'run-9' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'failed', error: 'duckdb locked' });

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.isCold).toBe(true));

    await act(async () => {
      await result.current.generateSchema();
    });

    expect(result.current.error).toBe('duckdb locked');
    expect(result.current.generating).toBeNull();
    // Still cold — the user can retry Generate.
    expect(result.current.isCold).toBe(true);
    expect(fetchSourceSchema).not.toHaveBeenCalled();
  });

  test('expanding tables slices the envelope and issues NO further requests', async () => {
    // The whole point of the change. Every table's columns were already in the
    // response that produced the tree, so expansion is a local slice — a
    // 40-table source used to be 40 sequential round trips for data the server
    // had already assembled into one record.
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockResolvedValue(
      envelope({
        t1: { columns: { id: { type: 'INTEGER' }, amount: { type: 'DOUBLE' } } },
        t2: { columns: { email: { type: 'VARCHAR' } } },
      })
    );

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchSourceSchema).toHaveBeenCalledTimes(1);

    const key = t => `source-outline::A::db::A::table::${t}`;
    await act(async () => {
      await result.current.loadFlatColumns(key('t1'));
      await result.current.loadFlatColumns(key('t2'));
    });

    expect(result.current.flatColumns[key('t1')]).toEqual([
      expect.objectContaining({ kind: 'column', name: 'amount', type: 'DOUBLE' }),
      expect.objectContaining({ kind: 'column', name: 'id', type: 'INTEGER' }),
    ]);
    expect(result.current.flatColumns[key('t2')]).toEqual([
      expect.objectContaining({ name: 'email', type: 'VARCHAR' }),
    ]);
    // Still one. Expanding two tables added nothing.
    expect(fetchSourceSchema).toHaveBeenCalledTimes(1);
  });

  test('a re-selected source can still expand columns from the cached envelope', async () => {
    // The session cache has to carry the envelope, not just the tree. Caching
    // the tree alone made re-selected sources render tables whose columns
    // could no longer be sliced from anything — they simply never expanded.
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockResolvedValue(ONE_TABLE);

    const { unmount } = renderHook(() => useSourceOutline('A'));
    await waitFor(() =>
      expect(useStore.getState().workspaceSourceOutlineDataCache?.A).toBeTruthy()
    );
    unmount();

    fetchSourceSchema.mockClear();
    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchSourceSchema).not.toHaveBeenCalled(); // served from cache

    const tKey = 'source-outline::A::db::A::table::t1';
    await act(async () => {
      await result.current.loadFlatColumns(tKey);
    });
    expect(result.current.flatColumns[tKey]).toEqual([
      expect.objectContaining({ name: 'amount' }),
      expect.objectContaining({ name: 'id' }),
    ]);
  });

  test('a key that is not a table key populates nothing', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceSchema.mockResolvedValue(ONE_TABLE);

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.loadFlatColumns('source-outline::A::db::A');
    });
    expect(result.current.flatColumns).toEqual({});
  });
});
