import * as modelsApi from '../api/models';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';

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
      const projectId = get().project?.id;
      const data = await modelsApi.fetchAllModels(projectId);
      set({ models: data.models || [], modelsLoading: false });
    } catch (error) {
      set({ modelsError: error.message, modelsLoading: false });
    }
  },

  // Save model to cache
  saveModel: async (name, config) => {
    try {
      const projectId = get().project?.id;
      const result = await modelsApi.saveModel(name, config, projectId);
      // Refresh models list to get updated status
      await get().fetchModels();
      // Trigger commit status check
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      // Tap for the onboarding "Build a Model" checklist row.
      recordOnboardingAction('model_saved');
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark model for deletion (will be removed from YAML on commit)
  deleteModel: async name => {
    try {
      const projectId = get().project?.id;
      await modelsApi.deleteModel(name, projectId);
      await get().fetchModels();
      // Trigger commit status check
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
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
