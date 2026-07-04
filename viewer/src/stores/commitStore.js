import * as branchingApi from '../api/branching';
import * as commitApi from '../api/commit';
import { emitFirstPublishTelemetry } from '../components/views/workspace/telemetry';

/**
 * Commit Store Slice — backend-agnostic.
 *
 * Drives the commit workflow off the project-scoped endpoints
 * (/api/projects/<id>/changes/ and /commit/). Both servers implement them:
 * Flask (visivo serve) and Django (cloud). No local-vs-cloud branching.
 *
 * On top of the commit workflow this slice tracks the live pending-changes
 * count for the Workspace TopBar cluster (Track H / VIS-806) and a global
 * save-activity counter so the cluster can show "Saving…" while any draft
 * write is in flight (canvas actions, right-rail forms, level CRUD).
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
  pendingChanges: [], // [{name, type, status}]
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

  // Refresh the dirty set + the commit badge from the project's /changes/.
  // Save actions call this after every draft write, so the TopBar count
  // updates live.
  checkCommitStatus: async () => {
    const projectId = get().project?.id;
    if (!projectId) {
      set({ hasUncommittedChanges: false, pendingChanges: [], pendingCount: 0 });
      return;
    }
    try {
      const changes = await branchingApi.fetchChanges(projectId);
      const pending = [...(changes.to_publish || []), ...(changes.to_remove || [])];
      set({
        hasUncommittedChanges: !!changes.has_changes,
        pendingChanges: pending,
        pendingCount: pending.length,
      });
      // Called after each save — a debounced run is incoming, so open the run
      // poll window (the poller stops on its own once it passes + no run runs).
      if (changes.has_changes) get().noteDraftActivity?.();
    } catch (error) {
      // Endpoint may be unavailable (e.g. dist mode) — fail closed.
      set({ hasUncommittedChanges: false, pendingChanges: [], pendingCount: 0 });
    }
  },

  // Kept for callers that fetch the list directly; same source as the badge.
  fetchPendingChanges: async () => {
    await get().checkCommitStatus();
    return get().pendingChanges;
  },

  _refreshNamedChildren: async () => {
    await Promise.all(NAMED_CHILD_FETCHERS.map(key => get()[key]?.()));
  },

  // Commit (publish) the project's draft.
  commitChanges: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ commitLoading: true, commitError: null });
    let status, body;
    try {
      ({ status, body } = await branchingApi.commitDraft(projectId));
    } catch (error) {
      // Network-level failure (server restart, offline) — commitDraft only
      // guards JSON parsing. Without this, commitLoading sticks true and the
      // modal soft-locks.
      set({ commitLoading: false, commitError: error.message });
      return { success: false, error: error.message };
    }
    // Cloud: 201 publishes (terminal — the draft is now the live project); 200
    // {committed:false} is a no-op. Local: 200 is success. So success = 201, or
    // 200 unless committed===false.
    const isSuccess = status === 201 || (status === 200 && body.committed !== false);
    if (isSuccess) {
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
      // Refresh every named-child collection to reflect committed state.
      await get()._refreshNamedChildren();
      return { success: true, result: body };
    }
    if (status === 200) {
      set({ commitLoading: false });
      return { success: false, committed: false, detail: body.detail };
    }
    // 4xx gates: 409 run_required/run_in_progress/run_failed, 403 branch_required,
    // 422 invalid. Surface the action + message.
    const error =
      body.detail || (body.errors && JSON.stringify(body.errors)) || 'Failed to commit changes';
    set({ commitLoading: false, commitError: error });
    return { success: false, action: body.action, error };
  },

  // Discard all cached changes without writing YAML (Q14 rollback) — local
  // Flask only (/api/commit/discard/). The named-child refetch is what makes
  // the canvas revert to last-committed. Cloud drafts are discarded through
  // branchingApi.discardDraft (drop the draft project) instead.
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
      // Surface through commitError so CommitModal shows feedback instead of
      // silently keeping the confirm state open.
      set({ discardLoading: false, commitError: error.message });
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

  // Open commit modal (loads the dirty set).
  openCommitModal: async () => {
    set({ commitModalOpen: true, commitError: null });
    await get().checkCommitStatus();
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
