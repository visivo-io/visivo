import * as branchingApi from '../api/branching';
import * as preferencesApi from '../api/preferences';
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

// What "we don't know of any changes" looks like. Used both before a project is
// loaded and when /changes/ is unreachable — the badge and the Runs dot fail
// closed rather than showing a stale count.
const EMPTY_CHANGES = {
  hasUncommittedChanges: false,
  pendingChanges: [],
  pendingCount: 0,
  stagedChanges: [],
  stagedCount: 0,
  stagedDagFilter: '',
};

const createCommitSlice = (set, get) => ({
  // State
  hasUncommittedChanges: false,
  pendingChanges: [], // [{name, type, status}]
  pendingCount: 0,
  // What a RUN would build, as opposed to what a COMMIT would publish. Narrower
  // than pendingChanges: a chart colour or a dashboard layout tweak is
  // uncommitted but needs no run, so it's absent here. Carried on the same
  // /changes/ response, which is why the Runs tab dot updates on save rather
  // than waiting for the next run poll.
  stagedChanges: [], // [{name, type, status}]
  stagedCount: 0,
  stagedDagFilter: '',
  // 'automatic' | 'manual' — the user's own setting, echoed here for first
  // paint. GET/PUT /api/me/preferences/ is the source of truth.
  runTrigger: 'automatic',
  commitLoading: false,
  commitError: null,
  // The machine-readable reason a commit was refused ('run_required' /
  // 'run_in_progress' / 'run_failed' / 'branch_required' / 'invalid'), so the
  // modal can say something more useful than the raw detail string.
  commitAction: null,
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
      set({ ...EMPTY_CHANGES });
      return;
    }
    try {
      const changes = await branchingApi.fetchChanges(projectId);
      const pending = [...(changes.to_publish || []), ...(changes.to_remove || [])];
      // A server older than this viewer sends no staged keys; default them
      // rather than rendering `undefined` as an empty-but-unknown state.
      const staged = changes.staged || [];
      set({
        hasUncommittedChanges: !!changes.has_changes,
        pendingChanges: pending,
        pendingCount: pending.length,
        stagedChanges: staged,
        stagedCount: staged.length,
        stagedDagFilter: changes.staged_dag_filter || '',
        runTrigger: changes.run_trigger || get().runTrigger,
      });
    } catch (error) {
      // Endpoint may be unavailable (e.g. dist mode) — fail closed.
      set({ ...EMPTY_CHANGES });
    }
  },

  // Flip the run trigger. Optimistic so the toggle doesn't lag the click, then
  // reconciled with whatever the server actually stored.
  setRunTrigger: async runTrigger => {
    const previous = get().runTrigger;
    set({ runTrigger });
    const saved = await preferencesApi.savePreferences({ run_trigger: runTrigger });
    if (!saved) {
      set({ runTrigger: previous });
      return false;
    }
    set({ runTrigger: saved.run_trigger });
    return true;
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
    set({ commitLoading: true, commitError: null, commitAction: null });
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
    // Store the action too, not just the message: the modal needs to know a
    // refusal was `run_required` to point at the Runs tab, and the detail string
    // is not something to pattern-match on.
    set({ commitLoading: false, commitError: error, commitAction: body.action || null });
    return { success: false, action: body.action, error };
  },

  // Discard the draft's uncommitted changes, reverting to last-published.
  //
  // Goes through `POST /api/projects/<id>/discard/`, the same mirrored surface
  // commitChanges uses — NOT the local-only `/api/commit/discard/`, which core
  // does not implement, so in cloud the button 404'd and the header kept
  // showing Commit/Discard as though nothing had happened.
  //
  // Note the sibling `discardDraft` DELETEs the same path to drop the working
  // copy entirely. Same URL, different verb, very different meaning.
  discardChanges: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ discardLoading: true });
    try {
      const result = await branchingApi.discardDraftChanges(projectId);
      set({
        discardLoading: false,
        hasUncommittedChanges: false,
        pendingChanges: [],
        pendingCount: 0,
        // Clearing the STAGED set too is what actually refreshes the header:
        // it drives the run-pending affordance independently of pendingChanges,
        // so leaving it set kept the toolbar dirty after a successful discard.
        stagedChanges: [],
        stagedCount: 0,
        stagedDagFilter: '',
        commitError: null,
      });
      await get()._refreshNamedChildren();
      // Re-read the server's own view rather than trusting the optimistic
      // clear above — a per-resource discard can leave the draft still dirty.
      await get().checkCommitStatus();
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
