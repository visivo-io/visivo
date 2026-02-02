import * as defaultsApi from '../api/defaults';

/**
 * Defaults Store Slice
 *
 * Manages project defaults (singleton, not a named collection).
 */
const createDefaultsSlice = (set, get) => ({
  // State
  defaults: null,
  defaultsLoading: false,
  defaultsError: null,

  // Fetch defaults from API
  fetchDefaults: async () => {
    set({ defaultsLoading: true, defaultsError: null });
    try {
      const data = await defaultsApi.fetchDefaults();
      set({ defaults: data, defaultsLoading: false });
    } catch (error) {
      set({ defaultsError: error.message, defaultsLoading: false });
    }
  },

  // Save defaults to cache
  saveDefaults: async config => {
    try {
      const result = await defaultsApi.saveDefaults(config);
      // Refresh defaults
      await get().fetchDefaults();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createDefaultsSlice;
