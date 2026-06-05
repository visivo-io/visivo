import * as commitApi from '../api/commit';

/**
 * Commit Store Slice
 *
 * Manages the commit workflow for writing cached changes to YAML files.
 * Tracks uncommitted changes across sources and models.
 */
const createCommitSlice = (set, get) => ({
  // State
  hasUncommittedChanges: false,
  pendingChanges: [], // List of objects with pending changes
  commitLoading: false,
  commitError: null,
  commitModalOpen: false,

  // Check if there are any uncommitted changes
  checkCommitStatus: async () => {
    try {
      const data = await commitApi.getCommitStatus();
      set({ hasUncommittedChanges: data.has_unpublished_changes });
    } catch (error) {
      // Silently fail - endpoint may not be available in dist mode
      set({ hasUncommittedChanges: false });
    }
  },

  // Fetch all pending changes
  fetchPendingChanges: async () => {
    try {
      const data = await commitApi.getPendingChanges();
      set({ pendingChanges: data.pending || [] });
      return data.pending || [];
    } catch (error) {
      set({ pendingChanges: [] });
      return [];
    }
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
        commitModalOpen: false,
      });
      // Refresh sources and models to reflect committed state
      await get().fetchSources?.();
      await get().fetchModels?.();
      return { success: true, result };
    } catch (error) {
      set({ commitLoading: false, commitError: error.message });
      return { success: false, error: error.message };
    }
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
