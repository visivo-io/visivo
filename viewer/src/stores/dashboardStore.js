import * as dashboardsApi from '../api/dashboards';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';

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
      const projectId = get().project?.id;
      const data = await dashboardsApi.fetchAllDashboards(projectId);
      set({ dashboards: data.dashboards || [], dashboardsLoading: false });
    } catch (error) {
      console.error('dashboardStore: fetch error', error);
      set({ dashboardsError: error.message, dashboardsLoading: false });
    }
  },

  // Save dashboard to cache
  saveDashboard: async (name, config) => {
    try {
      const result = await dashboardsApi.saveDashboard(name, config);
      await get().fetchDashboards();
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      // Tap for the onboarding "Build a Dashboard" checklist row.
      recordOnboardingAction('dashboard_saved');
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
      if (get().checkCommitStatus) {
        await get().checkCommitStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default createDashboardSlice;
