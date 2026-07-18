import { useMemo } from 'react';
import useStore from '../../../../stores/store';

/**
 * useLibraryData — VIS-769 / Track C C1.
 *
 * Single source of truth for what the Library renders. Pulls every object
 * collection from the zustand store and partitions them into the two
 * sections of the C-1 design:
 *
 *   - Layout Items — Charts · Tables · Markdowns · Inputs (canvas-droppable)
 *                    plus Dashboards. Dashboards aren't dropped onto a canvas;
 *                    clicking one scopes the middle pane to that dashboard
 *                    (VIS-824).
 *   - Data Layer   — click-to-edit types: Sources · Models · Dimensions ·
 *                    Metrics · Relations · Insights.
 *
 * `model` is the union of `models` (sql), `csvScriptModels` and
 * `localMergeModels` since end users think of them as a single category;
 * the `subtype` field records which underlying store the row came from and
 * `canonicalType` carries the REAL object type (`model` / `csvScriptModel` /
 * `localMergeModel`). Presentation keys off `type` ('model' — one icon, one
 * subsection), but tab opens / edit routing MUST use `canonicalType`:
 * routing a csv-script or local-merge model as a plain 'model' resolves a
 * null record in the `models` collection and drops the user into a blank
 * create-SQL-model form that saves into the wrong collection.
 *
 * Returns:
 *
 *   {
 *     layoutItems: {
 *       chart:    { id, type, name, status }[],
 *       table:    { id, type, name, status }[],
 *       markdown:  { id, type, name, status }[],
 *       input:     { id, type, name, status, inputType }[],
 *       dashboard: { id, type, name, status }[],
 *     },
 *     dataLayer: {
 *       source:    { id, type, name, status, subtype }[],
 *       model:     { id, type, name, status, subtype }[],
 *       dimension: { id, type, name, status, parentModel, expression }[],
 *       metric:    { id, type, name, status, parentModel, expression }[],
 *       relation:  { id, type, name, status }[],
 *       insight:   { id, type, name, status }[],
 *     },
 *   }
 *
 * The `status` field is passed straight through from the store record so
 * the row can render its unpublished-changes dot. `inputType` /
 * `parentModel` / `expression` are the Explore 2.0 Phase 3a drag-payload
 * extension (02-architecture.md §4's "payload gap" — `LibraryRow.jsx` reads
 * these onto its `useDraggable` data so the exploration DnD router can
 * resolve a dropped field's ref scoping and an input's `.value`/`.values`
 * accessor without a second lookup).
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
  const dashboards = useStore(s => s.dashboards);

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
        canonicalType: 'model',
        name: m.name,
        subtype: 'sql_model',
        status: m.status || null,
      })),
      ...safeArray(csvScriptModels).map(m => ({
        id: `csvScriptModel:${m.name}`,
        type: 'model',
        canonicalType: 'csvScriptModel',
        name: m.name,
        subtype: 'csv_script_model',
        status: m.status || null,
      })),
      ...safeArray(localMergeModels).map(m => ({
        id: `localMergeModel:${m.name}`,
        type: 'model',
        canonicalType: 'localMergeModel',
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

    // Inputs carry `inputType` (single-select | multi-select) — the Explore
    // 2.0 Phase 3a DnD payload gap (02-architecture.md §4): a dropped input's
    // accessor (`.value` vs `.values`) depends on it.
    const inputRows = safeArray(inputs).map(i => ({
      id: `input:${i.name}`,
      type: 'input',
      name: i.name,
      status: i.status || null,
      inputType: i.config?.type || i.type || null,
    }));

    // Dimensions/metrics carry `parentModel` (the owning model's name, when
    // model-scoped) — the same Phase 3a payload gap: a dropped field's ref
    // must serialize `${ref(model).name}` (scoped) vs bare `${ref(name)}`
    // (unscoped), and only `parentModel` on the drag payload lets the drop
    // side decide which. Mirrors `useFieldParentModel.js`'s own resolution
    // (`fieldRecord.parentModel || fieldRecord.config?.model`).
    const withParentModel = (list, type) =>
      safeArray(list).map(f => ({
        id: `${type}:${f.name}`,
        type,
        name: f.name,
        status: f.status || null,
        parentModel: f.parentModel || f.config?.model || null,
        // The field's own expression — carried so a metric/dimension dropped
        // onto the results grid's computed-column zone can be replicated as
        // a computed column bound to a DIFFERENT model (mirrors the legacy
        // `ExplorerLeftPanel.DraggableItem`'s `item.config?.expression`).
        expression: f.config?.expression || null,
      }));

    return {
      layoutItems: {
        chart: mapRows(charts, 'chart'),
        table: mapRows(tables, 'table'),
        markdown: mapRows(markdowns, 'markdown'),
        input: inputRows,
        dashboard: mapRows(dashboards, 'dashboard'),
      },
      dataLayer: {
        source: sourceRows,
        model: modelRows,
        dimension: withParentModel(dimensions, 'dimension'),
        metric: withParentModel(metrics, 'metric'),
        relation: mapRows(relations, 'relation'),
        insight: mapRows(insights, 'insight'),
      },
    };
  }, [
    charts,
    tables,
    markdowns,
    inputs,
    dashboards,
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
