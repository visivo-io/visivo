import { useMemo } from 'react';
import useStore from '../../../../stores/store';
import { ERD_NODE_WIDTH, estimateErdNodeHeight } from './erdGeometry';
import { runLayout, packBoxes } from './layoutEngine';

/**
 * useRelationErdDag — the ERD twin of useLineageDag (VIS-1006).
 *
 * Builds the React-Flow graph for the Relations ERD builder:
 *   - one `erdModelNode` per (in-scope) project model, carrying the model's
 *     column list so each column can render its own connection handle;
 *   - one `relationNode` per existing relation (a styled pill that is itself a
 *     first-class, draggable node), parsed from the relation's `condition`
 *     (`${ref(A).colA} <op> ${ref(B).colB}`) into A.colA ↔ B.colB;
 *   - TWO `relationLinkEdge` edges per relation, running modelA → relationNode →
 *     modelB. They are built DIRECTIONALLY (so dagre ranks `A → rel → B`
 *     horizontally) but rendered UNDIRECTED (no arrowheads) — the join is
 *     two-way, so a directional table→table arrow would be semantically wrong.
 *     Each edge's MODEL end is wired to the per-column handle (`sourceHandle` /
 *     `targetHandle`) so the line lands on the exact column row.
 *
 * The relation node replaces the old single model→model `relationEdge` + its
 * pill label. Parallel relations between the same two models are now distinct
 * relation NODES (naturally separated by the layout), so the parallel-index /
 * perpendicular-offset machinery is gone, and the pill is no longer a draggable
 * edge waypoint — the relation node itself is the draggable lever and its
 * position persists like any model node.
 *
 * Reuses computeLayout (dagre LR, via runLayout) for positions.
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
const ERD_REL_NODE_ID = name => `erd-relnode-${name}`;
const ERD_REL_EDGE_A_ID = name => `erd-reledge-${name}-a`;
const ERD_REL_EDGE_B_ID = name => `erd-reledge-${name}-b`;

// ERD model-card geometry lives in erdGeometry.js — the single source of truth
// shared by the card renderer, the layout engine, and the edge router. Re-export
// `estimateErdNodeHeight` so existing importers (and tests) keep working.
export { estimateErdNodeHeight };

/**
 * Pack model cards into a tiled (masonry) grid — a thin wrapper over the layout
 * engine's `packBoxes`. The Semantic Layer overview is mostly disconnected
 * models, so a left-to-right dagre layout stacks them all in one tall rank; a
 * shortest-column grid tiles them compactly. When every card is a singleton (no
 * relations), `packBoxes` output is IDENTICAL to the historic implementation,
 * so existing callers/tests are unaffected. Retained so direct importers keep
 * working; the hook itself now lays out via `runLayout`.
 */
export const packGridLayout = nodes => {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const boxes = nodes.map(node => ({
    id: node.id,
    width: node.layoutSize?.width ?? ERD_NODE_WIDTH,
    height: node.layoutSize?.height ?? 80,
  }));
  const origins = packBoxes(boxes);
  return nodes.map(node => ({ ...node, position: origins[node.id] || { x: 0, y: 0 } }));
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
    // Session-persisted (per-scope) node positions from workspaceErdLayoutStore
    // (§6). Relation nodes are just nodes, so their dragged positions overlay
    // here too.
    savedPositions = {},
    // Bumped by Tidy / clearErdLayout — a memo dep so a reset forces a full
    // auto-layout (version-bump-as-dep beats imperative clear-then-rerun).
    layoutVersion = 0,
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
  // Stable key for the saved positions so the memo recomputes when a user moves a
  // card or relation node (without churning on fresh object identity each render).
  const savedPosKey = Object.keys(savedPositions || {})
    .sort()
    .map(id => `${id}:${savedPositions[id]?.x},${savedPositions[id]?.y}`)
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

    const modelNodes = visibleModels.map(model => {
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

    const relationNodes = [];
    const edges = [];
    relationList.forEach(relation => {
      const condition = relation.condition || relation.config?.condition;
      const parsed = parseRelationCondition(condition);
      if (!parsed) return;
      // Only render a relation whose BOTH endpoints are models we drew.
      if (!modelNames.has(parsed.a.model) || !modelNames.has(parsed.b.model)) return;

      const joinType = relation.join_type || relation.config?.join_type || 'inner';
      const isDefault = Boolean(relation.is_default ?? relation.config?.is_default);
      const relNodeId = ERD_REL_NODE_ID(relation.name);

      // The relation is its own node — a styled pill placed BETWEEN its models.
      relationNodes.push({
        id: relNodeId,
        type: 'relationNode',
        position: { x: 0, y: 0 },
        // A small pill; width scales with the name so dagre/the packer give it
        // enough room between the two model cards.
        layoutSize: { width: Math.max(120, relation.name.length * 7 + 56), height: 40 },
        data: {
          relationName: relation.name,
          joinType,
          isDefault,
          condition,
          modelA: parsed.a.model,
          columnA: parsed.a.column,
          modelB: parsed.b.model,
          columnB: parsed.b.column,
        },
      });

      const handleA = resolveHandle(parsed.a.model, parsed.a.column);
      const handleB = resolveHandle(parsed.b.model, parsed.b.column);

      // Edge A: modelA → relationNode. Directional so dagre ranks A left of the
      // pill; rendered undirected (the link edge draws no arrowhead). The MODEL
      // end (source) is wired to A's column handle.
      edges.push({
        id: ERD_REL_EDGE_A_ID(relation.name),
        type: 'relationLinkEdge',
        source: ERD_NODE_ID(parsed.a.model),
        ...(handleA ? { sourceHandle: handleA } : {}),
        target: relNodeId,
        data: {
          relationName: relation.name,
          modelEnd: 'source',
          column: parsed.a.column,
          // The model card's full column list so the edge anchors on the exact
          // column ROW (columnAnchor) under any zoom.
          columns: columnsByNodeModel.get(parsed.a.model) || [],
        },
      });

      // Edge B: relationNode → modelB. The MODEL end is the TARGET here, wired to
      // B's column handle.
      edges.push({
        id: ERD_REL_EDGE_B_ID(relation.name),
        type: 'relationLinkEdge',
        source: relNodeId,
        target: ERD_NODE_ID(parsed.b.model),
        ...(handleB ? { targetHandle: handleB } : {}),
        data: {
          relationName: relation.name,
          modelEnd: 'target',
          column: parsed.b.column,
          columns: columnsByNodeModel.get(parsed.b.model) || [],
        },
      });
    });

    // The relation nodes go into the SAME nodes array as the model nodes, so the
    // clustering + dagre layout places them between their models (the `A → rel →
    // B` edge chain ranks them horizontally). connectedComponents groups
    // modelA + relNode + modelB into one component (a relation node always has 2
    // edges → never a degenerate singleton).
    const nodes = [...modelNodes, ...relationNodes];

    // Seed positions via the pluggable layout machine (Union-Find clustering →
    // per-cluster dagre → masonry pack). Connected models + relation nodes form a
    // dagre cluster; disconnected models pack as singletons. The drag system calls
    // runLayout too — this is the only seam.
    const { nodes: seededNodes } = runLayout({
      nodes,
      edges,
      options: { layout, direction: 'LR' },
    });

    // Overlay session-saved positions onto the seed: a moved card/relation node
    // keeps its saved x/y, only un-saved nodes consume seed slots. So adding a
    // model drops it into the next open slot WITHOUT reshuffling moved nodes
    // (§3 / §6). Tidy clears saves → a full auto-layout runs (zero overlays).
    const overlaidNodes = seededNodes.map(node => {
      const saved = savedPositions?.[node.id];
      return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? { ...node, position: { x: saved.x, y: saved.y } }
        : node;
    });

    return { nodes: overlaidNodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    models,
    relations,
    scopeKey,
    extraKey,
    columnsByModel,
    fieldsByModel,
    fieldsKey,
    layout,
    savedPosKey,
    layoutVersion,
  ]);
}

export { ERD_NODE_ID, ERD_REL_NODE_ID, ERD_REL_EDGE_A_ID, ERD_REL_EDGE_B_ID };
export default useRelationErdDag;
