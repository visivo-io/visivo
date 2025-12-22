import * as sourcesApi from '../api/sources';

// Object status constants (matches backend ObjectStatus enum)
export const ObjectStatus = {
  NEW: 'new',
  MODIFIED: 'modified',
  PUBLISHED: 'published',
};

/**
 * Source Store Slice
 *
 * Manages source configurations independently of the existing editorStore.
 * Uses the new /api/sources/ endpoints via SourceManager backend.
 */
const createSourceSlice = (set, get) => ({
  // State
  sources: [], // All sources with status (NEW, MODIFIED, PUBLISHED)
  sourcesLoading: false,
  sourcesError: null,
  editingSource: null, // Source being edited (null = create mode)
  sourceModalOpen: false,
  connectionStatus: {}, // name -> { status: 'connected'|'failed'|'testing', error?: string }

  // Fetch all sources from API
  fetchSources: async () => {
    set({ sourcesLoading: true, sourcesError: null });
    try {
      const data = await sourcesApi.fetchAllSources();
      set({ sources: data.sources || [], sourcesLoading: false });
    } catch (error) {
      set({ sourcesError: error.message, sourcesLoading: false });
    }
  },

  // Save source to cache
  saveSource: async (name, config) => {
    try {
      const result = await sourcesApi.saveSource(name, config);
      // Refresh sources list to get updated status
      await get().fetchSources();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Delete source from cache (revert to published)
  deleteSource: async name => {
    try {
      await sourcesApi.deleteSource(name);
      await get().fetchSources();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing source
  openEditModal: source => {
    set({
      editingSource: source,
      sourceModalOpen: true,
    });
  },

  // Open modal for creating new source
  openCreateModal: () => {
    set({
      editingSource: null,
      sourceModalOpen: true,
    });
  },

  // Close modal
  closeSourceModal: () => {
    set({
      editingSource: null,
      sourceModalOpen: false,
    });
  },

  // Test connection for a source config
  testConnection: async config => {
    const name = config.name || 'new';
    set(state => ({
      connectionStatus: {
        ...state.connectionStatus,
        [name]: { status: 'testing' },
      },
    }));

    try {
      const result = await sourcesApi.testSourceConnection(config);
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [name]: {
            status: result.status === 'connected' ? 'connected' : 'failed',
            error: result.error,
          },
        },
      }));
      return result;
    } catch (error) {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [name]: { status: 'failed', error: error.message },
        },
      }));
      return { status: 'connection_failed', error: error.message };
    }
  },

  // Clear connection status for a source
  clearConnectionStatus: name => {
    set(state => {
      const newStatus = { ...state.connectionStatus };
      delete newStatus[name];
      return { connectionStatus: newStatus };
    });
  },

  // Get source by name (for DAG integration)
  getSourceByName: name => {
    const { sources } = get();
    return sources.find(s => s.name === name);
  },

  // Get status for a specific source
  getSourceStatus: name => {
    const source = get().getSourceByName(name);
    return source?.status || null;
  },
});

export default createSourceSlice;
