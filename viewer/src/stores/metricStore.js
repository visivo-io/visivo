import * as metricsApi from '../api/metrics';

/**
 * Metric Store Slice
 *
 * Manages Metric configurations independently.
 * Uses the new /api/metrics/ endpoints via MetricManager backend.
 */
const createMetricSlice = (set, get) => ({
  // State
  metrics: [], // All metrics with status (NEW, MODIFIED, PUBLISHED)
  metricsLoading: false,
  metricsError: null,
  editingMetric: null, // Metric being edited (null = create mode)
  metricModalOpen: false,

  // Fetch all metrics from API
  fetchMetrics: async () => {
    set({ metricsLoading: true, metricsError: null });
    try {
      const data = await metricsApi.fetchAllMetrics();
      set({ metrics: data.metrics || [], metricsLoading: false });
    } catch (error) {
      set({ metricsError: error.message, metricsLoading: false });
    }
  },

  // Save metric to cache
  saveMetric: async (name, config) => {
    try {
      const result = await metricsApi.saveMetric(name, config);
      // Refresh metrics list to get updated status
      await get().fetchMetrics();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark metric for deletion (will be removed from YAML on publish)
  deleteMetric: async name => {
    try {
      await metricsApi.deleteMetric(name);
      await get().fetchMetrics();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing metric
  openEditMetricModal: metric => {
    set({
      editingMetric: metric,
      metricModalOpen: true,
    });
  },

  // Open modal for creating new metric
  openCreateMetricModal: () => {
    set({
      editingMetric: null,
      metricModalOpen: true,
    });
  },

  // Close modal
  closeMetricModal: () => {
    set({
      editingMetric: null,
      metricModalOpen: false,
    });
  },

  // Get metric by name
  getMetricByName: name => {
    const { metrics } = get();
    return metrics.find(m => m.name === name);
  },

  // Get status for a specific metric
  getMetricStatus: name => {
    const metric = get().getMetricByName(name);
    return metric?.status || null;
  },
});

export default createMetricSlice;
