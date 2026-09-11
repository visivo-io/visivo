/**
 * M27 — editing or deleting a source retires the exploration results it
 * produced.
 *
 * `explorationResultCache`'s key identifies a source by NAME, and a name is
 * not a connection. Repoint `local` from `a.duckdb` to `b.duckdb` — or change
 * its schema, host, or credentials — and the name is unchanged, so every
 * parked key still matches while the rows behind them came out of a database
 * the user has stopped pointing at. `useModelTabPrefill` would hit, and
 * `setModelQueryResult` would paint the old database's rows as the current
 * result with no re-run and nothing on screen saying so.
 *
 * The saving grace is that the APP makes this change, so it knows exactly when
 * to forget. These pin that it actually does.
 *
 * Deliberately narrow: this is a wiring test for the invalidation, not a
 * general `sourceStore` suite. The cache's own semantics live in
 * `explorationResultCache.test.js`.
 */
import useStore from './store';
import * as sourcesApi from '../api/sources';
import {
  getCachedExplorationResult,
  putCachedExplorationResult,
  _resetExplorationResultCacheForTests,
} from './explorationResultCache';

jest.mock('../api/sources');

const SCOPE = {
  explorationId: 'exp-a',
  modelName: 'orders',
  sourceName: 'local',
  sql: 'SELECT * FROM t',
};
const RESULT = { columns: ['id'], rows: [{ id: 1 }], row_count: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  _resetExplorationResultCacheForTests();
  sourcesApi.fetchAllSources.mockResolvedValue({ sources: [] });
  sourcesApi.saveSource.mockResolvedValue({ name: 'local' });
  sourcesApi.deleteSource.mockResolvedValue({});
  // `checkCommitStatus` belongs to another slice and is irrelevant here.
  useStore.setState({ checkCommitStatus: jest.fn().mockResolvedValue(undefined) });
});

it('saveSource retires the results that source produced', async () => {
  putCachedExplorationResult(SCOPE, RESULT);
  expect(getCachedExplorationResult(SCOPE)).not.toBeNull();

  // The source now points at a different database file. Same name.
  await useStore.getState().saveSource('local', { type: 'duckdb', database: 'b.duckdb' });

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
});

it('deleteSource retires them too', async () => {
  putCachedExplorationResult(SCOPE, RESULT);

  await useStore.getState().deleteSource('local');

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
});

it('leaves results from OTHER sources alone', async () => {
  // Invalidating by source must not be a panic-clear: a user editing one
  // connection should not lose every exploration result they have.
  putCachedExplorationResult(SCOPE, RESULT);
  const other = { ...SCOPE, modelName: 'revenue', sourceName: 'warehouse' };
  putCachedExplorationResult(other, RESULT);

  await useStore.getState().saveSource('local', { type: 'duckdb', database: 'b.duckdb' });

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
  expect(getCachedExplorationResult(other)).not.toBeNull();
});

it('keeps the parked rows when the save FAILS', async () => {
  // The definition did not change, so the rows are still an honest answer —
  // and throwing them away would charge the user a re-run for the backend's
  // error.
  putCachedExplorationResult(SCOPE, RESULT);
  sourcesApi.saveSource.mockRejectedValue(new Error('connection refused'));

  const outcome = await useStore.getState().saveSource('local', { type: 'duckdb' });

  expect(outcome.success).toBe(false);
  expect(getCachedExplorationResult(SCOPE)).not.toBeNull();
});
