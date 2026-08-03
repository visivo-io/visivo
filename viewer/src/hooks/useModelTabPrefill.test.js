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
import { useDuckDB } from '../contexts/DuckDBContext';

jest.mock('./useModelsData', () => ({ processModel: jest.fn() }));
jest.mock('../contexts/DuckDBContext', () => ({ useDuckDB: jest.fn() }));

const DB = { fake: 'duckdb' };
const ROWS = [
  { id: 1, region: 'east' },
  { id: 2, region: 'west' },
];

let setModelQueryResult;

beforeEach(() => {
  jest.clearAllMocks();
  useDuckDB.mockReturnValue(DB);
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
  processModel.mockResolvedValue({ orders: { name: 'orders', data: [] } });

  const { rerender } = renderHook(({ name }) => useModelTabPrefill(name, false), {
    initialProps: { name: 'orders' },
  });
  await waitFor(() => expect(processModel).toHaveBeenCalledTimes(1));

  rerender({ name: 'users' });
  rerender({ name: 'orders' });

  await waitFor(() => expect(processModel).toHaveBeenCalledTimes(2));
  // 'orders' was not re-fetched on the way back — a model with no parquet
  // would otherwise 404 on every tab switch.
  expect(processModel.mock.calls.map(c => c[1])).toEqual(['orders', 'users']);
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
