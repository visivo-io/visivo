import { useMemo } from 'react';
import useStore from '../../../../stores/store';
import { computeLayout } from '../../lineage/useLineageDag';

/**
 * useRelationErdDag — the ERD twin of useLineageDag (VIS-1006).
 *
 * Builds the React-Flow graph for the Relations ERD builder:
 *   - one `erdModelNode` per project model, carrying the model's column list so
 *     each column can render its own connection handle;
 *   - one edge per existing relation, parsed from the relation's `condition`
 *     (`${ref(A).colA} <op> ${ref(B).colB}`) into A.colA ↔ B.colB, wired to the
 *     per-column handles (`sourceHandle` / `targetHandle`) so the edge lands on
 *     the exact column rows.
 *
 * Reuses computeLayout (dagre LR) from the lineage harness for positions.
 *
 * Columns come from whatever the model record exposes (`columns`, or
 * `config.columns`); models whose columns haven't been hydrated yet render as a
 * card with a single node-level handle (still draggable, just column-less).
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

export function useRelationErdDag() {
  const models = useStore(state => state.models);
  const relations = useStore(state => state.relations);

  return useMemo(() => {
    const modelList = Array.isArray(models) ? models : [];
    const relationList = Array.isArray(relations) ? relations : [];

    const modelNames = new Set(modelList.map(m => m.name));

    const nodes = modelList.map(model => ({
      id: ERD_NODE_ID(model.name),
      type: 'erdModelNode',
      position: { x: 0, y: 0 },
      data: {
        name: model.name,
        objectType: 'model',
        columns: modelColumns(model),
        model,
      },
    }));

    const edges = [];
    relationList.forEach(relation => {
      const condition = relation.condition || relation.config?.condition;
      const parsed = parseRelationCondition(condition);
      if (!parsed) return;
      // Only wire edges whose endpoints are models we actually rendered.
      if (!modelNames.has(parsed.a.model) || !modelNames.has(parsed.b.model)) return;
      edges.push({
        id: ERD_EDGE_ID(relation.name),
        source: ERD_NODE_ID(parsed.a.model),
        sourceHandle: parsed.a.column,
        target: ERD_NODE_ID(parsed.b.model),
        targetHandle: parsed.b.column,
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
  }, [models, relations]);
}

export { ERD_NODE_ID, ERD_EDGE_ID };
export default useRelationErdDag;
