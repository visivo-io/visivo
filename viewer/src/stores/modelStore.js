import * as modelsApi from '../api/models';

/**
 * Model Store Slice
 *
 * Manages SqlModel configurations independently.
 * Uses the new /api/models/ endpoints via ModelManager backend.
 */
const createModelSlice = (set, get) => ({
  // State
  models: [], // All models with status (NEW, MODIFIED, PUBLISHED)
  modelsLoading: false,
  modelsError: null,
  editingModel: null, // Model being edited (null = create mode)
  modelModalOpen: false,

  // Fetch all models from API
  fetchModels: async () => {
    set({ modelsLoading: true, modelsError: null });
    try {
      const data = await modelsApi.fetchAllModels();
      set({ models: data.models || [], modelsLoading: false });
    } catch (error) {
      set({ modelsError: error.message, modelsLoading: false });
    }
  },

  // Save model to cache
  saveModel: async (name, config) => {
    try {
      const result = await modelsApi.saveModel(name, config);
      // Refresh models list to get updated status
      await get().fetchModels();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark model for deletion (will be removed from YAML on publish)
  deleteModel: async name => {
    try {
      await modelsApi.deleteModel(name);
      await get().fetchModels();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing model
  openEditModelModal: model => {
    set({
      editingModel: model,
      modelModalOpen: true,
    });
  },

  // Open modal for creating new model
  openCreateModelModal: () => {
    set({
      editingModel: null,
      modelModalOpen: true,
    });
  },

  // Close modal
  closeModelModal: () => {
    set({
      editingModel: null,
      modelModalOpen: false,
    });
  },

  // Get model by name
  getModelByName: name => {
    const { models } = get();
    return models.find(m => m.name === name);
  },

  // Get status for a specific model
  getModelStatus: name => {
    const model = get().getModelByName(name);
    return model?.status || null;
  },
});

export default createModelSlice;
