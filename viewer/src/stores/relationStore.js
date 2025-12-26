import * as relationsApi from '../api/relations';

/**
 * Relation Store Slice
 *
 * Manages Relation configurations independently.
 * Uses the new /api/relations/ endpoints via RelationManager backend.
 */
const createRelationSlice = (set, get) => ({
  // State
  relations: [], // All relations with status (NEW, MODIFIED, PUBLISHED)
  relationsLoading: false,
  relationsError: null,
  editingRelation: null, // Relation being edited (null = create mode)
  relationModalOpen: false,

  // Fetch all relations from API
  fetchRelations: async () => {
    set({ relationsLoading: true, relationsError: null });
    try {
      const data = await relationsApi.fetchAllRelations();
      set({ relations: data.relations || [], relationsLoading: false });
    } catch (error) {
      set({ relationsError: error.message, relationsLoading: false });
    }
  },

  // Save relation to cache
  saveRelation: async (name, config) => {
    try {
      const result = await relationsApi.saveRelation(name, config);
      // Refresh relations list to get updated status
      await get().fetchRelations();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark relation for deletion (will be removed from YAML on publish)
  deleteRelation: async name => {
    try {
      await relationsApi.deleteRelation(name);
      await get().fetchRelations();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing relation
  openEditRelationModal: relation => {
    set({
      editingRelation: relation,
      relationModalOpen: true,
    });
  },

  // Open modal for creating new relation
  openCreateRelationModal: () => {
    set({
      editingRelation: null,
      relationModalOpen: true,
    });
  },

  // Close modal
  closeRelationModal: () => {
    set({
      editingRelation: null,
      relationModalOpen: false,
    });
  },

  // Get relation by name
  getRelationByName: name => {
    const { relations } = get();
    return relations.find(r => r.name === name);
  },

  // Get status for a specific relation
  getRelationStatus: name => {
    const relation = get().getRelationByName(name);
    return relation?.status || null;
  },
});

export default createRelationSlice;
