import createRunSlice from './runStore';
import * as branchingApi from '../api/branching';

jest.mock('../api/branching');

const makeStore = (slice, initial = {}) => {
  let state = { ...initial };
  const set = patch => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = { ...state, ...slice(set, get) };
  return { get };
};

beforeEach(() => jest.clearAllMocks());

describe('runStore', () => {
  const build = () => makeStore(createRunSlice, { project: { id: 'draft-1' } });

  it('sets latestRun and adopts the first succeeded run as baseline (no bump)', async () => {
    branchingApi.fetchRuns.mockResolvedValueOnce([
      { id: 'r1', state: 'succeeded' },
    ]);
    const store = build();
    await store.get().pollRuns();
    expect(branchingApi.fetchRuns).toHaveBeenCalledWith('draft-1');
    expect(store.get().latestRun).toEqual({ id: 'r1', state: 'succeeded' });
    expect(store.get().lastSucceededRunId).toBe('r1');
    expect(store.get().runDataVersion).toBe(0); // baseline, no refresh
  });

  it('bumps runDataVersion when a NEW run succeeds', async () => {
    const store = build();
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r1', state: 'succeeded' }]);
    await store.get().pollRuns(); // baseline
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r2', state: 'running' }]);
    await store.get().pollRuns();
    expect(store.get().latestRun.state).toBe('running');
    expect(store.get().runDataVersion).toBe(0); // not succeeded yet
    branchingApi.fetchRuns.mockResolvedValueOnce([
      { id: 'r2', state: 'succeeded' },
      { id: 'r1', state: 'succeeded' },
    ]);
    await store.get().pollRuns();
    expect(store.get().lastSucceededRunId).toBe('r2');
    expect(store.get().runDataVersion).toBe(1); // refresh!
  });

  it('noteDraftActivity opens a future poll window + marks a run pending', () => {
    const store = build();
    expect(store.get().pollWindowUntil).toBe(0);
    expect(store.get().pendingRun).toBe(false);
    store.get().noteDraftActivity();
    expect(store.get().pollWindowUntil).toBeGreaterThan(Date.now());
    expect(store.get().pendingRun).toBe(true);
  });

  it('keeps pendingRun while the edit\'s run is still active', async () => {
    const store = build();
    store.get().noteDraftActivity(); // preEditRunId = null (no prior run)
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r1', state: 'running' }]);
    await store.get().pollRuns();
    expect(store.get().pendingRun).toBe(true); // the new run is in flight
  });

  it('clears pendingRun once the edit\'s new run finishes', async () => {
    const store = build();
    store.get().noteDraftActivity();
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r1', state: 'succeeded' }]);
    await store.get().pollRuns();
    expect(store.get().pendingRun).toBe(false);
  });

  it('keeps pendingRun while only the pre-edit run is present (new run not created yet)', async () => {
    const store = build();
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'old', state: 'succeeded' }]);
    await store.get().pollRuns(); // establish the pre-edit run as latest
    store.get().noteDraftActivity(); // preEditRunId = 'old', pendingRun = true
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'old', state: 'succeeded' }]);
    await store.get().pollRuns(); // only the old run -> this edit's run not created
    expect(store.get().pendingRun).toBe(true); // still waiting for the new run
  });

  it('no-ops when the run endpoint is unavailable (local serve / dist)', async () => {
    branchingApi.fetchRuns.mockRejectedValueOnce(new Error('404'));
    const store = build();
    const result = await store.get().pollRuns();
    expect(result).toBeNull();
    expect(store.get().latestRun).toBeNull();
    expect(store.get().runDataVersion).toBe(0);
  });
});
