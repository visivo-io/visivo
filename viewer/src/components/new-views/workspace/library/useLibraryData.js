import { useMemo } from 'react';
import useStore from '../../../../stores/store';

/**
 * useLibraryData — VIS-769 / Track C C1.
 *
 * Single source of truth for what the Library renders. Pulls every object
 * collection from the zustand store and partitions them into the two
 * sections of the C-1 design:
 *
 *   - Layout Items — canvas-droppable types: Charts · Tables · Markdowns ·
 *                    Inputs.
 *   - Data Layer   — click-to-edit types: Sources · Models · Dimensions ·
 *                    Metrics · Relations · Insights.
 *
 * `model` is the union of `models` (sql), `csvScriptModels` and
 * `localMergeModels` since end users think of them as a single category;
 * the `subtype` field records which underlying store the row came from.
 *
 * Returns:
 *
 *   {
 *     layoutItems: {
 *       chart:    { id, type, name, status }[],
 *       table:    { id, type, name, status }[],
 *       markdown: { id, type, name, status }[],
 *       input:    { id, type, name, status }[],
 *     },
 *     dataLayer: {
 *       source:    { id, type, name, status, subtype }[],
 *       model:     { id, type, name, status, subtype }[],
 *       dimension: { id, type, name, status }[],
 *       metric:    { id, type, name, status }[],
 *       relation:  { id, type, name, status }[],
 *       insight:   { id, type, name, status }[],
 *     },
 *   }
 *
 * The `status` field is passed straight through from the store record so
 * the row can render its unpublished-changes dot.
 */
const safeArray = v => (Array.isArray(v) ? v : []);

// Map a plain store collection into Library rows of a single type.
const mapRows = (list, type) =>
  safeArray(list).map(o => ({
    id: `${type}:${o.name}`,
    type,
    name: o.name,
    status: o.status || null,
  }));

export function useLibraryData() {
  // Layout-item collections.
  const charts = useStore(s => s.charts);
  const tables = useStore(s => s.tables);
  const markdowns = useStore(s => s.markdowns);
  const inputs = useStore(s => s.inputs);

  // Data-layer collections.
  const sources = useStore(s => s.sources);
  const models = useStore(s => s.models);
  const csvScriptModels = useStore(s => s.csvScriptModels);
  const localMergeModels = useStore(s => s.localMergeModels);
  const dimensions = useStore(s => s.dimensions);
  const metrics = useStore(s => s.metrics);
  const relations = useStore(s => s.relations);
  const insights = useStore(s => s.insights);

  return useMemo(() => {
    // Models are the union of the three model stores; preserve a `subtype`
    // so callers can tell sql / csv-script / local-merge apart.
    const modelRows = [
      ...safeArray(models).map(m => ({
        id: `model:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'sql_model',
        status: m.status || null,
      })),
      ...safeArray(csvScriptModels).map(m => ({
        id: `csvScriptModel:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'csv_script_model',
        status: m.status || null,
      })),
      ...safeArray(localMergeModels).map(m => ({
        id: `localMergeModel:${m.name}`,
        type: 'model',
        name: m.name,
        subtype: 'local_merge_model',
        status: m.status || null,
      })),
    ];

    const sourceRows = safeArray(sources).map(s => ({
      id: `source:${s.name}`,
      type: 'source',
      name: s.name,
      subtype: s.type || null,
      status: s.status || null,
    }));

    return {
      layoutItems: {
        chart: mapRows(charts, 'chart'),
        table: mapRows(tables, 'table'),
        markdown: mapRows(markdowns, 'markdown'),
        input: mapRows(inputs, 'input'),
      },
      dataLayer: {
        source: sourceRows,
        model: modelRows,
        dimension: mapRows(dimensions, 'dimension'),
        metric: mapRows(metrics, 'metric'),
        relation: mapRows(relations, 'relation'),
        insight: mapRows(insights, 'insight'),
      },
    };
  }, [
    charts,
    tables,
    markdowns,
    inputs,
    sources,
    models,
    csvScriptModels,
    localMergeModels,
    dimensions,
    metrics,
    relations,
    insights,
  ]);
}

export default useLibraryData;
