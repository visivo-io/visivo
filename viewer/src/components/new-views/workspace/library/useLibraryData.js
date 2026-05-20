import { useMemo } from 'react';
import useStore from '../../../../stores/store';

/**
 * useLibraryData — VIS-769 / Track C C1.
 *
 * Single source of truth for what the Library renders. Pulls each
 * sub-collection from the zustand store and partitions them into the five
 * sections delivered by the B-1 design revision (Insert · Charts · Insights ·
 * Models · Sources). Models is the union of `sql_model`, `csv_script_model`
 * and `local_merge_model` since end users think of them as a single category.
 *
 * `Insert` is a static catalogue of layout primitives (Dashboard · Row · Item
 * · Markdown) — these are drag-source-only objects that don't live in the
 * project YAML; the canvas creates new instances on drop.
 *
 * Returns:
 *
 *   {
 *     insert:   { id, type, name, label, subtype }[]
 *     charts:   { id, type, name, status }[]
 *     insights: { id, type, name, status }[]
 *     models:   { id, type, name, status, subtype }[]
 *     sources:  { id, type, name, status, subtype }[]
 *   }
 */

// Stable, lexicographic-friendly id for built-in Insert primitives so React
// keys stay stable across renders.
const INSERT_PRIMITIVES = Object.freeze([
  {
    id: 'insert:dashboard',
    type: 'insert',
    subtype: 'dashboard',
    name: 'Dashboard',
    label: 'Dashboard',
  },
  { id: 'insert:row', type: 'insert', subtype: 'row', name: 'Row', label: 'Row' },
  { id: 'insert:item', type: 'insert', subtype: 'item', name: 'Item', label: 'Item' },
  {
    id: 'insert:markdown',
    type: 'insert',
    subtype: 'markdown',
    name: 'Markdown',
    label: 'Markdown',
  },
]);

const safeArray = (v) => (Array.isArray(v) ? v : []);

export function useLibraryData() {
  const charts = useStore((s) => s.charts);
  const insights = useStore((s) => s.insights);
  const models = useStore((s) => s.models);
  const csvScriptModels = useStore((s) => s.csvScriptModels);
  const localMergeModels = useStore((s) => s.localMergeModels);
  const sources = useStore((s) => s.sources);

  return useMemo(() => {
    const chartsRows = safeArray(charts).map((c) => ({
      id: `chart:${c.name}`,
      type: 'chart',
      name: c.name,
      status: c.status || null,
    }));

    const insightsRows = safeArray(insights).map((i) => ({
      id: `insight:${i.name}`,
      type: 'insight',
      name: i.name,
      status: i.status || null,
    }));

    const modelsRows = [
      ...safeArray(models).map((m) => ({
        id: `model:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'sql_model',
        status: m.status || null,
      })),
      ...safeArray(csvScriptModels).map((m) => ({
        id: `csvScriptModel:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'csv_script_model',
        status: m.status || null,
      })),
      ...safeArray(localMergeModels).map((m) => ({
        id: `localMergeModel:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'local_merge_model',
        status: m.status || null,
      })),
    ];

    const sourcesRows = safeArray(sources).map((s) => ({
      id: `source:${s.name}`,
      type: 'source',
      name: s.name,
      subtype: s.type || null,
      status: s.status || null,
    }));

    return {
      insert: INSERT_PRIMITIVES.slice(),
      charts: chartsRows,
      insights: insightsRows,
      models: modelsRows,
      sources: sourcesRows,
    };
  }, [charts, insights, models, csvScriptModels, localMergeModels, sources]);
}

export { INSERT_PRIMITIVES };
export default useLibraryData;
