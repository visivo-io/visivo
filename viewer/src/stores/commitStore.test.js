/**
 * commitStore tests (VIS-806 / Track H H-1, aligned to the backend-agnostic
 * /api/projects/<id>/changes/ + /commit/ endpoints).
 *
 * The commit slice drives the commit affordance (TopNav Commit button +
 * CommitModal): live pending-change count, the global save-activity counter,
 * Commit (flush draft cache to YAML / publish the draft) and Discard (drop
 * the draft cache, Q14 rollback).
 */
import useStore from './store';
import * as branchingApi from '../api/branching';
import * as commitApi from '../api/commit';
import { emitFirstPublishTelemetry } from '../components/new-views/workspace/telemetry';

jest.mock('../api/branching', () => ({
  fetchChanges: jest.fn(),
  commitDraft: jest.fn(),
}));

jest.mock('../api/commit', () => ({
  getCommitStatus: jest.fn(),
  getPendingChanges: jest.fn(),
  commitChanges: jest.fn(),
  discardChanges: jest.fn(),
}));

jest.mock('../components/new-views/workspace/telemetry', () => ({
  emitFirstPublishTelemetry: jest.fn(),
  emitWorkspaceEvent: jest.fn(),
  markBuildModeEntered: jest.fn(),
  setWorkspaceTelemetryListener: jest.fn(),
}));

// Every named-child fetcher the commit/discard flows refresh — stubbed so
// the post-flush Promise.all never hits the network from jsdom.
const FETCHER_KEYS = [
  'fetchSources',
  'fetchModels',
  'fetchCsvScriptModels',
  'fetchLocalMergeModels',
  'fetchDimensions',
  'fetchMetrics',
  'fetchRelations',
  'fetchInsights',
  'fetchMarkdowns',
  'fetchCharts',
  'fetchTables',
  'fetchDashboards',
  'fetchInputs',
  'fetchDefaults',
];

describe('commitStore (VIS-806)', () => {
  let fetcherStubs;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcherStubs = Object.fromEntries(
      FETCHER_KEYS.map(key => [key, jest.fn().mockResolvedValue(undefined)])
    );
    useStore.setState({
      ...fetcherStubs,
      project: { id: 'proj-1' },
      hasUncommittedChanges: false,
      pendingChanges: [],
      pendingCount: 0,
      commitLoading: false,
      commitError: null,
      commitModalOpen: false,
      discardLoading: false,
      lastCommittedAt: null,
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
  });

  describe('checkCommitStatus', () => {
    test('sets count, list, and boolean from /changes/', async () => {
      branchingApi.fetchChanges.mockResolvedValue({
        to_publish: [
          { name: 'a', type: 'chart', status: 'new' },
          { name: 'b', type: 'dashboard', status: 'modified' },
        ],
        to_remove: [],
        has_changes: true,
      });

      await useStore.getState().checkCommitStatus();

      expect(branchingApi.fetchChanges).toHaveBeenCalledWith('proj-1');
      const state = useStore.getState();
      expect(state.pendingCount).toBe(2);
      expect(state.hasUncommittedChanges).toBe(true);
      expect(state.pendingChanges).toHaveLength(2);
    });

    test('falls back to clean state when the endpoint is unavailable', async () => {
      useStore.setState({ pendingCount: 5, hasUncommittedChanges: true });
      branchingApi.fetchChanges.mockRejectedValue(new Error('404'));

      await useStore.getState().checkCommitStatus();

      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUncommittedChanges).toBe(false);
      expect(state.pendingChanges).toEqual([]);
    });

    test('combines to_publish and to_remove into the pending list', async () => {
      branchingApi.fetchChanges.mockResolvedValue({
        to_publish: [{ name: 'a', type: 'chart', status: 'new' }],
        to_remove: [{ name: 'b', type: 'table', status: 'deleted' }],
        has_changes: true,
      });

      await useStore.getState().checkCommitStatus();

      expect(useStore.getState().pendingCount).toBe(2);
      expect(useStore.getState().pendingChanges).toEqual([
        { name: 'a', type: 'chart', status: 'new' },
        { name: 'b', type: 'table', status: 'deleted' },
      ]);
    });

    test('fails closed without an active project', async () => {
      useStore.setState({ project: null, pendingCount: 3, hasUncommittedChanges: true });

      await useStore.getState().checkCommitStatus();

      expect(branchingApi.fetchChanges).not.toHaveBeenCalled();
      expect(useStore.getState().pendingCount).toBe(0);
      expect(useStore.getState().hasUncommittedChanges).toBe(false);
    });
  });

  describe('save activity tracking', () => {
    test('begin/end balance the counter', () => {
      const { beginSaveActivity, endSaveActivity } = useStore.getState();
      beginSaveActivity();
      beginSaveActivity();
      expect(useStore.getState().saveActivityCount).toBe(2);
      endSaveActivity(true);
      endSaveActivity(true);
      expect(useStore.getState().saveActivityCount).toBe(0);
    });

    test('a failed save latches lastSaveFailed until the next save begins', () => {
      const { beginSaveActivity, endSaveActivity } = useStore.getState();
      beginSaveActivity();
      endSaveActivity(false);
      expect(useStore.getState().lastSaveFailed).toBe(true);
      beginSaveActivity();
      expect(useStore.getState().lastSaveFailed).toBe(false);
    });

    test('the counter never goes negative', () => {
      useStore.getState().endSaveActivity(true);
      expect(useStore.getState().saveActivityCount).toBe(0);
    });
  });

  describe('commitChanges', () => {
    test('clears pending state, stamps lastCommittedAt, emits first-publish telemetry, and refreshes collections', async () => {
      useStore.setState({
        pendingCount: 3,
        hasUncommittedChanges: true,
        commitModalOpen: true,
      });
      branchingApi.commitDraft.mockResolvedValue({
        status: 200,
        body: { published_count: 3 },
      });

      const result = await useStore.getState().commitChanges();

      expect(result.success).toBe(true);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUncommittedChanges).toBe(false);
      expect(state.commitModalOpen).toBe(false);
      expect(state.lastCommittedAt).toEqual(expect.any(Number));
      expect(emitFirstPublishTelemetry).toHaveBeenCalledTimes(1);
      FETCHER_KEYS.forEach(key => expect(fetcherStubs[key]).toHaveBeenCalled());
    });

    test('a cloud 201 publish is terminal success', async () => {
      branchingApi.commitDraft.mockResolvedValue({ status: 201, body: {} });

      const result = await useStore.getState().commitChanges();

      expect(result.success).toBe(true);
      expect(useStore.getState().hasUncommittedChanges).toBe(false);
    });

    test('a 200 committed:false is a no-op, not an error', async () => {
      useStore.setState({ pendingCount: 2, hasUncommittedChanges: true });
      branchingApi.commitDraft.mockResolvedValue({
        status: 200,
        body: { committed: false, detail: 'Nothing to commit' },
      });

      const result = await useStore.getState().commitChanges();

      expect(result.success).toBe(false);
      expect(result.committed).toBe(false);
      expect(useStore.getState().commitError).toBeNull();
      expect(useStore.getState().pendingCount).toBe(2);
      expect(emitFirstPublishTelemetry).not.toHaveBeenCalled();
    });

    test('surfaces the error and keeps pending state on a 4xx gate', async () => {
      useStore.setState({ pendingCount: 2, hasUncommittedChanges: true });
      branchingApi.commitDraft.mockResolvedValue({
        status: 422,
        body: { detail: 'YAML write failed', action: 'invalid' },
      });

      const result = await useStore.getState().commitChanges();

      expect(result.success).toBe(false);
      expect(result.action).toBe('invalid');
      const state = useStore.getState();
      expect(state.commitError).toBe('YAML write failed');
      expect(state.commitLoading).toBe(false);
      expect(state.pendingCount).toBe(2);
      expect(emitFirstPublishTelemetry).not.toHaveBeenCalled();
    });

    test('refuses without an active project', async () => {
      useStore.setState({ project: null });

      const result = await useStore.getState().commitChanges();

      expect(result.success).toBe(false);
      expect(branchingApi.commitDraft).not.toHaveBeenCalled();
    });
  });

  describe('refreshFromProjectChange (VIS-808)', () => {
    test('shows the external-edit banner and refetches when drafts were dropped', async () => {
      const fetchProject = jest.fn().mockResolvedValue(undefined);
      useStore.setState({ fetchProject, externalEditBannerVisible: false });
      branchingApi.fetchChanges.mockResolvedValue({
        to_publish: [],
        to_remove: [],
        has_changes: false,
      });

      await useStore.getState().refreshFromProjectChange({ draftsDropped: true });

      expect(useStore.getState().externalEditBannerVisible).toBe(true);
      expect(fetchProject).toHaveBeenCalled();
      expect(fetcherStubs.fetchDashboards).toHaveBeenCalled();
    });

    test('a clean recompile refetches without showing the banner', async () => {
      const fetchProject = jest.fn().mockResolvedValue(undefined);
      useStore.setState({ fetchProject, externalEditBannerVisible: false });
      branchingApi.fetchChanges.mockResolvedValue({
        to_publish: [],
        to_remove: [],
        has_changes: false,
      });

      await useStore.getState().refreshFromProjectChange({ draftsDropped: false });

      expect(useStore.getState().externalEditBannerVisible).toBe(false);
      expect(fetchProject).toHaveBeenCalled();
    });

    test('dismissExternalEditBanner hides the banner', () => {
      useStore.setState({ externalEditBannerVisible: true });
      useStore.getState().dismissExternalEditBanner();
      expect(useStore.getState().externalEditBannerVisible).toBe(false);
    });
  });

  describe('discardChanges', () => {
    test('drops pending state and refreshes every collection (canvas revert)', async () => {
      useStore.setState({ pendingCount: 4, hasUncommittedChanges: true });
      commitApi.discardChanges.mockResolvedValue({ discarded_count: 4 });

      const result = await useStore.getState().discardChanges();

      expect(result.success).toBe(true);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUncommittedChanges).toBe(false);
      expect(state.discardLoading).toBe(false);
      FETCHER_KEYS.forEach(key => expect(fetcherStubs[key]).toHaveBeenCalled());
    });

    test('reports failure without clearing pending state', async () => {
      useStore.setState({ pendingCount: 4, hasUncommittedChanges: true });
      commitApi.discardChanges.mockRejectedValue(new Error('boom'));

      const result = await useStore.getState().discardChanges();

      expect(result.success).toBe(false);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(4);
      expect(state.discardLoading).toBe(false);
      expect(fetcherStubs.fetchDashboards).not.toHaveBeenCalled();
    });
  });
});
