import * as insightsApi from '../api/insights';

/**
 * Insight Store Slice
 *
 * Manages Insight configurations independently (for editing).
 * Uses the /api/insights/ endpoints via InsightManager backend.
 */
const createInsightSlice = (set, get) => ({
  // State
  insights: [], // All insights with status (NEW, MODIFIED, PUBLISHED)
  insightsLoading: false,
  insightsError: null,
  editingInsight: null, // Insight being edited (null = create mode)
  insightModalOpen: false,

  // Fetch all insights from API
  fetchInsights: async () => {
    set({ insightsLoading: true, insightsError: null });
    try {
      const data = await insightsApi.fetchAllInsights();
      set({ insights: data.insights || [], insightsLoading: false });
    } catch (error) {
      set({ insightsError: error.message, insightsLoading: false });
    }
  },

  // Save insight to cache
  saveInsight: async (name, config) => {
    try {
      const result = await insightsApi.saveInsight(name, config);
      // Refresh insights list to get updated status
      await get().fetchInsights();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark insight for deletion (will be removed from YAML on publish)
  deleteInsight: async name => {
    try {
      await insightsApi.deleteInsight(name);
      await get().fetchInsights();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing insight
  openEditInsightModal: insight => {
    set({
      editingInsight: insight,
      insightModalOpen: true,
    });
  },

  // Open modal for creating new insight
  openCreateInsightModal: () => {
    set({
      editingInsight: null,
      insightModalOpen: true,
    });
  },

  // Close modal
  closeInsightModal: () => {
    set({
      editingInsight: null,
      insightModalOpen: false,
    });
  },

  // Get insight by name
  getInsightByName: name => {
    const { insights } = get();
    return insights.find(i => i.name === name);
  },

  // Get status for a specific insight
  getInsightStatus: name => {
    const insight = get().getInsightByName(name);
    return insight?.status || null;
  },
});

export default createInsightSlice;
