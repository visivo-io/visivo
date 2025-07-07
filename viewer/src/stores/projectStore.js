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
    set({ selectedTags });
    // Trigger filtering when tags change
    get().filterDashboards();
  },

  setDashboards: dashboards => {
    set({ dashboards });
    // Update available tags
    get().updateAvailableTags();
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
        selectedTags.length === 0 ||
        (dashboard.tags && selectedTags.every(tag => dashboard.tags.includes(tag)));
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
});

export default createProjectSlice;
