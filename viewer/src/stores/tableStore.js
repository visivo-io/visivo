import * as tablesApi from '../api/tables';

/**
 * Table Store Slice
 *
 * Manages Table configurations independently (for editing).
 * Uses the /api/tables/ endpoints via TableManager backend.
 */
const createTableSlice = (set, get) => ({
  // State
  tableConfigs: [], // All tables with status (NEW, MODIFIED, PUBLISHED)
  tableConfigsLoading: false,
  tableConfigsError: null,
  editingTableConfig: null, // Table being edited (null = create mode)
  tableConfigModalOpen: false,

  // Fetch all tables from API
  fetchTableConfigs: async () => {
    set({ tableConfigsLoading: true, tableConfigsError: null });
    try {
      const data = await tablesApi.fetchAllTables();
      set({ tableConfigs: data.tables || [], tableConfigsLoading: false });
    } catch (error) {
      set({ tableConfigsError: error.message, tableConfigsLoading: false });
    }
  },

  // Save table to cache
  saveTableConfig: async (name, config) => {
    try {
      const result = await tablesApi.saveTable(name, config);
      // Refresh tables list to get updated status
      await get().fetchTableConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark table for deletion (will be removed from YAML on publish)
  deleteTableConfig: async name => {
    try {
      await tablesApi.deleteTable(name);
      await get().fetchTableConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing table
  openEditTableConfigModal: table => {
    set({
      editingTableConfig: table,
      tableConfigModalOpen: true,
    });
  },

  // Open modal for creating new table
  openCreateTableConfigModal: () => {
    set({
      editingTableConfig: null,
      tableConfigModalOpen: true,
    });
  },

  // Close modal
  closeTableConfigModal: () => {
    set({
      editingTableConfig: null,
      tableConfigModalOpen: false,
    });
  },

  // Get table by name
  getTableConfigByName: name => {
    const { tableConfigs } = get();
    return tableConfigs.find(t => t.name === name);
  },

  // Get status for a specific table
  getTableConfigStatus: name => {
    const table = get().getTableConfigByName(name);
    return table?.status || null;
  },
});

export default createTableSlice;
