import * as modelsApi from '../api/models';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';
import { markTimeToValueStep, TTV_STEPS } from '../components/onboarding/timeToValue';

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
  /**
   * Refresh the collections a model can change by proxy. Nested metrics and
   * dimensions have no independent existence: the managers assemble their lists
   * by walking `model.metrics` / `model.dimensions`, so a model write is also a
   * write to those. Tolerates their absence — the stores are composed, and a
   * partial store (tests, embedded hosts) must not break a model save.
   */
  refetchModelScopedFields: async () => {
    await Promise.all([
      get().fetchDimensions?.(),
      get().fetchMetrics?.(),
    ]);
  },

  saveModel: async (name, config) => {
    try {
      const projectId = get().project?.id;
      const result = await modelsApi.saveModel(name, config, projectId);
      // Refresh models list to get updated status
      await get().fetchModels();
      // A model OWNS its nested metrics/dimensions — `list_all_dimensions` /
      // `list_all_metrics` walk the models to build their lists — so saving one
      // can add or remove entries in those collections. Refetching only
      // `models` left the Library showing fields that no longer exist, and
      // hiding ones just added, until a full page reload.
      await get().refetchModelScopedFields?.();
      // Trigger commit status check
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      // Tap for the onboarding "Build a Model" checklist row.
      recordOnboardingAction('model_saved');
      // Step 4 of the time-to-value ladder — separate from the tap above, which
      // no-ops until onboarding is complete, and users who skipped it count too.
      markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);
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
      // Deleting a model takes its nested fields with it.
      await get().refetchModelScopedFields?.();
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
