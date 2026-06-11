import * as publishApi from '../api/publish';
import { emitFirstPublishTelemetry } from '../components/new-views/workspace/telemetry';

/**
 * Publish Store Slice
 *
 * Manages the publish workflow for writing cached changes to YAML files
 * (Track H / VIS-806). Tracks unpublished changes across every named-child
 * type, the live pending-changes count for the TopBar cluster, and a global
 * save-activity counter so the cluster can show "Saving…" while any draft
 * write is in flight (canvas actions, right-rail forms, level CRUD).
 */

/**
 * Every named-child fetch action that must re-run after a publish or a
 * discard so the UI reflects the backend's post-flush state. Discard is the
 * critical consumer: the canvas re-renders from these refetches (Q14
 * rollback). Each key is called via `get()[key]?.()` so a missing slice
 * (e.g. in a trimmed test store) is a no-op rather than a crash.
 */
const NAMED_CHILD_FETCHERS = [
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

const createPublishSlice = (set, get) => ({
  // State
  hasUnpublishedChanges: false,
  pendingChanges: [], // List of objects with pending changes
  pendingCount: 0,
  publishLoading: false,
  publishError: null,
  publishModalOpen: false,
  discardLoading: false,
  // Timestamp of the last successful publish — the TopBar cluster derives
  // its transient "Published ✓" flash from changes to this value.
  lastPublishedAt: null,
  // Global save-activity tracking (H-1). `saveActivityCount` counts draft
  // writes currently in flight; `lastSaveFailed` latches on a failed write
  // and resets when the next write begins.
  saveActivityCount: 0,
  lastSaveFailed: false,

  beginSaveActivity: () =>
    set(state => ({
      saveActivityCount: state.saveActivityCount + 1,
      lastSaveFailed: false,
    })),

  endSaveActivity: (ok = true) =>
    set(state => ({
      saveActivityCount: Math.max(0, state.saveActivityCount - 1),
      lastSaveFailed: ok ? state.lastSaveFailed : true,
    })),

  // Refresh pending-change state (count + list + boolean) in one round trip.
  // Save actions call this after every draft write, so the TopBar count
  // updates live.
  checkPublishStatus: async () => {
    try {
      const data = await publishApi.getPendingChanges();
      const pending = data.pending || [];
      const count = typeof data.count === 'number' ? data.count : pending.length;
      set({
        pendingChanges: pending,
        pendingCount: count,
        hasUnpublishedChanges: count > 0,
      });
    } catch (error) {
      // Silently fail - endpoint may not be available in dist mode
      set({ hasUnpublishedChanges: false, pendingChanges: [], pendingCount: 0 });
    }
  },

  // Fetch all pending changes
  fetchPendingChanges: async () => {
    try {
      const data = await publishApi.getPendingChanges();
      const pending = data.pending || [];
      const count = typeof data.count === 'number' ? data.count : pending.length;
      set({
        pendingChanges: pending,
        pendingCount: count,
        hasUnpublishedChanges: count > 0,
      });
      return pending;
    } catch (error) {
      set({ pendingChanges: [], pendingCount: 0, hasUnpublishedChanges: false });
      return [];
    }
  },

  _refreshNamedChildren: async () => {
    await Promise.all(NAMED_CHILD_FETCHERS.map(key => get()[key]?.()));
  },

  // Publish all cached changes to YAML files
  publishChanges: async () => {
    set({ publishLoading: true, publishError: null });
    try {
      const result = await publishApi.publishChanges();
      set({
        publishLoading: false,
        hasUnpublishedChanges: false,
        pendingChanges: [],
        pendingCount: 0,
        publishModalOpen: false,
        lastPublishedAt: Date.now(),
      });
      emitFirstPublishTelemetry();
      // Refresh every named-child collection to reflect published state
      await get()._refreshNamedChildren();
      return { success: true, result };
    } catch (error) {
      set({ publishLoading: false, publishError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Discard all cached changes without writing YAML (Q14 rollback). The
  // named-child refetch is what makes the canvas revert to last-published.
  discardChanges: async () => {
    set({ discardLoading: true });
    try {
      const result = await publishApi.discardChanges();
      set({
        discardLoading: false,
        hasUnpublishedChanges: false,
        pendingChanges: [],
        pendingCount: 0,
        publishError: null,
      });
      await get()._refreshNamedChildren();
      return { success: true, result };
    } catch (error) {
      set({ discardLoading: false });
      return { success: false, error: error.message };
    }
  },

  // Open publish modal (fetches pending changes)
  openPublishModal: async () => {
    set({ publishModalOpen: true, publishError: null });
    await get().fetchPendingChanges();
  },

  // Close publish modal
  closePublishModal: () => {
    set({
      publishModalOpen: false,
      publishError: null,
    });
  },

  // Clear publish error
  clearPublishError: () => {
    set({ publishError: null });
  },
});

export default createPublishSlice;
