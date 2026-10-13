// Saving or deleting a source invalidates the exploration results it produced.
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

  await useStore.getState().saveSource('local', { type: 'duckdb', database: 'b.duckdb' });

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
});

it('deleteSource retires them too', async () => {
  putCachedExplorationResult(SCOPE, RESULT);

  await useStore.getState().deleteSource('local');

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
});

it('leaves results from OTHER sources alone', async () => {
  putCachedExplorationResult(SCOPE, RESULT);
  const other = { ...SCOPE, modelName: 'revenue', sourceName: 'warehouse' };
  putCachedExplorationResult(other, RESULT);

  await useStore.getState().saveSource('local', { type: 'duckdb', database: 'b.duckdb' });

  expect(getCachedExplorationResult(SCOPE)).toBeNull();
  expect(getCachedExplorationResult(other)).not.toBeNull();
});

it('keeps the parked rows when the save FAILS', async () => {
  putCachedExplorationResult(SCOPE, RESULT);
  sourcesApi.saveSource.mockRejectedValue(new Error('connection refused'));

  const outcome = await useStore.getState().saveSource('local', { type: 'duckdb' });

  expect(outcome.success).toBe(false);
  expect(getCachedExplorationResult(SCOPE)).not.toBeNull();
});
