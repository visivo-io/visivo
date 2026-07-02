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
      const projectId = get().project?.id;
      const data = await defaultsApi.fetchDefaults(projectId);
      set({ defaults: data, defaultsLoading: false });
    } catch (error) {
      set({ defaultsError: error.message, defaultsLoading: false });
    }
  },

  // Save defaults to cache. Reports into the global save-activity counter
  // (H-1) — level CRUD persists through this path without the debounced hook.
  saveDefaults: async config => {
    get().beginSaveActivity?.();
    let ok = false;
    try {
      const projectId = get().project?.id;
      const result = await defaultsApi.saveDefaults(config, projectId);
      ok = true;
      // Refresh defaults
      await get().fetchDefaults();
      // Trigger commit status check
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      get().endSaveActivity?.(ok);
    }
  },
});

export default createDefaultsSlice;
