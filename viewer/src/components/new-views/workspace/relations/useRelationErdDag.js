import { useMemo } from 'react';
import useStore from '../../../../stores/store';
import { computeLayout } from '../../lineage/useLineageDag';

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
  const { scopeModelNames = null, extraModelNames = [], columnsByModel = {} } = options;
  const models = useStore(state => state.models);
  const relations = useStore(state => state.relations);

  // Stable scope keys so the memo doesn't churn on fresh array identities.
  const scopeKey = Array.isArray(scopeModelNames)
    ? [...scopeModelNames].sort().join('|')
    : '__all__';
  const extraKey = Array.isArray(extraModelNames) ? [...extraModelNames].sort().join('|') : '';

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

    const nodes = visibleModels.map(model => ({
      id: ERD_NODE_ID(model.name),
      type: 'erdModelNode',
      position: { x: 0, y: 0 },
      data: {
        name: model.name,
        objectType: 'model',
        columns: columnsByNodeModel.get(model.name) || [],
        model,
      },
    }));

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
    try {
      layoutNodes = computeLayout(nodes, edges);
    } catch {
      // computeLayout needs dagre; if it throws (e.g. unmocked in a bare test)
      // keep zeroed positions so the graph still renders.
      layoutNodes = nodes;
    }

    return { nodes: layoutNodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, relations, scopeKey, extraKey, columnsByModel]);
}

export { ERD_NODE_ID, ERD_EDGE_ID };
export default useRelationErdDag;
