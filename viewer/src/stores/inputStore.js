import * as inputsApi from '../api/inputs';

/**
 * Input Store Slice
 *
 * Manages Input configurations independently (for editing).
 * Uses the /api/inputs/ endpoints via InputManager backend.
 */
const createInputSlice = (set, get) => ({
  // State
  inputConfigs: [], // All inputs with status (NEW, MODIFIED, PUBLISHED)
  inputConfigsLoading: false,
  inputConfigsError: null,
  editingInputConfig: null, // Input being edited (null = create mode)
  inputConfigModalOpen: false,

  // Fetch all inputs from API
  fetchInputConfigs: async () => {
    set({ inputConfigsLoading: true, inputConfigsError: null });
    try {
      const data = await inputsApi.fetchAllInputs();
      set({ inputConfigs: data.inputs || [], inputConfigsLoading: false });
    } catch (error) {
      set({ inputConfigsError: error.message, inputConfigsLoading: false });
    }
  },

  // Save input to cache
  saveInputConfig: async (name, config) => {
    try {
      const result = await inputsApi.saveInput(name, config);
      // Refresh inputs list to get updated status
      await get().fetchInputConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark input for deletion (will be removed from YAML on publish)
  deleteInputConfig: async name => {
    try {
      await inputsApi.deleteInput(name);
      await get().fetchInputConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing input
  openEditInputConfigModal: input => {
    set({
      editingInputConfig: input,
      inputConfigModalOpen: true,
    });
  },

  // Open modal for creating new input
  openCreateInputConfigModal: () => {
    set({
      editingInputConfig: null,
      inputConfigModalOpen: true,
    });
  },

  // Close modal
  closeInputConfigModal: () => {
    set({
      editingInputConfig: null,
      inputConfigModalOpen: false,
    });
  },

  // Get input by name
  getInputConfigByName: name => {
    const { inputConfigs } = get();
    return inputConfigs.find(i => i.name === name);
  },

  // Get status for a specific input
  getInputConfigStatus: name => {
    const input = get().getInputConfigByName(name);
    return input?.status || null;
  },
});

export default createInputSlice;
