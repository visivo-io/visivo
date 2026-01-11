import * as markdownsApi from '../api/markdowns';

/**
 * Markdown Store Slice
 *
 * Manages Markdown configurations independently (for editing).
 * Uses the /api/markdowns/ endpoints via MarkdownManager backend.
 */
const createMarkdownSlice = (set, get) => ({
  // State
  markdownConfigs: [], // All markdowns with status (NEW, MODIFIED, PUBLISHED)
  markdownConfigsLoading: false,
  markdownConfigsError: null,
  editingMarkdownConfig: null, // Markdown being edited (null = create mode)
  markdownConfigModalOpen: false,

  // Fetch all markdowns from API
  fetchMarkdownConfigs: async () => {
    set({ markdownConfigsLoading: true, markdownConfigsError: null });
    try {
      const data = await markdownsApi.fetchAllMarkdowns();
      set({ markdownConfigs: data.markdowns || [], markdownConfigsLoading: false });
    } catch (error) {
      set({ markdownConfigsError: error.message, markdownConfigsLoading: false });
    }
  },

  // Save markdown to cache
  saveMarkdownConfig: async (name, config) => {
    try {
      const result = await markdownsApi.saveMarkdown(name, config);
      // Refresh markdowns list to get updated status
      await get().fetchMarkdownConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Mark markdown for deletion (will be removed from YAML on publish)
  deleteMarkdownConfig: async name => {
    try {
      await markdownsApi.deleteMarkdown(name);
      await get().fetchMarkdownConfigs();
      // Trigger publish status check
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Open modal for editing existing markdown
  openEditMarkdownConfigModal: markdown => {
    set({
      editingMarkdownConfig: markdown,
      markdownConfigModalOpen: true,
    });
  },

  // Open modal for creating new markdown
  openCreateMarkdownConfigModal: () => {
    set({
      editingMarkdownConfig: null,
      markdownConfigModalOpen: true,
    });
  },

  // Close modal
  closeMarkdownConfigModal: () => {
    set({
      editingMarkdownConfig: null,
      markdownConfigModalOpen: false,
    });
  },

  // Get markdown by name
  getMarkdownConfigByName: name => {
    const { markdownConfigs } = get();
    return markdownConfigs.find(m => m.name === name);
  },

  // Get status for a specific markdown
  getMarkdownConfigStatus: name => {
    const markdown = get().getMarkdownConfigByName(name);
    return markdown?.status || null;
  },
});

export default createMarkdownSlice;
