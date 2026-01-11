import { organizeDashboardsByLevel } from '../utils/dashboardUtils';

const createProjectSlice = (set, get) => ({
  // Dashboard filtering state
  searchTerm: '',
  selectedTags: [],

  // Dashboard organization
  dashboards: [],
  filteredDashboards: [],
  dashboardsByLevel: [],
  availableTags: [],

  // Current dashboard selection
  currentDashboardName: null,

  // Actions
  setSearchTerm: searchTerm => {
    set({ searchTerm });
    // Trigger filtering when search term changes
    get().filterDashboards();
  },

  setSelectedTags: selectedTags => {
    // Ensure selectedTags is always an array
    const tagsArray = Array.isArray(selectedTags) ? selectedTags : [];
    set({ selectedTags: tagsArray });
    // Trigger filtering when tags change
    get().filterDashboards();
  },

  setDashboards: dashboards => {
    // Calculate available tags inline to batch with dashboards update
    const tagSet = new Set();
    dashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });

    // Single batched update for dashboards and tags
    set({
      dashboards,
      availableTags: Array.from(tagSet),
    });
  },

  setCurrentDashboardName: dashboardName => {
    set({ currentDashboardName: dashboardName });
    // Reset scroll position when dashboard changes
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  },

  // Internal filtering logic
  filterDashboards: () => {
    const { dashboards, searchTerm, selectedTags, project } = get();

    if (!dashboards.length) {
      set({ filteredDashboards: [], dashboardsByLevel: [] });
      return;
    }

    const filtered = dashboards.filter(dashboard => {
      const matchesSearch =
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description &&
          dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags =
        !selectedTags ||
        selectedTags.length === 0 ||
        (dashboard.tags &&
          Array.isArray(selectedTags) &&
          selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });

    // Organize by levels
    const byLevel = organizeDashboardsByLevel(filtered, project?.project_json?.defaults);

    set({
      filteredDashboards: filtered,
      dashboardsByLevel: byLevel,
    });
  },

  updateAvailableTags: () => {
    const { dashboards } = get();
    if (!dashboards.length) {
      set({ availableTags: [] });
      return;
    }

    const tagSet = new Set();
    dashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });

    set({ availableTags: Array.from(tagSet) });
  },

  // Reset filters
  resetFilters: () => {
    set({ searchTerm: '', selectedTags: [] });
    get().filterDashboards();
  },

  // Batched initialization for dashboard view - reduces multiple set() calls to one
  initializeDashboardView: (dashboards, dashboardName, projectDefaults) => {
    if (!dashboards || !dashboards.length) {
      set({
        dashboards: [],
        availableTags: [],
        filteredDashboards: [],
        dashboardsByLevel: [],
        currentDashboardName: dashboardName,
      });
      return;
    }

    // Calculate available tags
    const tagSet = new Set();
    dashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });

    // Filter dashboards (using current search/tag state)
    const { searchTerm, selectedTags } = get();
    const filtered = dashboards.filter(dashboard => {
      const matchesSearch =
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description &&
          dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags =
        !selectedTags ||
        selectedTags.length === 0 ||
        (dashboard.tags &&
          Array.isArray(selectedTags) &&
          selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });

    // Organize by levels
    const byLevel = organizeDashboardsByLevel(filtered, projectDefaults);

    // Single batched update
    set({
      dashboards,
      availableTags: Array.from(tagSet),
      filteredDashboards: filtered,
      dashboardsByLevel: byLevel,
      currentDashboardName: dashboardName,
    });

    // Reset scroll position when dashboard changes
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  },
});

export default createProjectSlice;
