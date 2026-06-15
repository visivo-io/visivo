import React from 'react';
import { BaseEdge, getBezierPath } from 'reactflow';
import { getTypeColors } from '../../common/objectTypeConfigs';

/**
 * RelationLinkEdge — the undirected line from a model COLUMN to a relation NODE.
 *
 * A relation is a first-class node (RelationNode); each relation has TWO of these
 * edges (modelA → relNode, relNode → modelB). We do NOT estimate anchor
 * positions: the model card renders a `<Handle id={column}>` on each column row
 * and the relation pill renders left/right handles, and the edge sets
 * `sourceHandle` / `targetHandle` to the column id — so React Flow hands this
 * component the EXACT measured handle positions (`sourceX/Y`, `targetX/Y`,
 * `sourcePosition`, `targetPosition`). We just draw the curve between them.
 *
 * Relation-coloured (objectTypeConfigs 'relation'); no arrowhead — a join is
 * two-way, so a directional table→table arrow would misrepresent it.
 */
const RELATION_COLOR = getTypeColors('relation').connectionHandle; // '#3b82f6'

function RelationLinkEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
}) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  // No markerEnd → undirected.
  return (
    <BaseEdge id={id} path={path} style={{ stroke: RELATION_COLOR, strokeWidth: 1.5, ...style }} />
  );
}

export default RelationLinkEdge;
