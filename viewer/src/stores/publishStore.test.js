/**
 * publishStore tests (VIS-806 / Track H H-1).
 *
 * The publish slice drives the TopBar PublishCluster: live pending-change
 * count, the global save-activity counter, Publish (flush draft cache to
 * YAML) and Discard (drop the draft cache, Q14 rollback).
 */
import useStore from './store';
import * as publishApi from '../api/publish';
import { emitFirstPublishTelemetry } from '../components/new-views/workspace/telemetry';

jest.mock('../api/publish', () => ({
  getPublishStatus: jest.fn(),
  getPendingChanges: jest.fn(),
  publishChanges: jest.fn(),
  discardChanges: jest.fn(),
}));

jest.mock('../components/new-views/workspace/telemetry', () => ({
  emitFirstPublishTelemetry: jest.fn(),
  emitWorkspaceEvent: jest.fn(),
  markBuildModeEntered: jest.fn(),
  setWorkspaceTelemetryListener: jest.fn(),
}));

// Every named-child fetcher the publish/discard flows refresh — stubbed so
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

describe('publishStore (VIS-806)', () => {
  let fetcherStubs;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcherStubs = Object.fromEntries(
      FETCHER_KEYS.map(key => [key, jest.fn().mockResolvedValue(undefined)])
    );
    useStore.setState({
      ...fetcherStubs,
      hasUnpublishedChanges: false,
      pendingChanges: [],
      pendingCount: 0,
      publishLoading: false,
      publishError: null,
      publishModalOpen: false,
      discardLoading: false,
      lastPublishedAt: null,
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
  });

  describe('checkPublishStatus', () => {
    test('sets count, list, and boolean from the pending endpoint', async () => {
      publishApi.getPendingChanges.mockResolvedValue({
        pending: [
          { name: 'a', type: 'chart', status: 'new' },
          { name: 'b', type: 'dashboard', status: 'modified' },
        ],
        count: 2,
      });

      await useStore.getState().checkPublishStatus();

      const state = useStore.getState();
      expect(state.pendingCount).toBe(2);
      expect(state.hasUnpublishedChanges).toBe(true);
      expect(state.pendingChanges).toHaveLength(2);
    });

    test('falls back to clean state when the endpoint is unavailable', async () => {
      useStore.setState({ pendingCount: 5, hasUnpublishedChanges: true });
      publishApi.getPendingChanges.mockRejectedValue(new Error('404'));

      await useStore.getState().checkPublishStatus();

      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUnpublishedChanges).toBe(false);
      expect(state.pendingChanges).toEqual([]);
    });

    test('derives the count from the list when the endpoint omits it', async () => {
      publishApi.getPendingChanges.mockResolvedValue({
        pending: [{ name: 'a', type: 'chart', status: 'new' }],
      });

      await useStore.getState().checkPublishStatus();

      expect(useStore.getState().pendingCount).toBe(1);
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

  describe('publishChanges', () => {
    test('clears pending state, stamps lastPublishedAt, emits first-publish telemetry, and refreshes collections', async () => {
      useStore.setState({
        pendingCount: 3,
        hasUnpublishedChanges: true,
        publishModalOpen: true,
      });
      publishApi.publishChanges.mockResolvedValue({ published_count: 3 });

      const result = await useStore.getState().publishChanges();

      expect(result.success).toBe(true);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUnpublishedChanges).toBe(false);
      expect(state.publishModalOpen).toBe(false);
      expect(state.lastPublishedAt).toEqual(expect.any(Number));
      expect(emitFirstPublishTelemetry).toHaveBeenCalledTimes(1);
      FETCHER_KEYS.forEach(key => expect(fetcherStubs[key]).toHaveBeenCalled());
    });

    test('surfaces the error and keeps pending state on failure', async () => {
      useStore.setState({ pendingCount: 2, hasUnpublishedChanges: true });
      publishApi.publishChanges.mockRejectedValue(new Error('YAML write failed'));

      const result = await useStore.getState().publishChanges();

      expect(result.success).toBe(false);
      const state = useStore.getState();
      expect(state.publishError).toBe('YAML write failed');
      expect(state.publishLoading).toBe(false);
      expect(state.pendingCount).toBe(2);
      expect(emitFirstPublishTelemetry).not.toHaveBeenCalled();
    });
  });

  describe('discardChanges', () => {
    test('drops pending state and refreshes every collection (canvas revert)', async () => {
      useStore.setState({ pendingCount: 4, hasUnpublishedChanges: true });
      publishApi.discardChanges.mockResolvedValue({ discarded_count: 4 });

      const result = await useStore.getState().discardChanges();

      expect(result.success).toBe(true);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(0);
      expect(state.hasUnpublishedChanges).toBe(false);
      expect(state.discardLoading).toBe(false);
      FETCHER_KEYS.forEach(key => expect(fetcherStubs[key]).toHaveBeenCalled());
    });

    test('reports failure without clearing pending state', async () => {
      useStore.setState({ pendingCount: 4, hasUnpublishedChanges: true });
      publishApi.discardChanges.mockRejectedValue(new Error('boom'));

      const result = await useStore.getState().discardChanges();

      expect(result.success).toBe(false);
      const state = useStore.getState();
      expect(state.pendingCount).toBe(4);
      expect(state.discardLoading).toBe(false);
      expect(fetcherStubs.fetchDashboards).not.toHaveBeenCalled();
    });
  });
});
