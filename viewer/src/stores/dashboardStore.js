import * as dashboardsApi from '../api/dashboards';
import { recordOnboardingAction } from '../components/onboarding/onboardingState';
import { getEffectiveLevels } from '../utils/effectiveLevels';
import { insertItemAtTarget } from '../components/new-views/project/canvas/canvasReorder';

/**
 * Translate a J-1 / J-2 `slot` descriptor into the `insertItemAtTarget` target
 * descriptor against a dashboard config:
 *
 *   "new"             → a new top-level row at the end.
 *   "<rowIdx>:end"    → append to that row (or new row if the index is gone).
 *   "<rowIdx>:<i>"    → insert before item <i> in that row.
 *
 * Always falls back to a new row at the end when the descriptor can't be
 * resolved, so a placement never silently drops the chart.
 */
export const slotToInsertTarget = (config, slot) => {
  const rows = Array.isArray(config?.rows) ? config.rows : [];
  const newRow = { kind: 'between-rows', index: rows.length };
  if (!slot || slot === 'new') return newRow;
  const [rowPart, itemPart] = String(slot).split(':');
  const rowIdx = Number(rowPart);
  if (!Number.isInteger(rowIdx) || rowIdx < 0 || rowIdx >= rows.length) return newRow;
  const rowPath = `row.${rowIdx}`;
  if (itemPart === 'end' || itemPart === undefined) {
    return { kind: 'end-of-row', rowPath };
  }
  const itemIdx = Number(itemPart);
  if (!Number.isInteger(itemIdx) || itemIdx < 0) {
    return { kind: 'end-of-row', rowPath };
  }
  return { kind: 'between-items', rowPath, index: itemIdx };
};

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

  // Save dashboard to cache. Reports into the global save-activity counter
  // (H-1) so canvas actions — which call this directly, without the
  // debounced-save hook — light up the TopBar "Saving…" pill too.
  saveDashboard: async (name, config) => {
    get().beginSaveActivity?.();
    let ok = false;
    try {
      const result = await dashboardsApi.saveDashboard(name, config);
      ok = true;
      await get().fetchDashboards();
      if (get().checkPublishStatus) {
        await get().checkPublishStatus();
      }
      // Tap for the onboarding "Build a Dashboard" checklist row.
      recordOnboardingAction('dashboard_saved');
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      get().endSaveActivity?.(ok);
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

  /**
   * Place an existing chart onto a dashboard in a given slot (J-2 / VIS-778
   * round-trip, and the J-1 add-to-dashboard landing). The chart is wrapped in
   * an `Item` ({ chart: ref(...) }) and inserted at the slot via the same
   * canvas reshape helper the DnD router uses, then persisted through the draft
   * cache (`saveDashboard`).
   *
   * Returns `{ success, result|error }`.
   */
  placeChartInDashboardSlot: async (dashboardName, chartName, slot) => {
    if (!dashboardName || !chartName) {
      return { success: false, error: 'dashboard and chart names are required' };
    }
    const dashboard = (get().dashboards || []).find(d => d.name === dashboardName);
    if (!dashboard) {
      return { success: false, error: `Dashboard "${dashboardName}" not found` };
    }
    const config = dashboard.config || {};
    const baseConfig = { ...config, rows: Array.isArray(config.rows) ? config.rows : [] };
    const target = slotToInsertTarget(baseConfig, slot);
    const newItem = { width: 1, chart: `ref(${chartName})` };
    const nextConfig = insertItemAtTarget(baseConfig, target, newItem);
    if (nextConfig === baseConfig) {
      return { success: false, error: 'Could not place the chart in the requested slot' };
    }
    return get().saveDashboard(dashboardName, nextConfig);
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
  _resolveLevels: () => getEffectiveLevels(get().defaults),

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
   * Update the level at `index` with a partial `{ title?, description? }` patch
   * in one persist (VIS-807 / M-2b — the right-rail LevelEditForm edits title +
   * description together). A blank title is rejected (the backend `Level` model
   * requires a non-empty title). When the title changes, dashboards that
   * referenced the level by its old title are re-pointed so they stay in the
   * group — same behaviour as `renameLevel`. Returns `{ success: false,
   * error: 'unchanged' }` when neither field actually changes.
   */
  updateLevel: async (index, patch = {}) => {
    const levels = get()._resolveLevels();
    if (index < 0 || index >= levels.length) {
      return { success: false, error: 'level index out of range' };
    }
    const current = levels[index];
    const previousTitle = current.title;
    const nextTitle =
      patch.title === undefined ? current.title : (patch.title ?? '').trim();
    if (!nextTitle) {
      return { success: false, error: 'title required' };
    }
    const nextDescription =
      patch.description === undefined ? current.description : patch.description;

    const titleChanged = nextTitle !== previousTitle;
    const descriptionChanged = (nextDescription ?? '') !== (current.description ?? '');
    if (!titleChanged && !descriptionChanged) {
      return { success: false, error: 'unchanged' };
    }

    const nextLevels = levels.map((l, i) =>
      i === index ? { ...l, title: nextTitle, description: nextDescription } : l
    );
    const result = await get()._persistLevels(nextLevels);

    if (result?.success && titleChanged && previousTitle) {
      const dashboards = get().dashboards || [];
      const affected = dashboards.filter(
        d =>
          typeof d.config?.level === 'string' &&
          d.config.level.toLowerCase() === previousTitle.toLowerCase()
      );
      for (const dashboard of affected) {
        await get().saveDashboard(dashboard.name, {
          ...(dashboard.config || {}),
          level: nextTitle,
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
   * Move the level from `fromIndex` to `toIndex` (VIS-901 #5 — canvas level
   * reorder via DnD). Unlike `reorderLevel` (single-step arrow), this moves a
   * level to an arbitrary slot, matching a drag-and-drop gesture. Persists
   * through the same `_persistLevels` path. No-op for out-of-range / unchanged.
   */
  moveLevel: async (fromIndex, toIndex) => {
    const levels = get()._resolveLevels();
    if (
      fromIndex < 0 ||
      fromIndex >= levels.length ||
      toIndex < 0 ||
      toIndex >= levels.length ||
      fromIndex === toIndex
    ) {
      return { success: false, error: 'move out of range or unchanged' };
    }
    const nextLevels = [...levels];
    const [moved] = nextLevels.splice(fromIndex, 1);
    nextLevels.splice(toIndex, 0, moved);
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
