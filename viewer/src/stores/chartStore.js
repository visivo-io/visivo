import * as chartsApi from '../api/charts';

/**
 * Chart Store Slice
 *
 * Manages Chart configurations independently (for editing).
 * Uses the /api/charts/ endpoints via ChartManager backend.
 */
const createChartSlice = (set, get) => ({
  // State
  charts: [], // All charts with status (NEW, MODIFIED, PUBLISHED)
  chartsLoading: false,
  chartsError: null,
  editingChart: null, // Chart being edited (null = create mode)
  chartModalOpen: false,

  // Fetch all charts from API
  fetchCharts: async () => {
    set({ chartsLoading: true, chartsError: null });
    try {
      // Get project ID from store for Django/deployed mode
      const { project } = get();
      const projectId = project?.id;

      const data = await chartsApi.fetchAllCharts(projectId);
      set({ charts: data.charts || [], chartsLoading: false });
    } catch (error) {
      set({ chartsError: error.message, chartsLoading: false });
    }
  },

  // Save chart to cache
  saveChart: async (name, config) => {
    try {
      // Get project ID from store for Django/deployed mode
      const { project } = get();
      const projectId = project?.id;

      const result = await chartsApi.saveChart(name, config, projectId);
      // Refresh charts list to get updated status
      await get().fetchCharts();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark chart for deletion (will be removed from YAML on publish)
  deleteChart: async name => {
    try {
      // Get project ID from store for Django/deployed mode
      const { project } = get();
      const projectId = project?.id;

      await chartsApi.deleteChart(name, projectId);
      await get().fetchCharts();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing chart
  openEditChartModal: chart => {
    set({
      editingChart: chart,
      chartModalOpen: true,
    });
  },

  // Open modal for creating new chart
  openCreateChartModal: () => {
    set({
      editingChart: null,
      chartModalOpen: true,
    });
  },

  // Close modal
  closeChartModal: () => {
    set({
      editingChart: null,
      chartModalOpen: false,
    });
  },

  // Get chart by name
  getChartByName: name => {
    const { charts } = get();
    return charts.find(c => c.name === name);
  },

  // Get status for a specific chart
  getChartStatus: name => {
    const chart = get().getChartByName(name);
    return chart?.status || null;
  },
});

export default createChartSlice;
