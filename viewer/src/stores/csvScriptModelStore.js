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
      const data = await csvScriptModelsApi.fetchAllCsvScriptModels();
      set({ csvScriptModels: data.csv_script_models || [], csvScriptModelsLoading: false });
    } catch (error) {
      set({ csvScriptModelsError: error.message, csvScriptModelsLoading: false });
    }
  },

  // Save csv script model to cache
  saveCsvScriptModel: async (name, config) => {
    try {
      const result = await csvScriptModelsApi.saveCsvScriptModel(name, config);
      await get().fetchCsvScriptModels();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark csv script model for deletion
  deleteCsvScriptModel: async name => {
    try {
      await csvScriptModelsApi.deleteCsvScriptModel(name);
      await get().fetchCsvScriptModels();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createCsvScriptModelSlice;
