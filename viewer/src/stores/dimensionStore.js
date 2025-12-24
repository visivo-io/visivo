import * as dimensionsApi from '../api/dimensions';

/**
 * Dimension Store Slice
 *
 * Manages Dimension configurations independently.
 * Uses the new /api/dimensions/ endpoints via DimensionManager backend.
 */
const createDimensionSlice = (set, get) => ({
  // State
  dimensions: [], // All dimensions with status (NEW, MODIFIED, PUBLISHED)
  dimensionsLoading: false,
  dimensionsError: null,
  editingDimension: null, // Dimension being edited (null = create mode)
  dimensionModalOpen: false,

  // Fetch all dimensions from API
  fetchDimensions: async () => {
    set({ dimensionsLoading: true, dimensionsError: null });
    try {
      const data = await dimensionsApi.fetchAllDimensions();
      set({ dimensions: data.dimensions || [], dimensionsLoading: false });
    } catch (error) {
      set({ dimensionsError: error.message, dimensionsLoading: false });
    }
  },

  // Save dimension to cache
  saveDimension: async (name, config) => {
    try {
      const result = await dimensionsApi.saveDimension(name, config);
      // Refresh dimensions list to get updated status
      await get().fetchDimensions();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark dimension for deletion (will be removed from YAML on publish)
  deleteDimension: async name => {
    try {
      await dimensionsApi.deleteDimension(name);
      await get().fetchDimensions();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing dimension
  openEditDimensionModal: dimension => {
    set({
      editingDimension: dimension,
      dimensionModalOpen: true,
    });
  },

  // Open modal for creating new dimension
  openCreateDimensionModal: () => {
    set({
      editingDimension: null,
      dimensionModalOpen: true,
    });
  },

  // Close modal
  closeDimensionModal: () => {
    set({
      editingDimension: null,
      dimensionModalOpen: false,
    });
  },

  // Get dimension by name
  getDimensionByName: name => {
    const { dimensions } = get();
    return dimensions.find(d => d.name === name);
  },

  // Get status for a specific dimension
  getDimensionStatus: name => {
    const dimension = get().getDimensionByName(name);
    return dimension?.status || null;
  },
});

export default createDimensionSlice;
