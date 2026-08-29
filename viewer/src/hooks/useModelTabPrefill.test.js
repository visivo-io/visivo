/**
 * Opening a model tab shows the last run's rows instead of an empty grid.
 *
 * `explorerStore.autoLoadModelData` used to do this and lost the ability when
 * `api/modelData.js` was removed — the rows come from the parquet via DuckDB
 * now, and DuckDB is reachable from a hook, not from a Zustand store.
 *
 * The behaviour worth protecting is what it REFUSES to do: it must never
 * overwrite a query the user just ran, and it must not re-ask for a model that
 * has no parquet.
 */
import { renderHook, waitFor } from '@testing-library/react';
import useStore from '../stores/store';
import { useModelTabPrefill } from './useModelTabPrefill';
import { processModel } from './useModelsData';
import { fetchModelJobs } from '../api/modelJobs';
import { useDuckDB } from '../contexts/DuckDBContext';
import {
  putCachedExplorationResult,
  _resetExplorationResultCacheForTests,
} from '../stores/explorationResultCache';

jest.mock('./useModelsData', () => ({ processModel: jest.fn() }));
jest.mock('../api/modelJobs', () => ({ fetchModelJobs: jest.fn() }));
jest.mock('../contexts/DuckDBContext', () => ({ useDuckDB: jest.fn() }));

const DB = { fake: 'duckdb' };
const ROWS = [
  { id: 1, region: 'east' },
  { id: 2, region: 'west' },
];

// A built model-job for whatever name the hook asks about.
const jobFor = name => ({ name, name_hash: `h_${name}`, signed_data_file_url: `signed/${name}` });

let setModelQueryResult;

beforeEach(() => {
  jest.clearAllMocks();
  _resetExplorationResultCacheForTests();
  useDuckDB.mockReturnValue(DB);
  // Default: the model has built data. Tests that need "not built" override.
  fetchModelJobs.mockImplementation(names => Promise.resolve([jobFor(names[0])]));
  setModelQueryResult = jest.fn();
  useStore.setState({ setModelQueryResult });
});

it('fills an empty tab with the last run rows', async () => {
  processModel.mockResolvedValue({ orders: { name: 'orders', data: ROWS } });

  renderHook(() => useModelTabPrefill('orders', false));

  await waitFor(() => expect(setModelQueryResult).toHaveBeenCalled());
  const [name, result] = setModelQueryResult.mock.calls[0];
  expect(name).toBe('orders');
  expect(result.rows).toEqual(ROWS);
  expect(result.columns).toEqual(['id', 'region']);
  expect(result.row_count).toBe(2);
  // Flagged so the UI can distinguish "last build" from "you just ran this".
  expect(result.from_last_run).toBe(true);
});

it('never overwrites a tab that already has a result', async () => {
  // The important refusal: a query you just ran must not be replaced by a
  // stale build.
  renderHook(() => useModelTabPrefill('orders', true));

  await Promise.resolve();
  expect(processModel).not.toHaveBeenCalled();
  expect(setModelQueryResult).not.toHaveBeenCalled();
});

it('asks for a given model at most once, even across tab switches', async () => {
  processModel.mockResolvedValue({ orders: { name: 'orders', data: ROWS } });

  const { rerender } = renderHook(({ name }) => useModelTabPrefill(name, false), {
    initialProps: { name: 'orders' },
  });
  await waitFor(() => expect(fetchModelJobs).toHaveBeenCalledTimes(1));

  rerender({ name: 'users' });
  await waitFor(() => expect(fetchModelJobs).toHaveBeenCalledTimes(2));
  rerender({ name: 'orders' });
  await Promise.resolve();

  // 'orders' is not asked for again on the way back — a model with no parquet
  // would otherwise 404 on every tab switch. Each name is fetched at most once.
  expect(fetchModelJobs.mock.calls.map(c => c[0][0])).toEqual(['orders', 'users']);
});

it('leaves the grid empty when the model has no built data', async () => {
  fetchModelJobs.mockResolvedValueOnce([]); // nothing built for this model

  renderHook(() => useModelTabPrefill('orders', false));

  await waitFor(() => expect(fetchModelJobs).toHaveBeenCalled());
  expect(processModel).not.toHaveBeenCalled();
  expect(setModelQueryResult).not.toHaveBeenCalled();
});

it('does not prefill when the model has no rows', async () => {
  processModel.mockResolvedValue({ orders: { name: 'orders', data: [] } });

  renderHook(() => useModelTabPrefill('orders', false));

  await waitFor(() => expect(processModel).toHaveBeenCalled());
  expect(setModelQueryResult).not.toHaveBeenCalled();
});

it('treats a per-model error as no data rather than a result', async () => {
  // processModel reports a failure as an `error` key instead of throwing.
  processModel.mockResolvedValue({
    orders: { name: 'orders', data: [], error: 'file not found' },
  });

  renderHook(() => useModelTabPrefill('orders', false));

  await waitFor(() => expect(processModel).toHaveBeenCalled());
  expect(setModelQueryResult).not.toHaveBeenCalled();
});

it('stays silent when the load throws', async () => {
  // A convenience path: the Run button owns error reporting.
  processModel.mockRejectedValue(new Error('network down'));

  renderHook(() => useModelTabPrefill('orders', false));

  await waitFor(() => expect(processModel).toHaveBeenCalled());
  expect(setModelQueryResult).not.toHaveBeenCalled();
});

it('does nothing before DuckDB is ready', async () => {
  useDuckDB.mockReturnValue(null);

  renderHook(() => useModelTabPrefill('orders', false));

  await Promise.resolve();
  expect(processModel).not.toHaveBeenCalled();
});

it('does nothing without an active model', async () => {
  renderHook(() => useModelTabPrefill(null, false));

  await Promise.resolve();
  expect(processModel).not.toHaveBeenCalled();
});

/**
 * M27 — the session result cache.
 *
 * Parking an exploration tab drops query results from the persisted draft on
 * purpose, so returning to a tab used to mean re-running every query. These
 * cover the read half: what the hook restores, and — mostly — what it refuses
 * to restore.
 */
describe('session result cache', () => {
  const SCOPE = {
    explorationId: 'exp-a',
    sourceName: 'warehouse',
    sql: 'SELECT * FROM orders',
  };
  const CACHED = { columns: ['id', 'region'], rows: ROWS, row_count: 2 };

  const park = (overrides = {}) =>
    putCachedExplorationResult(
      { explorationId: 'exp-a', modelName: 'orders', sourceName: 'warehouse', sql: 'SELECT * FROM orders', ...overrides },
      CACHED
    );

  it('restores the parked rows on return, with no network call at all', async () => {
    park();

    renderHook(() => useModelTabPrefill('orders', false, SCOPE));

    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalled());
    const [name, result] = setModelQueryResult.mock.calls[0];
    expect(name).toBe('orders');
    expect(result.rows).toEqual(ROWS);
    expect(result.row_count).toBe(2);
    // Provenance: these are this session's own rows, not the last build's.
    expect(result.from_cache).toBe(true);
    expect(result.from_last_run).toBeUndefined();
    // The whole point — a return is free.
    expect(fetchModelJobs).not.toHaveBeenCalled();
    expect(processModel).not.toHaveBeenCalled();
  });

  it('restores before DuckDB is ready — the rows need no browser resource', async () => {
    useDuckDB.mockReturnValue(null);
    park();

    renderHook(() => useModelTabPrefill('orders', false, SCOPE));

    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalled());
    expect(setModelQueryResult.mock.calls[0][1].from_cache).toBe(true);
  });

  it('MISSES after the query is edited, and falls through to the last build', async () => {
    park();
    processModel.mockResolvedValue({ orders: { name: 'orders', data: ROWS } });

    renderHook(() => useModelTabPrefill('orders', false, { ...SCOPE, sql: 'SELECT 1 FROM orders' }));

    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalled());
    // Not the parked rows — the build's, which is the honest answer for a
    // query that has never been run.
    expect(setModelQueryResult.mock.calls[0][1].from_cache).toBeUndefined();
    expect(setModelQueryResult.mock.calls[0][1].from_last_run).toBe(true);
  });

  it('MISSES after the chip is renamed', async () => {
    park();

    renderHook(() => useModelTabPrefill('orders_2', false, SCOPE));

    await waitFor(() => expect(fetchModelJobs).toHaveBeenCalled());
    expect(setModelQueryResult).not.toHaveBeenCalledWith(
      'orders_2',
      expect.objectContaining({ from_cache: true })
    );
  });

  it('MISSES after the source is changed', async () => {
    park();

    renderHook(() => useModelTabPrefill('orders', false, { ...SCOPE, sourceName: 'other_db' }));

    await waitFor(() => expect(fetchModelJobs).toHaveBeenCalled());
    expect(setModelQueryResult).not.toHaveBeenCalledWith(
      'orders',
      expect.objectContaining({ from_cache: true })
    );
  });

  it('never hands one exploration another’s rows', async () => {
    park();

    renderHook(() => useModelTabPrefill('orders', false, { ...SCOPE, explorationId: 'exp-b' }));

    await waitFor(() => expect(fetchModelJobs).toHaveBeenCalled());
    expect(setModelQueryResult).not.toHaveBeenCalledWith(
      'orders',
      expect.objectContaining({ from_cache: true })
    );
  });

  it('is off entirely outside an exploration — the pre-M27 behaviour', async () => {
    park();
    processModel.mockResolvedValue({ orders: { name: 'orders', data: ROWS } });

    // No third argument at all: every existing caller keeps its old contract.
    renderHook(() => useModelTabPrefill('orders', false));

    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalled());
    expect(setModelQueryResult.mock.calls[0][1].from_last_run).toBe(true);
  });

  it('never overwrites a tab that already has rows', async () => {
    park();

    renderHook(() => useModelTabPrefill('orders', true, SCOPE));

    await Promise.resolve();
    expect(setModelQueryResult).not.toHaveBeenCalled();
  });

  it('still restores on a SECOND return, unlike the once-per-mount build fetch', async () => {
    // The build is asked for at most once per model per mount (a 404 per tab
    // switch is worse than an empty grid); the cache is a Map lookup, so it
    // has no reason to be rationed the same way.
    park();
    const { rerender } = renderHook(({ name, has }) => useModelTabPrefill(name, has, SCOPE), {
      initialProps: { name: 'orders', has: false },
    });
    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalledTimes(1));

    // Leave the tab (rows land elsewhere), then come back to an empty tab.
    rerender({ name: 'users', has: false });
    rerender({ name: 'orders', has: false });

    await waitFor(() => expect(setModelQueryResult).toHaveBeenCalledTimes(2));
    expect(setModelQueryResult.mock.calls[1][1].from_cache).toBe(true);
  });
});
