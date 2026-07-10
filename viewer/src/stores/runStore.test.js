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

  it('noteDraftActivity opens a future poll window', () => {
    const store = build();
    expect(store.get().pollWindowUntil).toBe(0);
    store.get().noteDraftActivity();
    expect(store.get().pollWindowUntil).toBeGreaterThan(Date.now());
  });

  it('no-ops when the run endpoint is unavailable (local serve / dist)', async () => {
    branchingApi.fetchRuns.mockRejectedValueOnce(new Error('404'));
    const store = build();
    const result = await store.get().pollRuns();
    expect(result).toBeNull();
    expect(store.get().latestRun).toBeNull();
    expect(store.get().runDataVersion).toBe(0);
    // The runs list stays empty too — per-record failure selectors see nothing.
    expect(store.get().runs).toEqual([]);
  });

  // VIS-993 §2: the FULL runs list must land in state so per-record failure
  // selectors (runFailures.js) can match failed runs to record names via
  // dag_filter — latestRun alone loses every non-head run.
  it('stores the full runs list for per-record failure selectors', async () => {
    const runsPayload = [
      {
        id: 'r2',
        state: 'failed',
        dag_filter: '+revenue_insight+',
        error_json: '{"message":"boom"}',
        is_superseded: false,
        created_at: '2026-07-01T12:00:00Z',
      },
      {
        id: 'r1',
        state: 'succeeded',
        dag_filter: '+orders_model+',
        error_json: null,
        is_superseded: false,
        created_at: '2026-07-01T11:00:00Z',
      },
    ];
    branchingApi.fetchRuns.mockResolvedValueOnce(runsPayload);
    const store = build();
    expect(store.get().runs).toEqual([]); // initial state
    await store.get().pollRuns();
    expect(store.get().runs).toEqual(runsPayload);
  });

  it('normalizes a null runs payload to an empty list', async () => {
    branchingApi.fetchRuns.mockResolvedValueOnce(null);
    const store = build();
    const result = await store.get().pollRuns();
    expect(result).toBeNull();
    expect(store.get().latestRun).toBeNull();
    expect(store.get().runs).toEqual([]);
  });
});
