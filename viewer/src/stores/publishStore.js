import * as publishApi from '../api/publish';

/**
 * Publish Store Slice
 *
 * Manages the publish workflow for writing cached changes to YAML files.
 * Tracks unpublished changes across sources and models.
 */
const createPublishSlice = (set, get) => ({
  // State
  hasUnpublishedChanges: false,
  pendingChanges: [], // List of objects with pending changes
  publishLoading: false,
  publishError: null,
  publishModalOpen: false,

  // Check if there are any unpublished changes
  checkPublishStatus: async () => {
    try {
      const data = await publishApi.getPublishStatus();
      set({ hasUnpublishedChanges: data.has_unpublished_changes });
    } catch (error) {
      // Silently fail - endpoint may not be available in dist mode
      set({ hasUnpublishedChanges: false });
    }
  },

  // Fetch all pending changes
  fetchPendingChanges: async () => {
    try {
      const data = await publishApi.getPendingChanges();
      set({ pendingChanges: data.pending || [] });
      return data.pending || [];
    } catch (error) {
      set({ pendingChanges: [] });
      return [];
    }
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
        publishModalOpen: false,
      });
      // Refresh sources and models to reflect published state
      await get().fetchSources?.();
      await get().fetchModels?.();
      return { success: true, result };
    } catch (error) {
      set({ publishLoading: false, publishError: error.message });
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
