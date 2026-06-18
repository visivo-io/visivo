import createRunSlice from './runStore';
import * as cloudEditingApi from '../api/cloudEditing';

jest.mock('../api/cloudEditing');

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
    cloudEditingApi.fetchRuns.mockResolvedValueOnce([
      { id: 'r1', state: 'succeeded' },
    ]);
    const store = build();
    await store.get().pollRuns();
    expect(cloudEditingApi.fetchRuns).toHaveBeenCalledWith('draft-1');
    expect(store.get().latestRun).toEqual({ id: 'r1', state: 'succeeded' });
    expect(store.get().lastSucceededRunId).toBe('r1');
    expect(store.get().runDataVersion).toBe(0); // baseline, no refresh
  });

  it('bumps runDataVersion when a NEW run succeeds', async () => {
    const store = build();
    cloudEditingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r1', state: 'succeeded' }]);
    await store.get().pollRuns(); // baseline
    cloudEditingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r2', state: 'running' }]);
    await store.get().pollRuns();
    expect(store.get().latestRun.state).toBe('running');
    expect(store.get().runDataVersion).toBe(0); // not succeeded yet
    cloudEditingApi.fetchRuns.mockResolvedValueOnce([
      { id: 'r2', state: 'succeeded' },
      { id: 'r1', state: 'succeeded' },
    ]);
    await store.get().pollRuns();
    expect(store.get().lastSucceededRunId).toBe('r2');
    expect(store.get().runDataVersion).toBe(1); // refresh!
  });

  it('noteDraftActivity opens a future poll window', () => {
    const store = build();
    expect(store.get().pollWindowUntil).toBe(0);
    store.get().noteDraftActivity();
    expect(store.get().pollWindowUntil).toBeGreaterThan(Date.now());
  });

  it('no-ops when the run endpoint is unavailable (local serve / dist)', async () => {
    cloudEditingApi.fetchRuns.mockRejectedValueOnce(new Error('404'));
    const store = build();
    const result = await store.get().pollRuns();
    expect(result).toBeNull();
    expect(store.get().latestRun).toBeNull();
    expect(store.get().runDataVersion).toBe(0);
  });
});
