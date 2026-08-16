import { useMemo } from 'react';
import useStore, { ObjectStatus } from '../../../../stores/store';

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

// A row with unpublished changes — exactly what StatusDot paints a dot for, so
// "has a dot" and "sorts to the top" can never disagree.
const isUnpublished = row => Boolean(row.status) && row.status !== ObjectStatus.PUBLISHED;

// Unpublished first, then by name. Your own edits are the rows you came back to
// find, and in a project with 124 models they were wherever the API happened to
// return them — which is insertion order, so a rename could move a row and a
// refetch could reorder the list under you.
//
// `localeCompare` with numeric collation so model_2 precedes model_10, and base
// sensitivity so casing doesn't split otherwise-adjacent names.
const byUnpublishedThenName = (a, b) => {
  const dirtyDelta = Number(isUnpublished(b)) - Number(isUnpublished(a));
  if (dirtyDelta !== 0) return dirtyDelta;
  return String(a.name).localeCompare(String(b.name), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

// Sorting happens once here rather than in each subsection, so every type is
// ordered the same way and the row components stay presentational.
const sorted = rows => [...rows].sort(byUnpublishedThenName);


// Map a plain store collection into Library rows of a single type.
//
// Tombstones are KEPT here, and only here. A delete is a SOFT delete — the
// server marks the row "deleted" and it stays until a commit removes it from
// YAML — so until then it is a pending change, and this rail is where pending
// changes are seen and managed. It carries a red status dot and offers Restore.
//
// Every other surface drops them (see `common/softDelete`): the lineage draws
// the graph as it WILL be, so a tombstone there is just wrong. Hiding them here
// too was worse — a pending deletion you cannot see is one you cannot undo, and
// the only way back was discarding every other pending change with it.
const mapRows = (list, type) =>
  sorted(
    safeArray(list)
      .map(o => ({
        id: `${type}:${o.name}`,
        type,
        name: o.name,
        status: o.status || null,
      }))
  );

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
    const modelRows = sorted(
      safeArray(models)
          .map(m => ({
          id: `model:${m.name}`,
          type: 'model',
          canonicalType: 'model',
          name: m.name,
          subtype: 'sql_model',
          status: m.status || null,
        }))
    );

    const sourceRows = sorted(
      safeArray(sources)
          .map(s => ({
          id: `source:${s.name}`,
          type: 'source',
          name: s.name,
          subtype: s.type || null,
          status: s.status || null,
        }))
    );

    // Inputs carry `inputType` (single-select | multi-select) — the Explore
    // 2.0 Phase 3a DnD payload gap (02-architecture.md §4): a dropped input's
    // accessor (`.value` vs `.values`) depends on it.
    const inputRows = sorted(
      safeArray(inputs)
          .map(i => ({
          id: `input:${i.name}`,
          type: 'input',
          name: i.name,
          status: i.status || null,
          inputType: i.config?.type || i.type || null,
        }))
    );

    // Dimensions/metrics carry `parentModel` (the owning model's name, when
    // model-scoped) — the same Phase 3a payload gap: a dropped field's ref
    // must serialize `${ref(model).name}` (scoped) vs bare `${ref(name)}`
    // (unscoped), and only `parentModel` on the drag payload lets the drop
    // side decide which. Mirrors `useFieldParentModel.js`'s own resolution
    // (`fieldRecord.parentModel || fieldRecord.config?.model`).
    const withParentModel = (list, type) =>
      sorted(
        safeArray(list)
              .map(f => ({
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
          }))
      );

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
    dimensions,
    metrics,
    relations,
    insights,
  ]);
}

export default useLibraryData;
