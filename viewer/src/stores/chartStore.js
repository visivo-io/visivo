import * as chartsApi from '../api/charts';

/**
 * Chart Store Slice
 *
 * Manages Chart configurations independently (for editing).
 * Uses the /api/charts/ endpoints via ChartManager backend.
 */
const createChartSlice = (set, get) => ({
  // State
  chartConfigs: [], // All charts with status (NEW, MODIFIED, PUBLISHED)
  chartConfigsLoading: false,
  chartConfigsError: null,
  editingChartConfig: null, // Chart being edited (null = create mode)
  chartConfigModalOpen: false,

  // Fetch all charts from API
  fetchChartConfigs: async () => {
    set({ chartConfigsLoading: true, chartConfigsError: null });
    try {
      const data = await chartsApi.fetchAllCharts();
      set({ chartConfigs: data.charts || [], chartConfigsLoading: false });
    } catch (error) {
      set({ chartConfigsError: error.message, chartConfigsLoading: false });
    }
  },

  // Save chart to cache
  saveChartConfig: async (name, config) => {
    try {
      const result = await chartsApi.saveChart(name, config);
      // Refresh charts list to get updated status
      await get().fetchChartConfigs();
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
  deleteChartConfig: async name => {
    try {
      await chartsApi.deleteChart(name);
      await get().fetchChartConfigs();
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
  openEditChartConfigModal: chart => {
    set({
      editingChartConfig: chart,
      chartConfigModalOpen: true,
    });
  },

  // Open modal for creating new chart
  openCreateChartConfigModal: () => {
    set({
      editingChartConfig: null,
      chartConfigModalOpen: true,
    });
  },

  // Close modal
  closeChartConfigModal: () => {
    set({
      editingChartConfig: null,
      chartConfigModalOpen: false,
    });
  },

  // Get chart by name
  getChartConfigByName: name => {
    const { chartConfigs } = get();
    return chartConfigs.find(c => c.name === name);
  },

  // Get status for a specific chart
  getChartConfigStatus: name => {
    const chart = get().getChartConfigByName(name);
    return chart?.status || null;
  },
});

export default createChartSlice;
