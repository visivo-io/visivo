import * as markdownsApi from '../api/markdowns';

/**
 * Markdown Store Slice
 *
 * Manages Markdown configurations independently (for editing).
 * Uses the /api/markdowns/ endpoints via MarkdownManager backend.
 */
const createMarkdownSlice = (set, get) => ({
  // State
  markdowns: [], // All markdowns with status (NEW, MODIFIED, PUBLISHED)
  markdownsLoading: false,
  markdownsError: null,
  editingMarkdown: null, // Markdown being edited (null = create mode)
  markdownModalOpen: false,

  // Fetch all markdowns from API
  fetchMarkdowns: async () => {
    set({ markdownsLoading: true, markdownsError: null });
    try {
      const data = await markdownsApi.fetchAllMarkdowns();
      set({ markdowns: data.markdowns || [], markdownsLoading: false });
    } catch (error) {
      set({ markdownsError: error.message, markdownsLoading: false });
    }
  },

  // Save markdown to cache
  saveMarkdown: async (name, config) => {
    try {
      const result = await markdownsApi.saveMarkdown(name, config);
      // Refresh markdowns list to get updated status
      await get().fetchMarkdowns();
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
  deleteMarkdown: async name => {
    try {
      await markdownsApi.deleteMarkdown(name);
      await get().fetchMarkdowns();
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
  openEditMarkdownModal: markdown => {
    set({
      editingMarkdown: markdown,
      markdownModalOpen: true,
    });
  },

  // Open modal for creating new markdown
  openCreateMarkdownModal: () => {
    set({
      editingMarkdown: null,
      markdownModalOpen: true,
    });
  },

  // Close modal
  closeMarkdownModal: () => {
    set({
      editingMarkdown: null,
      markdownModalOpen: false,
    });
  },

  // Get markdown by name
  getMarkdownByName: name => {
    const { markdowns } = get();
    return markdowns.find(m => m.name === name);
  },

  // Get status for a specific markdown
  getMarkdownStatus: name => {
    const markdown = get().getMarkdownByName(name);
    return markdown?.status || null;
  },
});

export default createMarkdownSlice;
