// Coverage for the non-uniform store slices: commit workflow, project defaults,
// dashboards (with onboarding tap), the dashboard filtering/organization slice,
// source connection testing, and the runtime job slices.
import createCommitSlice from './commitStore';
import createDefaultsSlice from './defaultsStore';
import createDashboardSlice from './dashboardStore';
import createProjectSlice from './projectStore';
import createSourceSlice from './sourceStore';
import createInsightJobsSlice from './insightJobsStore';
import createModelJobsSlice from './modelJobsStore';
import * as cloudEditingApi from '../api/cloudEditing';
import * as defaultsApi from '../api/defaults';
import * as dashboardsApi from '../api/dashboards';
import * as sourcesApi from '../api/sources';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';

jest.mock('../api/cloudEditing');
jest.mock('../api/defaults');
jest.mock('../api/dashboards');
jest.mock('../api/sources');
jest.mock('../components/onboarding/onboardingState', () => ({
  recordOnboardingAction: jest.fn(),
}));
// Identity organizer keeps the filtering slice focused on its own logic.
jest.mock('../utils/dashboardUtils', () => ({
  organizeDashboardsByLevel: filtered => filtered,
}));

global.console.error = jest.fn();

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

describe('commitStore', () => {
  const build = () => makeStore(createCommitSlice, { project: { id: 'proj-1' } });

  it('checkCommitStatus reflects /changes/ and fails closed', async () => {
    cloudEditingApi.fetchChanges.mockResolvedValueOnce({
      to_publish: [{ name: 'a', type: 'chart', status: 'new' }],
      to_remove: [],
      has_changes: true,
    });
    const store = build();
    await store.get().checkCommitStatus();
    expect(cloudEditingApi.fetchChanges).toHaveBeenCalledWith('proj-1');
    expect(store.get().hasUncommittedChanges).toBe(true);
    expect(store.get().pendingChanges).toEqual([{ name: 'a', type: 'chart', status: 'new' }]);

    cloudEditingApi.fetchChanges.mockRejectedValueOnce(new Error('offline'));
    await store.get().checkCommitStatus();
    expect(store.get().hasUncommittedChanges).toBe(false);
  });

  it('fetchPendingChanges returns the dirty list from /changes/', async () => {
    cloudEditingApi.fetchChanges.mockResolvedValueOnce({
      to_publish: [{ name: 'a' }],
      to_remove: [{ name: 'b' }],
      has_changes: true,
    });
    const store = build();
    await expect(store.get().fetchPendingChanges()).resolves.toEqual([
      { name: 'a' },
      { name: 'b' },
    ]);
  });

  it('commitChanges publishes on success (201/200) and surfaces gate actions', async () => {
    // 201 = cloud publish (+ next_draft).
    cloudEditingApi.commitDraft.mockResolvedValueOnce({
      status: 201,
      body: { commit_id: 'c1', next_draft: { id: 'draft-2' } },
    });
    const store = makeStore(createCommitSlice, { project: { id: 'd1' }, setProject: jest.fn() });
    const res = await store.get().commitChanges();
    expect(res.success).toBe(true);
    expect(store.get().hasUncommittedChanges).toBe(false);
    expect(store.get().commitModalOpen).toBe(false);

    // 409 = run/role gate.
    cloudEditingApi.commitDraft.mockResolvedValueOnce({
      status: 409,
      body: { action: 'run_required', detail: 'Run the draft before committing.' },
    });
    const fail = await store.get().commitChanges();
    expect(fail).toEqual({
      success: false,
      action: 'run_required',
      error: 'Run the draft before committing.',
    });
    expect(store.get().commitError).toBe('Run the draft before committing.');
  });

  it('openCommitModal opens and loads the dirty set; close/clear reset state', async () => {
    cloudEditingApi.fetchChanges.mockResolvedValueOnce({ to_publish: [], to_remove: [], has_changes: false });
    const store = build();
    await store.get().openCommitModal();
    expect(store.get().commitModalOpen).toBe(true);
    expect(cloudEditingApi.fetchChanges).toHaveBeenCalled();

    store.get().clearCommitError();
    store.get().closeCommitModal();
    expect(store.get().commitModalOpen).toBe(false);
    expect(store.get().commitError).toBeNull();
  });
});

describe('defaultsStore', () => {
  it('fetchDefaults loads the singleton and records errors', async () => {
    defaultsApi.fetchDefaults.mockResolvedValueOnce({ source: 'duckdb' });
    const store = makeStore(createDefaultsSlice, { project: { id: 'proj-1' } });
    await store.get().fetchDefaults();
    expect(defaultsApi.fetchDefaults).toHaveBeenCalledWith('proj-1');
    expect(store.get().defaults).toEqual({ source: 'duckdb' });

    defaultsApi.fetchDefaults.mockRejectedValueOnce(new Error('bad'));
    await store.get().fetchDefaults();
    expect(store.get().defaultsError).toBe('bad');
  });

  it('saveDefaults persists, refreshes, and reports failures', async () => {
    defaultsApi.saveDefaults.mockResolvedValueOnce({ ok: true });
    defaultsApi.fetchDefaults.mockResolvedValue({ source: 'duckdb' });
    const store = makeStore(createDefaultsSlice, { project: { id: 'proj-1' } });
    await expect(store.get().saveDefaults({ a: 1 })).resolves.toMatchObject({ success: true });
    expect(defaultsApi.saveDefaults).toHaveBeenCalledWith({ a: 1 }, 'proj-1');
    expect(defaultsApi.fetchDefaults).toHaveBeenCalled(); // refresh

    defaultsApi.saveDefaults.mockRejectedValueOnce(new Error('nope'));
    await expect(store.get().saveDefaults({})).resolves.toEqual({ success: false, error: 'nope' });
  });
});

describe('dashboardStore', () => {
  it('fetchDashboards loads the list and records errors', async () => {
    dashboardsApi.fetchAllDashboards.mockResolvedValueOnce({ dashboards: [{ name: 'd' }] });
    const store = makeStore(createDashboardSlice, { project: { id: 'proj-1' } });
    await store.get().fetchDashboards();
    expect(store.get().dashboards).toEqual([{ name: 'd' }]);

    dashboardsApi.fetchAllDashboards.mockRejectedValueOnce(new Error('boom'));
    await store.get().fetchDashboards();
    expect(store.get().dashboardsError).toBe('boom');
  });

  it('saveDashboard taps the onboarding checklist on success', async () => {
    dashboardsApi.saveDashboard.mockResolvedValueOnce({ ok: true });
    dashboardsApi.fetchAllDashboards.mockResolvedValue({ dashboards: [] });
    const store = makeStore(createDashboardSlice);
    const res = await store.get().saveDashboard('d', { a: 1 });
    expect(res.success).toBe(true);
    expect(recordOnboardingAction).toHaveBeenCalledWith('dashboard_saved');

    dashboardsApi.saveDashboard.mockRejectedValueOnce(new Error('x'));
    await expect(store.get().saveDashboard('d', {})).resolves.toMatchObject({ success: false });
  });

  it('deleteDashboard reports success and failure', async () => {
    dashboardsApi.deleteDashboard.mockResolvedValueOnce({ ok: true });
    dashboardsApi.fetchAllDashboards.mockResolvedValue({ dashboards: [] });
    const store = makeStore(createDashboardSlice);
    await expect(store.get().deleteDashboard('d')).resolves.toEqual({ success: true });

    dashboardsApi.deleteDashboard.mockRejectedValueOnce(new Error('locked'));
    await expect(store.get().deleteDashboard('d')).resolves.toEqual({
      success: false,
      error: 'locked',
    });
  });
});

describe('projectStore (dashboard filtering)', () => {
  const dashboards = [
    { name: 'Sales', description: 'revenue', tags: ['finance'] },
    { name: 'Ops', description: 'latency', tags: ['eng'] },
  ];

  beforeEach(() => {
    window.scrollTo = jest.fn();
  });

  it('setDashboards derives the available tag set', () => {
    const store = makeStore(createProjectSlice);
    store.get().setDashboards(dashboards);
    expect(store.get().allDashboards).toHaveLength(2);
    expect(store.get().availableTags.sort()).toEqual(['eng', 'finance']);
  });

  it('setSearchTerm filters by name/description', () => {
    const store = makeStore(createProjectSlice);
    store.get().setDashboards(dashboards);
    store.get().setSearchTerm('sales');
    expect(store.get().filteredDashboards.map(d => d.name)).toEqual(['Sales']);
  });

  it('setSelectedTags coerces non-arrays and filters by tag', () => {
    const store = makeStore(createProjectSlice);
    store.get().setDashboards(dashboards);
    store.get().setSelectedTags(null); // coerced to []
    expect(store.get().selectedTags).toEqual([]);
    store.get().setSelectedTags(['eng']);
    expect(store.get().filteredDashboards.map(d => d.name)).toEqual(['Ops']);
  });

  it('resetFilters clears the search/tag state', () => {
    const store = makeStore(createProjectSlice);
    store.get().setDashboards(dashboards);
    store.get().setSearchTerm('sales');
    store.get().resetFilters();
    expect(store.get().searchTerm).toBe('');
    expect(store.get().selectedTags).toEqual([]);
    expect(store.get().filteredDashboards).toHaveLength(2);
  });

  it('setCurrentDashboardName updates selection and resets scroll', () => {
    const store = makeStore(createProjectSlice);
    store.get().setCurrentDashboardName('Sales');
    expect(store.get().currentDashboardName).toBe('Sales');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('initializeDashboardView batches everything and handles the empty case', () => {
    const store = makeStore(createProjectSlice);
    store.get().initializeDashboardView(dashboards, 'Ops', { defaults: true });
    expect(store.get().currentDashboardName).toBe('Ops');
    expect(store.get().allDashboards).toHaveLength(2);
    expect(store.get().cachedProjectDefaults).toEqual({ defaults: true });

    store.get().initializeDashboardView([], 'none', null);
    expect(store.get().allDashboards).toEqual([]);
    expect(store.get().currentDashboardName).toBe('none');
  });

  it('updateAvailableTags recomputes tags and clears when empty', () => {
    const store = makeStore(createProjectSlice);
    store.get().setDashboards(dashboards);
    store.get().updateAvailableTags();
    expect(store.get().availableTags.sort()).toEqual(['eng', 'finance']);

    const empty = makeStore(createProjectSlice);
    empty.get().updateAvailableTags();
    expect(empty.get().availableTags).toEqual([]);
  });
});

describe('sourceStore connection testing', () => {
  it('marks a source connected on success and clears it afterward', async () => {
    sourcesApi.testSourceConnection.mockResolvedValueOnce({ status: 'connected' });
    const store = makeStore(createSourceSlice);
    await store.get().testConnection({ name: 'src' });
    expect(store.get().connectionStatus.src.status).toBe('connected');

    store.get().clearConnectionStatus('src');
    expect(store.get().connectionStatus.src).toBeUndefined();
  });

  it('marks a source failed when the api reports a failure', async () => {
    sourcesApi.testSourceConnection.mockResolvedValueOnce({
      status: 'connection_failed',
      error: 'no reach',
    });
    const store = makeStore(createSourceSlice);
    await store.get().testConnection({ name: 'src' });
    expect(store.get().connectionStatus.src).toEqual({ status: 'failed', error: 'no reach' });
  });

  it('marks a source failed when the api throws', async () => {
    sourcesApi.testSourceConnection.mockRejectedValueOnce(new Error('exploded'));
    const store = makeStore(createSourceSlice);
    const res = await store.get().testConnection({}); // no name → 'new'
    expect(res).toEqual({ status: 'connection_failed', error: 'exploded' });
    expect(store.get().connectionStatus.new).toEqual({ status: 'failed', error: 'exploded' });
  });
});

describe('runtime job slices', () => {
  it('insightJobs slice sets db and merges/updates jobs', () => {
    const store = makeStore(createInsightJobsSlice);
    store.get().setDB({ conn: 1 });
    expect(store.get().db).toEqual({ conn: 1 });

    store.get().setInsightJobs({ a: { rows: 1 } });
    store.get().setInsightJobs({ b: { rows: 2 } });
    expect(Object.keys(store.get().insightJobs).sort()).toEqual(['a', 'b']);

    store.get().updateInsightJob('a', { done: true });
    expect(store.get().insightJobs.a).toEqual({ rows: 1, done: true });
  });

  it('modelJobs slice merges jobs', () => {
    const store = makeStore(createModelJobsSlice);
    store.get().setModelJobs({ m1: { x: 1 } });
    store.get().setModelJobs({ m2: { y: 2 } });
    expect(Object.keys(store.get().modelJobs).sort()).toEqual(['m1', 'm2']);
  });
});
