import * as csvScriptModelsApi from '../api/csvScriptModels';

/**
 * CsvScriptModel Store Slice
 *
 * Manages CsvScriptModel configurations independently.
 */
const createCsvScriptModelSlice = (set, get) => ({
  // State
  csvScriptModels: [],
  csvScriptModelsLoading: false,
  csvScriptModelsError: null,

  // Fetch all csv script models from API
  fetchCsvScriptModels: async () => {
    set({ csvScriptModelsLoading: true, csvScriptModelsError: null });
    try {
      const projectId = get().project?.id;
      const data = await csvScriptModelsApi.fetchAllCsvScriptModels(projectId);
      set({ csvScriptModels: data.csv_script_models || [], csvScriptModelsLoading: false });
    } catch (error) {
      set({ csvScriptModelsError: error.message, csvScriptModelsLoading: false });
    }
  },

  // Save csv script model to cache
  saveCsvScriptModel: async (name, config) => {
    try {
      const projectId = get().project?.id;
      const result = await csvScriptModelsApi.saveCsvScriptModel(name, config, projectId);
      await get().fetchCsvScriptModels();
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark csv script model for deletion
  deleteCsvScriptModel: async name => {
    try {
      const projectId = get().project?.id;
      await csvScriptModelsApi.deleteCsvScriptModel(name, projectId);
      await get().fetchCsvScriptModels();
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createCsvScriptModelSlice;
