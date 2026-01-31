import * as tablesApi from '../api/tables';

/**
 * Table Store Slice
 *
 * Manages Table configurations independently (for editing).
 * Uses the /api/tables/ endpoints via TableManager backend.
 */
const createTableSlice = (set, get) => ({
  // State
  tables: [], // All tables with status (NEW, MODIFIED, PUBLISHED)
  tablesLoading: false,
  tablesError: null,
  editingTable: null, // Table being edited (null = create mode)
  tableModalOpen: false,

  // Fetch all tables from API
  fetchTables: async () => {
    set({ tablesLoading: true, tablesError: null });
    try {
      const data = await tablesApi.fetchAllTables();
      set({ tables: data.tables || [], tablesLoading: false });
    } catch (error) {
      set({ tablesError: error.message, tablesLoading: false });
    }
  },

  // Save table to cache
  saveTable: async (name, config) => {
    try {
      const result = await tablesApi.saveTable(name, config);
      // Refresh tables list to get updated status
      await get().fetchTables();
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
  deleteTable: async name => {
    try {
      await tablesApi.deleteTable(name);
      await get().fetchTables();
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
  openEditTableModal: table => {
    set({
      editingTable: table,
      tableModalOpen: true,
    });
  },

  // Open modal for creating new table
  openCreateTableModal: () => {
    set({
      editingTable: null,
      tableModalOpen: true,
    });
  },

  // Close modal
  closeTableModal: () => {
    set({
      editingTable: null,
      tableModalOpen: false,
    });
  },

  // Get table by name
  getTableByName: name => {
    const { tables } = get();
    return tables.find(t => t.name === name);
  },

  // Get status for a specific table
  getTableStatus: name => {
    const table = get().getTableByName(name);
    return table?.status || null;
  },
});

export default createTableSlice;
