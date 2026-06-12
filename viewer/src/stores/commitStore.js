import * as commitApi from '../api/commit';
import { emitFirstPublishTelemetry } from '../components/new-views/workspace/telemetry';

/**
 * Commit Store Slice
 *
 * Manages the commit workflow for writing cached changes to YAML files
 * (Track H / VIS-806, aligned to main's Publish→Commit rename). Tracks
 * uncommitted changes across every named-child type, the live pending-changes
 * count for the Workspace TopBar cluster, and a global save-activity counter
 * so the cluster can show "Saving…" while any draft write is in flight
 * (canvas actions, right-rail forms, level CRUD).
 */

/**
 * Every named-child fetch action that must re-run after a commit or a
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

const createCommitSlice = (set, get) => ({
  // State
  hasUncommittedChanges: false,
  pendingChanges: [], // List of objects with pending changes
  pendingCount: 0,
  commitLoading: false,
  commitError: null,
  commitModalOpen: false,
  discardLoading: false,
  // Timestamp of the last successful commit — the TopBar cluster derives
  // its transient "Committed ✓" flash from changes to this value.
  lastCommittedAt: null,
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
  checkCommitStatus: async () => {
    try {
      const data = await commitApi.getPendingChanges();
      const pending = data.pending || [];
      const count = typeof data.count === 'number' ? data.count : pending.length;
      set({
        pendingChanges: pending,
        pendingCount: count,
        hasUncommittedChanges: count > 0,
      });
    } catch (error) {
      // Silently fail - endpoint may not be available in dist mode
      set({ hasUncommittedChanges: false, pendingChanges: [], pendingCount: 0 });
    }
  },

  // Fetch all pending changes
  fetchPendingChanges: async () => {
    try {
      const data = await commitApi.getPendingChanges();
      const pending = data.pending || [];
      const count = typeof data.count === 'number' ? data.count : pending.length;
      set({
        pendingChanges: pending,
        pendingCount: count,
        hasUncommittedChanges: count > 0,
      });
      return pending;
    } catch (error) {
      set({ pendingChanges: [], pendingCount: 0, hasUncommittedChanges: false });
      return [];
    }
  },

  _refreshNamedChildren: async () => {
    await Promise.all(NAMED_CHILD_FETCHERS.map(key => get()[key]?.()));
  },

  // Commit all cached changes to YAML files
  commitChanges: async () => {
    set({ commitLoading: true, commitError: null });
    try {
      const result = await commitApi.commitChanges();
      set({
        commitLoading: false,
        hasUncommittedChanges: false,
        pendingChanges: [],
        pendingCount: 0,
        commitModalOpen: false,
        lastCommittedAt: Date.now(),
      });
      // The Q22 metric keeps its original event name (taxonomy events are
      // additive — never renamed once live).
      emitFirstPublishTelemetry();
      // Refresh every named-child collection to reflect committed state
      await get()._refreshNamedChildren();
      return { success: true, result };
    } catch (error) {
      set({ commitLoading: false, commitError: error.message });
      return { success: false, error: error.message };
    }
  },

  // Discard all cached changes without writing YAML (Q14 rollback). The
  // named-child refetch is what makes the canvas revert to last-committed.
  discardChanges: async () => {
    set({ discardLoading: true });
    try {
      const result = await commitApi.discardChanges();
      set({
        discardLoading: false,
        hasUncommittedChanges: false,
        pendingChanges: [],
        pendingCount: 0,
        commitError: null,
      });
      await get()._refreshNamedChildren();
      return { success: true, result };
    } catch (error) {
      set({ discardLoading: false });
      return { success: false, error: error.message };
    }
  },

  // External-edit banner (VIS-808 / Q15). Shown when a hot-reload fires
  // during a dirty Build session — the backend dropped the drafts
  // (last-write-wins) and the canvas re-rendered from the file's state.
  externalEditBannerVisible: false,

  showExternalEditBanner: () => set({ externalEditBannerVisible: true }),

  dismissExternalEditBanner: () => set({ externalEditBannerVisible: false }),

  /**
   * Soft refresh after a backend `project_changed` event: re-pull the
   * project, every named-child collection, and the pending-change state so
   * the Workspace reflects the recompiled YAML without a page reload.
   */
  refreshFromProjectChange: async ({ draftsDropped = false } = {}) => {
    if (draftsDropped) {
      set({ externalEditBannerVisible: true });
    }
    await Promise.all([
      get().fetchProject?.(),
      get()._refreshNamedChildren(),
      get().checkCommitStatus(),
    ]);
  },

  // Open commit modal (fetches pending changes)
  openCommitModal: async () => {
    set({ commitModalOpen: true, commitError: null });
    await get().fetchPendingChanges();
  },

  // Close commit modal
  closeCommitModal: () => {
    set({
      commitModalOpen: false,
      commitError: null,
    });
  },

  // Clear commit error
  clearCommitError: () => {
    set({ commitError: null });
  },
});

export default createCommitSlice;
