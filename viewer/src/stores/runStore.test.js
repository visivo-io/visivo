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

describe('runStore run completion refreshes the staged set', () => {
  test('a newly succeeded run re-checks what is still outstanding', async () => {
    // The one transition /changes/ doesn't already cover: it refreshes on every
    // save, but a run finishing isn't a save. Without this the Runs tab would
    // keep its dot until the user's next keystroke.
    const checkCommitStatus = jest.fn();
    const store = makeStore(createRunSlice, {
      project: { id: 'draft-1' },
      checkCommitStatus,
    });
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r1', state: 'succeeded' }]);
    await store.get().pollRuns(); // first poll adopts the baseline
    expect(checkCommitStatus).not.toHaveBeenCalled();

    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r2', state: 'succeeded' }]);
    await store.get().pollRuns();
    expect(checkCommitStatus).toHaveBeenCalledTimes(1);
  });
});

describe('runStore triggerRun', () => {
  const build = () => makeStore(createRunSlice, { project: { id: 'draft-1' }, runs: [] });

  test('builds the staged set when given no filter', async () => {
    branchingApi.triggerRun.mockResolvedValue({
      status: 201,
      body: { id: 'r1', state: 'queued' },
    });
    const store = build();
    const result = await store.get().triggerRun();
    expect(branchingApi.triggerRun).toHaveBeenCalledWith('draft-1', { dagFilter: undefined });
    expect(result.success).toBe(true);
  });

  test('adopts the new run at once so the tab spinner starts on click', async () => {
    branchingApi.triggerRun.mockResolvedValue({
      status: 201,
      body: { id: 'r1', state: 'queued' },
    });
    const store = build();
    await store.get().triggerRun();
    expect(store.get().latestRun).toEqual({ id: 'r1', state: 'queued' });
    expect(store.get().runs[0].id).toBe('r1');
  });

  test('passes an explicit empty filter through as a deliberate full rebuild', async () => {
    branchingApi.triggerRun.mockResolvedValue({ status: 201, body: { id: 'r1' } });
    const store = build();
    await store.get().triggerRun({ dagFilter: '' });
    expect(branchingApi.triggerRun).toHaveBeenCalledWith('draft-1', { dagFilter: '' });
  });

  test('a 409 is reported, not thrown', async () => {
    branchingApi.triggerRun.mockResolvedValue({
      status: 409,
      body: { action: 'run_in_progress' },
    });
    branchingApi.fetchRuns.mockResolvedValue([]);
    const store = build();
    const result = await store.get().triggerRun();
    expect(result).toMatchObject({ success: false, action: 'run_in_progress' });
  });
});

describe('runStore: the first run to succeed still counts', () => {
  // The bug this covers: `lastSucceededRunId === null` was read as "this is the
  // first poll, the screen already reflects it", but it really means "we have
  // never seen a succeeded run". On a draft whose runs had only failed, the
  // first success was therefore swallowed as a baseline — the rebuilt data was
  // never refetched and the Runs tab kept listing changes that had just been
  // built, until you reloaded the page.
  const build = (initial = {}) =>
    makeStore(createRunSlice, { project: { id: 'draft-1' }, ...initial });

  test('a first success after a failure refreshes data and the staged list', async () => {
    const checkCommitStatus = jest.fn();
    const store = build({ checkCommitStatus });

    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r-failed', state: 'failed' }]);
    await store.get().pollRuns();
    expect(store.get().runDataVersion).toBe(0);

    branchingApi.fetchRuns.mockResolvedValueOnce([
      { id: 'r-ok', state: 'succeeded' },
      { id: 'r-failed', state: 'failed' },
    ]);
    await store.get().pollRuns();

    expect(store.get().runDataVersion).toBe(1);
    expect(checkCommitStatus).toHaveBeenCalledTimes(1);
  });

  test('a success already on screen at first poll is still a baseline', async () => {
    // The behaviour the old code was reaching for, which must survive: arriving
    // on a project whose last run succeeded shouldn't refetch anything.
    const checkCommitStatus = jest.fn();
    const store = build({ checkCommitStatus });
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'r-ok', state: 'succeeded' }]);
    await store.get().pollRuns();
    expect(store.get().runDataVersion).toBe(0);
    expect(checkCommitStatus).not.toHaveBeenCalled();
  });

  test('switching drafts re-baselines instead of firing', async () => {
    const checkCommitStatus = jest.fn();
    const store = build({ checkCommitStatus });
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'a-ok', state: 'succeeded' }]);
    await store.get().pollRuns();

    // Another draft, whose newest succeeded run is a different id.
    store.get().project.id = 'draft-2';
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'b-ok', state: 'succeeded' }]);
    await store.get().pollRuns();

    expect(store.get().runDataVersion).toBe(0);
    expect(checkCommitStatus).not.toHaveBeenCalled();
    expect(store.get().lastSucceededRunId).toBe('b-ok');
  });

  test('a draft with no succeeded run leaves no stale baseline behind', async () => {
    const store = build();
    branchingApi.fetchRuns.mockResolvedValueOnce([{ id: 'x', state: 'failed' }]);
    await store.get().pollRuns();
    expect(store.get().lastSucceededRunId).toBeNull();
  });
});
