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
 * Model rows carry `subtype` (which flavour of model the row is) and
 * `canonicalType` (the REAL object type, used for tab opens and edit routing).
 * Presentation keys off `type`. Both are currently always 'model' — they are
 * kept because routing by anything other than the canonical type resolves a
 * null record and drops the user into a blank create form that saves into the
 * wrong collection.
 *
 * Returns:
 *
 *   {
 *     layoutItems: {
 *       chart:    { id, type, name, status }[],
 *       table:    { id, type, name, status }[],
 *       markdown:  { id, type, name, status }[],
 *       input:     { id, type, name, status }[],
 *       dashboard: { id, type, name, status }[],
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
  const dashboards = useStore(s => s.dashboards);

  // Data-layer collections.
  const sources = useStore(s => s.sources);
  const models = useStore(s => s.models);
  const dimensions = useStore(s => s.dimensions);
  const metrics = useStore(s => s.metrics);
  const relations = useStore(s => s.relations);
  const insights = useStore(s => s.insights);

  return useMemo(() => {
    const modelRows = safeArray(models).map(m => ({
      id: `model:${m.name}`,
      type: 'model',
      canonicalType: 'model',
      name: m.name,
      subtype: 'sql_model',
      status: m.status || null,
    }));

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
        dashboard: mapRows(dashboards, 'dashboard'),
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
    dashboards,
    sources,
    models,
    dimensions,
    metrics,
    relations,
    insights,
  ]);
}

export default useLibraryData;
