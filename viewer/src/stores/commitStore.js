import * as branchingApi from '../api/branching';

/**
 * Commit Store Slice — backend-agnostic.
 *
 * Drives the commit workflow off the project-scoped endpoints
 * (/api/projects/<id>/changes/ and /commit/). Both servers implement them:
 * Flask (visivo serve) and Django (cloud). No local-vs-cloud branching.
 */
const createCommitSlice = (set, get) => ({
  // State
  hasUncommittedChanges: false,
  pendingChanges: [], // [{name, type, status}]
  commitLoading: false,
  commitError: null,
  commitModalOpen: false,

  // Refresh the dirty set + the commit badge from the project's /changes/.
  checkCommitStatus: async () => {
    const projectId = get().project?.id;
    if (!projectId) {
      set({ hasUncommittedChanges: false });
      return;
    }
    try {
      const changes = await branchingApi.fetchChanges(projectId);
      const pending = [...(changes.to_publish || []), ...(changes.to_remove || [])];
      set({ hasUncommittedChanges: !!changes.has_changes, pendingChanges: pending });
      // Called after each save — a debounced run is incoming, so open the run
      // poll window (the poller stops on its own once it passes + no run runs).
      if (changes.has_changes) get().noteDraftActivity?.();
    } catch (error) {
      // Endpoint may be unavailable (e.g. dist mode) — fail closed.
      set({ hasUncommittedChanges: false });
    }
  },

  // Kept for callers that fetch the list directly; same source as the badge.
  fetchPendingChanges: async () => {
    await get().checkCommitStatus();
    return get().pendingChanges;
  },

  // Commit (publish) the project's draft.
  commitChanges: async () => {
    const projectId = get().project?.id;
    if (!projectId) return { success: false, error: 'No active project' };
    set({ commitLoading: true, commitError: null });
    const { status, body } = await branchingApi.commitDraft(projectId);
    // Cloud: 201 publishes (+next_draft); 200 {committed:false} is a no-op.
    // Local: 200 is success. So success = 201, or 200 unless committed===false.
    const isSuccess = status === 201 || (status === 200 && body.committed !== false);
    if (isSuccess) {
      // Cloud hands back a fresh draft to keep editing; merge to retarget the id.
      if (body.next_draft) get().setProject?.({ ...get().project, ...body.next_draft });
      set({
        commitLoading: false,
        hasUncommittedChanges: false,
        pendingChanges: [],
        commitModalOpen: false,
      });
      // Refresh sources and models to reflect the committed state.
      await get().fetchSources?.();
      await get().fetchModels?.();
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
