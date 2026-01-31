import * as inputsApi from '../api/inputs';

/**
 * Input Store Slice
 *
 * Manages Input configurations independently (for editing).
 * Uses the /api/inputs/ endpoints via InputManager backend.
 */
const createInputSlice = (set, get) => ({
  // State
  inputs: [], // All inputs with status (NEW, MODIFIED, PUBLISHED)
  inputsLoading: false,
  inputsError: null,
  editingInput: null, // Input being edited (null = create mode)
  inputModalOpen: false,

  // Fetch all inputs from API
  fetchInputs: async () => {
    set({ inputsLoading: true, inputsError: null });
    try {
      const data = await inputsApi.fetchAllInputs();
      set({ inputs: data.inputs || [], inputsLoading: false });
    } catch (error) {
      set({ inputsError: error.message, inputsLoading: false });
    }
  },

  // Save input to cache
  saveInput: async (name, config) => {
    try {
      const result = await inputsApi.saveInput(name, config);
      // Refresh inputs list to get updated status
      await get().fetchInputs();
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
  deleteInput: async name => {
    try {
      await inputsApi.deleteInput(name);
      await get().fetchInputs();
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
  openEditInputModal: input => {
    set({
      editingInput: input,
      inputModalOpen: true,
    });
  },

  // Open modal for creating new input
  openCreateInputModal: () => {
    set({
      editingInput: null,
      inputModalOpen: true,
    });
  },

  // Close modal
  closeInputModal: () => {
    set({
      editingInput: null,
      inputModalOpen: false,
    });
  },

  // Get input by name
  getInputByName: name => {
    const { inputs } = get();
    return inputs.find(i => i.name === name);
  },

  // Get status for a specific input
  getInputStatus: name => {
    const input = get().getInputByName(name);
    return input?.status || null;
  },
});

export default createInputSlice;
