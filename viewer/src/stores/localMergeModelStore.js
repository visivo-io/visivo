import * as localMergeModelsApi from '../api/localMergeModels';

/**
 * LocalMergeModel Store Slice
 *
 * Manages LocalMergeModel configurations independently.
 */
const createLocalMergeModelSlice = (set, get) => ({
  // State
  localMergeModels: [],
  localMergeModelsLoading: false,
  localMergeModelsError: null,

  // Fetch all local merge models from API
  fetchLocalMergeModels: async () => {
    set({ localMergeModelsLoading: true, localMergeModelsError: null });
    try {
      const data = await localMergeModelsApi.fetchAllLocalMergeModels();
      set({ localMergeModels: data.local_merge_models || [], localMergeModelsLoading: false });
    } catch (error) {
      set({ localMergeModelsError: error.message, localMergeModelsLoading: false });
    }
  },

  // Save local merge model to cache
  saveLocalMergeModel: async (name, config) => {
    try {
      const result = await localMergeModelsApi.saveLocalMergeModel(name, config);
      await get().fetchLocalMergeModels();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark local merge model for deletion
  deleteLocalMergeModel: async name => {
    try {
      await localMergeModelsApi.deleteLocalMergeModel(name);
      await get().fetchLocalMergeModels();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createLocalMergeModelSlice;
