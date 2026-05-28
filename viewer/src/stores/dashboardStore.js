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
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      // Tap for the onboarding "Build a Dashboard" checklist row.
      recordOnboardingAction('dashboard_saved');
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Reassign a dashboard to a different level (draft edit).
   *
   * The Project Editor's drag-between-levels gesture calls this. It persists
   * the change through the same draft cache path as `saveDashboard` — the
   * dashboard's stored config gets its `level` field updated (or removed for
   * the Unassigned group, signalled by a `null` / `undefined` level) — so the
   * publish flow picks it up like any other unpublished edit.
   *
   * Returns `{ success, result|error }`. No-op (success: false) when the
   * dashboard isn't found or already sits in the target level.
   */
  reassignDashboardLevel: async (name, level) => {
    const dashboards = get().dashboards || [];
    const dashboard = dashboards.find(d => d.name === name);
    if (!dashboard) {
      return { success: false, error: `Dashboard "${name}" not found` };
    }
    const currentLevel = dashboard.config?.level ?? null;
    const nextLevel = level ?? null;
    if (currentLevel === nextLevel) {
      return { success: false, error: 'unchanged' };
    }
    const nextConfig = { ...(dashboard.config || {}) };
    if (nextLevel === null) {
      delete nextConfig.level;
    } else {
      nextConfig.level = nextLevel;
    }
    return get().saveDashboard(name, nextConfig);
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
