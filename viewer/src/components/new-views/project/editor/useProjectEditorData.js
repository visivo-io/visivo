import { useMemo } from 'react';
import { defaultLevels } from '../../../../utils/dashboardUtils';

/**
 * useProjectEditorData — VIS-805 / Track M M-1.
 *
 * Pure transform that turns the raw dashboard list + project defaults into the
 * grouped-by-level shape the `<ProjectEditor>` renders. Lives apart from the
 * store-bound `organizeDashboardsByLevel` (used by the legacy /project list)
 * because the Project Editor needs richer per-group metadata: a stable
 * `levelKey` (the drop target id), the level title, and the original level
 * value to detect no-op drops.
 *
 * Level resolution mirrors `organizeDashboardsByLevel`:
 *   - `defaults.levels` (array of `{ title, description? }`) provides the
 *     canonical ORDER and titles.
 *   - A dashboard's `level` matches a configured level by case-insensitive
 *     title, by numeric index, or by the `L{n}` shorthand.
 *   - Dashboards with no resolvable level fall into the trailing "Unassigned"
 *     group.
 *
 * Returns an ordered array of groups:
 *   { levelKey, title, levelValue, dashboards: [{ name, level, tags, description, itemCount, updatedAt }] }
 *
 * `levelValue` is the value written back to a dashboard's `level` when a tile
 * is dropped on the group — the configured title when one exists, the numeric
 * index otherwise, and `null` for Unassigned.
 */

export const UNASSIGNED_KEY = '__unassigned__';

const normalizeLevel = (configuredLevels, level) => {
  if (level === undefined || level === null) return -1;
  if (typeof level === 'number') return level;
  if (typeof level === 'string') {
    const titleIndex = configuredLevels.findIndex(
      l => (l.title || '').toLowerCase() === level.toLowerCase()
    );
    if (titleIndex !== -1) return titleIndex;
    const numeric = Number(level);
    if (!isNaN(numeric)) return numeric;
    const lMatch = level.match(/^L(\d+)$/i);
    if (lMatch) return Number(lMatch[1]);
  }
  return -1;
};

const toTile = dashboard => ({
  name: dashboard.name,
  level: dashboard.config?.level ?? dashboard.level ?? null,
  tags: dashboard.config?.tags ?? dashboard.tags ?? [],
  description: dashboard.config?.description ?? dashboard.description ?? null,
  itemCount:
    dashboard.config?.rows?.length ??
    dashboard.itemCount ??
    null,
  updatedAt: dashboard.updated_at ?? dashboard.updatedAt ?? null,
});

export const groupDashboardsByLevel = (dashboards, defaults) => {
  const safeDashboards = Array.isArray(dashboards) ? dashboards : [];
  const configuredLevels =
    Array.isArray(defaults?.levels) && defaults.levels.length > 0
      ? defaults.levels
      : defaultLevels;

  // Bucket dashboards by resolved level index.
  const buckets = new Map(); // index -> tiles[]
  const unassigned = [];

  safeDashboards.forEach(dashboard => {
    const idx = normalizeLevel(configuredLevels, dashboard.config?.level ?? dashboard.level);
    if (idx < 0) {
      unassigned.push(toTile(dashboard));
      return;
    }
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx).push(toTile(dashboard));
  });

  // Only render configured-level groups that contain at least one dashboard,
  // plus a small "always-show" window so empty leading levels still render
  // as drop targets when adjacent levels are populated.
  const populatedIndices = new Set(buckets.keys());
  const groups = [];

  configuredLevels.forEach((lvl, idx) => {
    const tiles = buckets.get(idx) || [];
    // Show a configured level if it has dashboards, OR it precedes the last
    // populated level (so a populated L2 always shows an empty L0/L1 above it
    // as a valid drop destination).
    const maxPopulated = populatedIndices.size
      ? Math.max(...populatedIndices)
      : -1;
    if (tiles.length === 0 && idx > maxPopulated) return;
    groups.push({
      levelKey: `level:${idx}`,
      title: lvl.title || `Level ${idx + 1}`,
      levelValue: lvl.title || idx,
      dashboards: tiles.sort((a, b) => a.name.localeCompare(b.name)),
    });
  });

  // Levels assigned by index beyond the configured list still need a home.
  Array.from(populatedIndices)
    .filter(idx => idx >= configuredLevels.length)
    .sort((a, b) => a - b)
    .forEach(idx => {
      groups.push({
        levelKey: `level:${idx}`,
        title: `Level ${idx + 1}`,
        levelValue: idx,
        dashboards: (buckets.get(idx) || []).sort((a, b) => a.name.localeCompare(b.name)),
      });
    });

  if (unassigned.length > 0) {
    groups.push({
      levelKey: UNASSIGNED_KEY,
      title: 'Unassigned',
      levelValue: null,
      dashboards: unassigned.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return groups;
};

/**
 * Build the project-health summary tuple from the raw store collections.
 * Models collapse the three model stores (sql / csv-script / local-merge)
 * into the single category users think in.
 */
export const buildHealthSummary = ({
  dashboards = [],
  insights = [],
  models = [],
  csvScriptModels = [],
  localMergeModels = [],
  sources = [],
}) => ({
  dashboards: dashboards.length,
  insights: insights.length,
  models: models.length + csvScriptModels.length + localMergeModels.length,
  sources: sources.length,
});

export function useProjectEditorData() {
  return useMemo(() => ({ groupDashboardsByLevel, buildHealthSummary }), []);
}

export default useProjectEditorData;
