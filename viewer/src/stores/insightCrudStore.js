import * as insightsCrudApi from '../api/insightsCrud';

/**
 * Insight CRUD Store Slice
 *
 * Manages Insight configurations independently (for editing).
 * Uses the /api/insights/ endpoints via InsightManager backend.
 */
const createInsightCrudSlice = (set, get) => ({
  // State
  insightConfigs: [], // All insights with status (NEW, MODIFIED, PUBLISHED)
  insightConfigsLoading: false,
  insightConfigsError: null,
  editingInsightConfig: null, // Insight being edited (null = create mode)
  insightConfigModalOpen: false,

  // Fetch all insights from API
  fetchInsightConfigs: async () => {
    set({ insightConfigsLoading: true, insightConfigsError: null });
    try {
      const data = await insightsCrudApi.fetchAllInsights();
      set({ insightConfigs: data.insights || [], insightConfigsLoading: false });
    } catch (error) {
      set({ insightConfigsError: error.message, insightConfigsLoading: false });
    }
  },

  // Save insight to cache
  saveInsightConfig: async (name, config) => {
    try {
      const result = await insightsCrudApi.saveInsight(name, config);
      // Refresh insights list to get updated status
      await get().fetchInsightConfigs();
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
  deleteInsightConfig: async name => {
    try {
      await insightsCrudApi.deleteInsight(name);
      await get().fetchInsightConfigs();
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
  openEditInsightConfigModal: insight => {
    set({
      editingInsightConfig: insight,
      insightConfigModalOpen: true,
    });
  },

  // Open modal for creating new insight
  openCreateInsightConfigModal: () => {
    set({
      editingInsightConfig: null,
      insightConfigModalOpen: true,
    });
  },

  // Close modal
  closeInsightConfigModal: () => {
    set({
      editingInsightConfig: null,
      insightConfigModalOpen: false,
    });
  },

  // Get insight by name
  getInsightConfigByName: name => {
    const { insightConfigs } = get();
    return insightConfigs.find(i => i.name === name);
  },

  // Get status for a specific insight
  getInsightConfigStatus: name => {
    const insight = get().getInsightConfigByName(name);
    return insight?.status || null;
  },
});

export default createInsightCrudSlice;
