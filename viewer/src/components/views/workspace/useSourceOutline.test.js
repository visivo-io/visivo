/**
 * useSourceOutline cancellation + load tests (VIS-1004).
 *
 * The hook feeds the right-rail source outline from the backend-cached
 * schema. The critical contract pinned here: cancellation is PER-INVOCATION
 * (an epoch captured by each async closure), so an in-flight load started for
 * source A can never write A's tables into source B's panel state after a
 * switch. (A single shared `cancelledRef` boolean was reset by the NEXT
 * source's effect, which is exactly how that cross-write happened —
 * RightRail mounts SourceOutlineTreePanel without a key, so the instance is
 * reused across source selections.)
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useStore from '../../../stores/store';
import useSourceOutline from './useSourceOutline';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../../api/sourceSchemaJobs';

jest.mock('../../../contexts/URLContext', () => ({
  isAvailable: () => true,
}));
jest.mock('../../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
}));

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
    fetchSourceTables.mockResolvedValue([{ name: 't1', column_count: 2 }]);

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
    let resolveATables;
    const aTables = new Promise(resolve => {
      resolveATables = resolve;
    });
    fetchSourceTables.mockImplementation(src =>
      src === 'A' ? aTables : Promise.resolve(['b_table'])
    );

    const { result, rerender } = renderHook(({ src }) => useSourceOutline(src), {
      initialProps: { src: 'A' },
    });
    // Switch to B while A's table fetch is still in flight. A shared boolean
    // cancel flag gets RESET by B's effect, so A's late write would land in
    // B's panel state; the per-invocation epoch must keep A cancelled.
    rerender({ src: 'B' });
    await waitFor(() => expect(result.current.nodes?.[0]?.name).toBe('B'));

    await act(async () => {
      resolveATables(['a_table']);
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
    fetchSourceTables.mockResolvedValue(['t1']);

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
  });

  test('a failing TABLES fetch (warm source) surfaces a retryable error, not a bare tree', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceTables.mockRejectedValue(new Error('tables boom'));

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('tables boom');
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
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });

  test('lazy column loads record a per-table error entry instead of throwing', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: 'A', has_cached_schema: true }]);
    fetchSourceTables.mockResolvedValue([{ name: 't1', column_count: 1 }]);
    fetchTableColumns.mockRejectedValue(new Error('cols boom'));

    const { result } = renderHook(() => useSourceOutline('A'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const tKey = 'source-outline::A::db::A::table::t1';
    await act(async () => {
      await result.current.loadFlatColumns(tKey);
    });
    expect(result.current.flatColumns[tKey]).toEqual({ error: 'cols boom' });

    // A key that is not a table key never fetches.
    fetchTableColumns.mockClear();
    await act(async () => {
      await result.current.loadFlatColumns('source-outline::A::db::A');
    });
    expect(fetchTableColumns).not.toHaveBeenCalled();

    // An already-resolved key (even an error entry) is not re-fetched.
    await act(async () => {
      await result.current.loadFlatColumns(tKey);
    });
    expect(fetchTableColumns).not.toHaveBeenCalled();
  });
});
