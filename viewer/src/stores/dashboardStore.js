import * as dashboardsApi from '../api/dashboards';

/**
 * Dashboard Store Slice
 *
 * Manages Dashboard configurations independently.
 */
const createDashboardSlice = (set, get) => ({
  // State
  dashboards: [],
  dashboardsLoading: false,
  dashboardsError: null,

  // Fetch all dashboards from API
  fetchDashboards: async () => {
    set({ dashboardsLoading: true, dashboardsError: null });
    try {
      const data = await dashboardsApi.fetchAllDashboards();
      set({ dashboards: data.dashboards || [], dashboardsLoading: false });
    } catch (error) {
      set({ dashboardsError: error.message, dashboardsLoading: false });
    }
  },

  // Save dashboard to cache
  saveDashboard: async (name, config) => {
    try {
      const result = await dashboardsApi.saveDashboard(name, config);
      await get().fetchDashboards();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark dashboard for deletion
  deleteDashboard: async name => {
    try {
      await dashboardsApi.deleteDashboard(name);
      await get().fetchDashboards();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createDashboardSlice;
