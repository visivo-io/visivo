import * as sourcesApi from '../api/sources';
import * as projectApi from '../api/project';
import * as publishApi from '../api/publish';

// Object status constants (matches backend ObjectStatus enum)
export const ObjectStatus = {
  NEW: 'new',
  MODIFIED: 'modified',
  PUBLISHED: 'published',
  DELETED: 'deleted',
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
      const projectId = get().project?.id;
      const data = await sourcesApi.fetchAllSources(projectId);
      set({ sources: data.sources || [], sourcesLoading: false });
    } catch (error) {
      set({ sourcesError: error.message, sourcesLoading: false });
    }
  },

  // Save source.
  //
  // Branches on the project's effective draft mode:
  //   - draft mode ON: stage in cache, surface a "Saved as draft" toast, and
  //     leave it to the user to click Publish.
  //   - draft mode OFF (immediate write): stage + immediately publish in one
  //     pass so the YAML on disk reflects the change before the toast fires.
  //
  // Falls back to draft-mode behavior on any error fetching the flag, since
  // staging is the safer default if we can't determine intent.
  saveSource: async (name, config) => {
    try {
      const draftModeEnabled = await projectApi.fetchDraftMode();

      // Always cache first so the source manager has the new config
      // available for both branches.
      const result = await sourcesApi.saveSource(name, config);
      await get().fetchSources();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }

      if (!draftModeEnabled) {
        // Immediate write: flush the cache to YAML right away.
        try {
          await publishApi.publishChanges();
          if (get().fetchSources) await get().fetchSources();
          if (get().checkPublishStatus) await get().checkPublishStatus();
          if (get().pushNotification) {
            get().pushNotification({
              message: 'Saved to project.visivo.yml',
              variant: 'success',
            });
          }
          return { success: true, result, immediateWrite: true };
        } catch (publishError) {
          if (get().pushNotification) {
            get().pushNotification({
              message: `Saved as draft (immediate write failed: ${publishError.message})`,
              variant: 'warning',
              durationMs: 6000,
            });
          }
          return { success: true, result, immediateWrite: false };
        }
      }

      if (get().pushNotification) {
        get().pushNotification({
          message: 'Saved as draft. Click Publish to write to project files.',
          variant: 'info',
        });
      }
      return { success: true, result, immediateWrite: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark source for deletion (will be removed from YAML on publish)
  deleteSource: async name => {
    try {
      await sourcesApi.deleteSource(name);
      await get().fetchSources();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
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
