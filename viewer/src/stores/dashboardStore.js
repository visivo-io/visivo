import * as dashboardsApi from '../api/dashboards';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';
import { defaultLevels } from '../utils/dashboardUtils';

/**
 * Dashboard Store Slice
 *
 * Manages Dashboard configurations independently.
 */
const createDashboardSlice = (set, get) => ({
  // State
  dashboards: [],
  dashboardsLoading: false,
  dashboardsError: null,

  // Fetch all dashboards from API
  fetchDashboards: async () => {
    set({ dashboardsLoading: true, dashboardsError: null });
    try {
      const projectId = get().project?.id;
      const data = await dashboardsApi.fetchAllDashboards(projectId);
      set({ dashboards: data.dashboards || [], dashboardsLoading: false });
    } catch (error) {
      console.error('dashboardStore: fetch error', error);
      set({ dashboardsError: error.message, dashboardsLoading: false });
    }
  },

  // Save dashboard to cache
  saveDashboard: async (name, config) => {
    try {
      const result = await dashboardsApi.saveDashboard(name, config);
      await get().fetchDashboards();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      // Tap for the onboarding "Build a Dashboard" checklist row.
      recordOnboardingAction('dashboard_saved');
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Reassign a dashboard to a different level (draft edit).
   *
   * The Project Editor's drag-between-levels gesture calls this. It persists
   * the change through the same draft cache path as `saveDashboard` — the
   * dashboard's stored config gets its `level` field updated (or removed for
   * the Unassigned group, signalled by a `null` / `undefined` level) — so the
   * publish flow picks it up like any other unpublished edit.
   *
   * Returns `{ success, result|error }`. No-op (success: false) when the
   * dashboard isn't found or already sits in the target level.
   */
  reassignDashboardLevel: async (name, level) => {
    const dashboards = get().dashboards || [];
    const dashboard = dashboards.find(d => d.name === name);
    if (!dashboard) {
      return { success: false, error: `Dashboard "${name}" not found` };
    }
    const currentLevel = dashboard.config?.level ?? null;
    const nextLevel = level ?? null;
    if (currentLevel === nextLevel) {
      return { success: false, error: 'unchanged' };
    }
    const nextConfig = { ...(dashboard.config || {}) };
    if (nextLevel === null) {
      delete nextConfig.level;
    } else {
      nextConfig.level = nextLevel;
    }
    return get().saveDashboard(name, nextConfig);
  },

  // Mark dashboard for deletion
  deleteDashboard: async name => {
    try {
      await dashboardsApi.deleteDashboard(name);
      await get().fetchDashboards();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Level-CRUD actions (VIS-807 / Track M M-2a).
   *
   * Levels live on `defaults.levels` (an ordered array of `{ title, description? }`).
   * These actions mutate that array and persist through the SAME draft/save path
   * as every other defaults edit (`saveDefaults` → defaults cache → publish flow),
   * so the Project Editor's inline affordances round-trip like any unpublished
   * change. The current `defaults.levels` is the canonical order; when it is
   * empty/absent we seed from the shared `defaultLevels` fallback so the first
   * edit produces a concrete, persistable list.
   */
  /**
   * The concrete, editable level list. When `defaults.levels` is empty/absent
   * the Project Editor still renders groups derived from the shared
   * `defaultLevels` fallback (by index). So that the inline rename / reorder /
   * delete affordances act on exactly the levels the user sees, we seed from
   * that same fallback here — the first edit persists a concrete list.
   */
  _resolveLevels: () => {
    const configured = get().defaults?.levels;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.map(l => ({ ...l }));
    }
    return defaultLevels.map(l => ({ ...l }));
  },

  _persistLevels: async nextLevels => {
    const saveDefaults = get().saveDefaults;
    if (!saveDefaults) {
      return { success: false, error: 'saveDefaults unavailable' };
    }
    const currentDefaults = get().defaults || {};
    return saveDefaults({ ...currentDefaults, levels: nextLevels });
  },

  /**
   * Append a new level to the end of the (resolved) level list. When no levels
   * are configured yet `_resolveLevels` seeds from the `defaultLevels` fallback
   * so the ordering the editor shows becomes a concrete, saveable array.
   *
   * A `description` is always supplied because the backend `Level` model
   * requires both `title` and `description` (a missing description is rejected
   * with a 400).
   */
  createLevel: async (title = 'New level') => {
    const nextLevels = [
      ...get()._resolveLevels(),
      { title, description: '' },
    ];
    return get()._persistLevels(nextLevels);
  },

  /**
   * Rename the level at `index`. Dashboards that reference the level by its old
   * title are re-pointed to the new title so they don't fall out of the group.
   */
  renameLevel: async (index, nextTitle) => {
    const levels = get()._resolveLevels();
    if (index < 0 || index >= levels.length) {
      return { success: false, error: 'level index out of range' };
    }
    const trimmed = (nextTitle ?? '').trim();
    if (!trimmed) {
      return { success: false, error: 'title required' };
    }
    const previousTitle = levels[index].title;
    if (previousTitle === trimmed) {
      return { success: false, error: 'unchanged' };
    }
    const nextLevels = levels.map((l, i) => (i === index ? { ...l, title: trimmed } : l));
    const result = await get()._persistLevels(nextLevels);

    // Re-point dashboards that referenced the renamed level by its old title so
    // they stay in the group rather than dropping to Unassigned.
    if (result?.success && previousTitle) {
      const dashboards = get().dashboards || [];
      const affected = dashboards.filter(
        d =>
          typeof d.config?.level === 'string' &&
          d.config.level.toLowerCase() === previousTitle.toLowerCase()
      );
      for (const dashboard of affected) {
        await get().saveDashboard(dashboard.name, {
          ...(dashboard.config || {}),
          level: trimmed,
        });
      }
    }
    return result;
  },

  /**
   * Move the level at `index` by `direction` (-1 up, +1 down). No-op at the ends.
   */
  reorderLevel: async (index, direction) => {
    const levels = get()._resolveLevels();
    const target = index + direction;
    if (index < 0 || index >= levels.length || target < 0 || target >= levels.length) {
      return { success: false, error: 'reorder out of range' };
    }
    const nextLevels = [...levels];
    const [moved] = nextLevels.splice(index, 1);
    nextLevels.splice(target, 0, moved);
    return get()._persistLevels(nextLevels);
  },

  /**
   * Delete the level at `index`. Dashboards assigned to that level (by title)
   * fall to the Unassigned bucket — their `level` key is removed via
   * `reassignDashboardLevel(name, null)`.
   */
  deleteLevel: async index => {
    const levels = get()._resolveLevels();
    if (index < 0 || index >= levels.length) {
      return { success: false, error: 'level index out of range' };
    }
    const removedTitle = levels[index].title;
    const nextLevels = levels.filter((_, i) => i !== index);
    const result = await get()._persistLevels(nextLevels);

    if (result?.success && removedTitle) {
      const dashboards = get().dashboards || [];
      const orphaned = dashboards.filter(
        d =>
          typeof d.config?.level === 'string' &&
          d.config.level.toLowerCase() === removedTitle.toLowerCase()
      );
      for (const dashboard of orphaned) {
        await get().reassignDashboardLevel(dashboard.name, null);
      }
    }
    return result;
  },
});

export default createDashboardSlice;
