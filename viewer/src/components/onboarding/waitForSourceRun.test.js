import { fetchRuns } from '../../api/runs';
import { currentRunIds, waitForSourceRun } from './waitForSourceRun';

jest.mock('../../api/runs');

const sleep = jest.fn(() => Promise.resolve());
const OLD = { id: 'old', state: 'succeeded' };
const wait = options =>
  waitForSourceRun({
    projectId: 'p1',
    before: new Set(['old']),
    sourceName: 'sales',
    sleep,
    ...options,
  });

beforeEach(() => {
  jest.clearAllMocks();
  fetchRuns.mockReset();
});

describe('currentRunIds', () => {
  test('lists the ids of the runs there are now', async () => {
    fetchRuns.mockResolvedValue([OLD, { id: 'r2', state: 'failed' }]);
    expect(await currentRunIds('p1')).toEqual(new Set(['old', 'r2']));
  });

  test('is null where there is no run model', async () => {
    fetchRuns.mockRejectedValue(new Error('404'));
    expect(await currentRunIds('p1')).toBeNull();
  });
});

describe('waitForSourceRun', () => {
  test('waits for the new run to finish, ignoring older ones', async () => {
    fetchRuns
      .mockResolvedValueOnce([OLD])
      .mockResolvedValueOnce([{ id: 'r2', state: 'queued' }, OLD])
      .mockResolvedValueOnce([{ id: 'r2', state: 'running' }, OLD])
      .mockResolvedValueOnce([{ id: 'r2', state: 'succeeded' }, OLD]);

    expect(await wait()).toEqual({ outcome: 'succeeded' });
    expect(fetchRuns).toHaveBeenCalledTimes(4);
  });

  test("a failed run reports the source's own diagnostic", async () => {
    fetchRuns.mockResolvedValueOnce([
      {
        id: 'r2',
        state: 'failed',
        dag_filter: '+sales+',
        error_json: {
          diagnostics: [{ object: { name: 'sales' }, message: 'sales.csv is empty' }],
        },
      },
      OLD,
    ]);

    expect(await wait()).toEqual({ outcome: 'failed', error: 'sales.csv is empty' });
  });

  test('a canceled run hands over to the run that replaced it', async () => {
    fetchRuns.mockResolvedValueOnce([{ id: 'r2', state: 'canceled' }, OLD]).mockResolvedValueOnce([
      { id: 'r3', state: 'succeeded' },
      { id: 'r2', state: 'canceled' },
    ]);

    expect(await wait()).toEqual({ outcome: 'succeeded' });
  });

  test('stops waiting when no run appears in time', async () => {
    fetchRuns.mockResolvedValue([OLD]);

    expect(await wait({ appearWithinMs: 4000, intervalMs: 2000 })).toEqual({ outcome: 'none' });
    expect(fetchRuns).toHaveBeenCalledTimes(3);
  });

  test('has nothing to wait for where there is no run model', async () => {
    expect(await wait({ before: null })).toEqual({ outcome: 'none' });
    expect(fetchRuns).not.toHaveBeenCalled();
  });

  test('stops when the caller cancels', async () => {
    fetchRuns.mockResolvedValue([{ id: 'r2', state: 'running' }, OLD]);
    let cancelled = false;
    sleep.mockImplementationOnce(() => {
      cancelled = true;
      return Promise.resolve();
    });

    expect(await wait({ isCancelled: () => cancelled })).toEqual({ outcome: 'cancelled' });
  });
});
