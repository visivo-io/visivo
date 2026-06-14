import { useMemo } from 'react';
import useStore from '../../../../stores/store';
import { computeLayout } from '../../lineage/useLineageDag';
import {
  ERD_NODE_WIDTH,
  ERD_GRID_GAP_X,
  ERD_GRID_GAP_Y,
  estimateErdNodeHeight,
} from './erdGeometry';

/**
 * useRelationErdDag — the ERD twin of useLineageDag (VIS-1006).
 *
 * Builds the React-Flow graph for the Relations ERD builder:
 *   - one `erdModelNode` per (in-scope) project model, carrying the model's
 *     column list so each column can render its own connection handle;
 *   - one edge per existing relation, parsed from the relation's `condition`
 *     (`${ref(A).colA} <op> ${ref(B).colB}`) into A.colA ↔ B.colB, wired to the
 *     per-column handles (`sourceHandle` / `targetHandle`) so the edge lands on
 *     the exact column rows.
 *
 * Reuses computeLayout (dagre LR) from the lineage harness for positions.
 *
 * ### Scoping (VIS-1006b)
 * By default the graph shows EVERY project model. When `scopeModelNames` is
 * supplied (e.g. a single relation's two joined models), the graph renders ONLY
 * those models plus any `extraModelNames` the user has added to the canvas. This
 * keeps a relation's ERD focused on its own models while still letting the user
 * bring more models in to author new relations.
 *
 * ### Column hydration (VIS-1006a)
 * Columns come from the model record when present (`columns` / `config.columns`),
 * but the workspace store rarely populates those. `columnsByModel` (from
 * useModelColumns, which reads each model's cached run data) fills the gap so the
 * cards list real columns instead of "No columns loaded".
 *
 * @param {object} [options]
 * @param {string[]|null} [options.scopeModelNames] only render these models when
 *   provided; null/undefined → render all project models.
 * @param {string[]} [options.extraModelNames] additional models to include on top
 *   of the scoped set (models the user dragged / @-mentioned onto the canvas).
 * @param {Record<string,string[]>} [options.columnsByModel] hydrated columns by
 *   model name; merged in when the model record itself has none.
 */

const ERD_NODE_ID = name => `erd-model-${name}`;
const ERD_EDGE_ID = relationName => `erd-rel-${relationName}`;

// ERD model-card geometry lives in erdGeometry.js — the single source of truth
// shared by the card renderer, the layout engine, and the edge router. Re-export
// `estimateErdNodeHeight` so existing importers (and tests) keep working.
export { estimateErdNodeHeight };

/**
 * Pack model cards into a tiled (masonry) grid instead of dagre rows. The
 * Semantic Layer overview is mostly disconnected models, so a left-to-right
 * dagre layout stacks them all in one tall rank; a shortest-column grid tiles
 * them compactly. Each card drops into whichever column is currently shortest
 * (using its measured `layoutSize.height`), so variable-height cards pack tight
 * without overlap. The column count is biased WIDER than square so the grid
 * fills the wide canvas (a near-square strip wastes horizontal space and makes
 * fitView zoom the cards down to unreadable) — capped at the node count.
 */
export const packGridLayout = nodes => {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const columns = Math.min(
    nodes.length,
    Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.6)))
  );
  const colHeights = new Array(columns).fill(0);
  return nodes.map(node => {
    let col = 0;
    for (let i = 1; i < columns; i += 1) {
      if (colHeights[i] < colHeights[col]) col = i;
    }
    const x = col * (ERD_NODE_WIDTH + ERD_GRID_GAP_X);
    const y = colHeights[col];
    colHeights[col] += (node.layoutSize?.height ?? 80) + ERD_GRID_GAP_Y;
    return { ...node, position: { x, y } };
  });
};

/**
 * Pull the column list off a model record, tolerating the several shapes the
 * store can hold (top-level `columns`, nested `config.columns`, or none).
 */
export const modelColumns = model => {
  if (!model) return [];
  const cols = model.columns || model.config?.columns || [];
  if (!Array.isArray(cols)) return [];
  // Columns may be plain strings or { name, type } objects — normalise to names.
  return cols
    .map(c => (typeof c === 'string' ? c : c?.name))
    .filter(name => typeof name === 'string' && name.length > 0);
};

// Matches a single `${ref(model).column}` operand, capturing model + column.
// This parses Visivo ref TEMPLATE strings (not SQL), so a regex is correct here.
const REF_OPERAND = /\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\.\s*([^}\s]+?)\s*\}/g;

/**
 * Parse a relation condition into its two (model, column) endpoints.
 * Returns null when the condition doesn't contain exactly two ref operands.
 */
export const parseRelationCondition = condition => {
  if (!condition || typeof condition !== 'string') return null;
  const operands = [];
  let match;
  REF_OPERAND.lastIndex = 0;
  while ((match = REF_OPERAND.exec(condition)) !== null) {
    operands.push({ model: match[1].trim(), column: match[2].trim() });
  }
  if (operands.length !== 2) return null;
  return { a: operands[0], b: operands[1] };
};

/**
 * Extract the model names referenced by a relation's condition. Reuses
 * parseRelationCondition so the two-ref-operand contract stays in one place.
 * Returns [] when the condition isn't a clean two-model join.
 */
export const relationModelNames = relation => {
  const condition = relation?.condition || relation?.config?.condition;
  const parsed = parseRelationCondition(condition);
  if (!parsed) return [];
  return [parsed.a.model, parsed.b.model];
};

export function useRelationErdDag(options = {}) {
  const {
    scopeModelNames = null,
    extraModelNames = [],
    columnsByModel = {},
    fieldsByModel = {},
    layout = 'dagre',
  } = options;
  const models = useStore(state => state.models);
  const relations = useStore(state => state.relations);

  // Stable scope keys so the memo doesn't churn on fresh array identities.
  const scopeKey = Array.isArray(scopeModelNames)
    ? [...scopeModelNames].sort().join('|')
    : '__all__';
  const extraKey = Array.isArray(extraModelNames) ? [...extraModelNames].sort().join('|') : '';
  // Field counts feed each card's estimated height (and thus the layout), so the
  // memo must recompute when a model's metric/dimension set changes.
  const fieldsKey = Object.keys(fieldsByModel)
    .sort()
    .map(
      name =>
        `${name}:${(fieldsByModel[name]?.metrics || []).length},${(fieldsByModel[name]?.dimensions || []).length}`
    )
    .join('|');

  return useMemo(() => {
    const modelList = Array.isArray(models) ? models : [];
    const relationList = Array.isArray(relations) ? relations : [];

    // Resolve the in-scope model set. null scope → all models; otherwise the
    // scoped names plus any extra models the user added to the canvas.
    let visibleModels = modelList;
    if (Array.isArray(scopeModelNames)) {
      const allowed = new Set([...scopeModelNames, ...extraModelNames].filter(Boolean));
      visibleModels = modelList.filter(m => allowed.has(m.name));
    }

    const modelNames = new Set(visibleModels.map(m => m.name));

    // Resolved column list per model — used both to render each card's handles
    // and to map a relation's condition column onto the EXACT handle id (the
    // `<Handle id={column}>` value). Without this, a casing difference between
    // the condition (`.x`) and the hydrated column (`X`, DuckDB upper-cases
    // unquoted identifiers) leaves the edge pointing at a non-existent handle,
    // and React-Flow silently drops it.
    const columnsForModel = model => {
      const recordCols = modelColumns(model);
      const hydrated = Array.isArray(columnsByModel[model.name]) ? columnsByModel[model.name] : [];
      return recordCols.length > 0 ? recordCols : hydrated;
    };
    const columnsByNodeModel = new Map(
      visibleModels.map(model => [model.name, columnsForModel(model)])
    );

    const nodes = visibleModels.map(model => {
      const columns = columnsByNodeModel.get(model.name) || [];
      // Fold in the model's metrics + dimensions when provided (the Semantic
      // Layer ERD); the scoped Relation ERD passes none, so these stay empty.
      const fields = fieldsByModel[model.name] || { metrics: [], dimensions: [] };
      const metrics = fields.metrics || [];
      const dimensions = fields.dimensions || [];
      return {
        id: ERD_NODE_ID(model.name),
        type: 'erdModelNode',
        position: { x: 0, y: 0 },
        // Measured card size so dagre spaces tall cards (many columns + pills)
        // without overlap — honoured by computeLayout via `layoutSize`.
        layoutSize: {
          width: ERD_NODE_WIDTH,
          height: estimateErdNodeHeight({ columns, metrics, dimensions }),
        },
        data: {
          name: model.name,
          objectType: 'model',
          columns,
          metrics,
          dimensions,
          model,
        },
      };
    });

    // Resolve a relation's condition column to the matching card handle id:
    // exact match first, then case-insensitive (DuckDB casing). Returns null
    // when the column isn't on the card, so the edge falls back to a node-level
    // connection (it still renders the relationship rather than vanishing).
    const resolveHandle = (modelName, column) => {
      const cols = columnsByNodeModel.get(modelName) || [];
      if (cols.includes(column)) return column;
      const ci = cols.find(c => c.toLowerCase() === String(column).toLowerCase());
      return ci || null;
    };

    const edges = [];
    relationList.forEach(relation => {
      const condition = relation.condition || relation.config?.condition;
      const parsed = parseRelationCondition(condition);
      if (!parsed) return;
      // Only wire edges whose endpoints are models we actually rendered.
      if (!modelNames.has(parsed.a.model) || !modelNames.has(parsed.b.model)) return;
      const sourceHandle = resolveHandle(parsed.a.model, parsed.a.column);
      const targetHandle = resolveHandle(parsed.b.model, parsed.b.column);
      edges.push({
        id: ERD_EDGE_ID(relation.name),
        source: ERD_NODE_ID(parsed.a.model),
        // Omit the handle entirely (rather than passing a non-existent one) when
        // the column can't be resolved, so React-Flow connects at the node.
        ...(sourceHandle ? { sourceHandle } : {}),
        target: ERD_NODE_ID(parsed.b.model),
        ...(targetHandle ? { targetHandle } : {}),
        animated: true,
        data: {
          relationName: relation.name,
          joinType: relation.join_type || relation.config?.join_type || 'inner',
          isDefault: Boolean(relation.is_default ?? relation.config?.is_default),
          condition,
        },
      });
    });

    let layoutNodes = nodes;
    if (layout === 'grid') {
      // Tiled grid (Semantic Layer overview) — pack disconnected models compactly
      // instead of a tall dagre rank.
      layoutNodes = packGridLayout(nodes);
    } else {
      try {
        layoutNodes = computeLayout(nodes, edges);
      } catch {
        // computeLayout needs dagre; if it throws (e.g. unmocked in a bare test)
        // keep zeroed positions so the graph still renders.
        layoutNodes = nodes;
      }
    }

    return { nodes: layoutNodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, relations, scopeKey, extraKey, columnsByModel, fieldsByModel, fieldsKey, layout]);
}

export { ERD_NODE_ID, ERD_EDGE_ID };
export default useRelationErdDag;
