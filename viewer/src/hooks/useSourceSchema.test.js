/**
 * useSourceSchema — the schema feed behind the SQL editor's autocomplete
 * (`SQLEditor.jsx:61`).
 *
 * Had no test file at all, which is how it kept a sequential
 * fetch-columns-per-table loop: a 40-table source cost 41 serialized round
 * trips before autocomplete worked. It now fetches the envelope once and
 * slices locally, and the request count is pinned here so it cannot regress
 * quietly — nothing about the returned shape would change if it did.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useStore from '../stores/store';
import useSourceSchema from './useSourceSchema';
import { fetchSourceSchema } from '../api/sourceSchemaJobs';

jest.mock('../api/sourceSchemaJobs', () => {
  // The slicers are pure functions over the fetched record — keep the real
  // ones so these tests exercise the same derivation the hook does.
  const actual = jest.requireActual('../api/sourceSchemaJobs');
  return { ...actual, fetchSourceSchema: jest.fn() };
});

/** The stored envelope: tables -> columns -> {type, nullable}. */
const envelope = tables => ({ source_name: 'db', tables });

const TWO_TABLES = envelope({
  orders: {
    columns: { id: { type: 'INTEGER', nullable: false }, amount: { type: 'DOUBLE' } },
  },
  users: { columns: { email: { type: 'VARCHAR' } } },
});

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    useStore.setState({ project: { id: 'proj-1' } });
  });
});

describe('useSourceSchema', () => {
  it('fetches the envelope ONCE and derives both tables and columns from it', async () => {
    fetchSourceSchema.mockResolvedValue(TWO_TABLES);

    const { result } = renderHook(() => useSourceSchema('db'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The point of the change: one request, not one per table.
    expect(fetchSourceSchema).toHaveBeenCalledTimes(1);
    expect(fetchSourceSchema).toHaveBeenCalledWith('db', null, 'proj-1');

    expect(result.current.tables.map(t => t.name)).toEqual(['orders', 'users']);
    expect(result.current.tableColumns.orders.map(c => c.name)).toEqual(['amount', 'id']);
    expect(result.current.tableColumns.users).toEqual([
      { name: 'email', type: 'VARCHAR', nullable: true },
    ]);
  });

  it('stays at one request as the table count grows', async () => {
    const many = {};
    for (let i = 0; i < 40; i += 1) many[`t${i}`] = { columns: { id: { type: 'INTEGER' } } };
    fetchSourceSchema.mockResolvedValue(envelope(many));

    const { result } = renderHook(() => useSourceSchema('db'));
    await waitFor(() => expect(result.current.tables).toHaveLength(40));

    // Was 1 + N, and serialized. This is the assertion that keeps it at 1.
    expect(fetchSourceSchema).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.current.tableColumns)).toHaveLength(40);
  });

  it('passes the runId through when one is given', async () => {
    fetchSourceSchema.mockResolvedValue(TWO_TABLES);
    renderHook(() => useSourceSchema('db', { runId: 'preview-x' }));
    await waitFor(() =>
      expect(fetchSourceSchema).toHaveBeenCalledWith('db', 'preview-x', 'proj-1')
    );
  });

  it('does not fetch without a source name, and clears any prior state', async () => {
    fetchSourceSchema.mockResolvedValue(TWO_TABLES);
    const { result, rerender } = renderHook(({ name }) => useSourceSchema(name), {
      initialProps: { name: 'db' },
    });
    await waitFor(() => expect(result.current.tables).toHaveLength(2));

    fetchSourceSchema.mockClear();
    rerender({ name: null });

    await waitFor(() => expect(result.current.tables).toEqual([]));
    expect(result.current.tableColumns).toEqual({});
    expect(fetchSourceSchema).not.toHaveBeenCalled();
  });

  it('reports a failure and clears the schema rather than serving a stale one', async () => {
    fetchSourceSchema.mockRejectedValue(new Error('source unreachable'));

    const { result } = renderHook(() => useSourceSchema('db'));
    await waitFor(() => expect(result.current.error).toBe('source unreachable'));

    // Autocomplete offering tables that are no longer valid is worse than none.
    expect(result.current.tables).toEqual([]);
    expect(result.current.tableColumns).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('clears a previous error on a later successful load', async () => {
    fetchSourceSchema.mockRejectedValueOnce(new Error('boom'));
    const { result, rerender } = renderHook(({ name }) => useSourceSchema(name), {
      initialProps: { name: 'db' },
    });
    await waitFor(() => expect(result.current.error).toBe('boom'));

    fetchSourceSchema.mockResolvedValue(TWO_TABLES);
    rerender({ name: 'other' });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.tables).toHaveLength(2);
  });

  it('refresh() refetches on demand', async () => {
    fetchSourceSchema.mockResolvedValue(TWO_TABLES);
    const { result } = renderHook(() => useSourceSchema('db'));
    await waitFor(() => expect(fetchSourceSchema).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchSourceSchema).toHaveBeenCalledTimes(2);
  });

  it('refetches when the project changes, not just the source', async () => {
    // projectId is subscribed from the store, so a project switch has to
    // re-scope the request — otherwise autocomplete keeps the old project's
    // tables.
    fetchSourceSchema.mockResolvedValue(TWO_TABLES);
    renderHook(() => useSourceSchema('db'));
    await waitFor(() => expect(fetchSourceSchema).toHaveBeenCalledTimes(1));

    act(() => {
      useStore.setState({ project: { id: 'proj-2' } });
    });

    await waitFor(() =>
      expect(fetchSourceSchema).toHaveBeenLastCalledWith('db', null, 'proj-2')
    );
  });

  it('a slow response for the PREVIOUS source cannot overwrite the current one', async () => {
    // The race `useSourceOutline` carries an epoch guard for. SQLEditor keeps
    // one hook instance and swaps `sourceName`, so switching sources while a
    // request is in flight can land the old source's tables in the new
    // source's autocomplete — offering columns that do not exist.
    let resolveSlow;
    fetchSourceSchema
      .mockImplementationOnce(
        () => new Promise(resolve => {
          resolveSlow = () => resolve(envelope({ stale_table: { columns: {} } }));
        })
      )
      .mockResolvedValueOnce(envelope({ fresh_table: { columns: {} } }));

    const { result, rerender } = renderHook(({ name }) => useSourceSchema(name), {
      initialProps: { name: 'slow_source' },
    });
    rerender({ name: 'fast_source' });
    await waitFor(() => expect(result.current.tables.map(t => t.name)).toEqual(['fresh_table']));

    // The first request only now comes back.
    await act(async () => {
      resolveSlow();
    });

    expect(result.current.tables.map(t => t.name)).toEqual(['fresh_table']);
  });
});
