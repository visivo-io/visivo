import React, { useCallback, useMemo } from 'react';
import {
  BaseEdge,
  Position,
  getBezierPath,
  useStore as useRfStore,
  useStoreApi as useRfStoreApi,
} from 'reactflow';
import { getTypeColors } from '../../common/objectTypeConfigs';
import {
  SIDE,
  facingSides,
  columnAnchor,
  routeAroundObstacles,
  roundedPath,
  nodeBox,
} from './edgeRouting';

/**
 * RelationLinkEdge — the geometry-aware floating link from a model COLUMN to a
 * relation NODE (relation-as-node refactor).
 *
 * A relation is now a first-class node (RelationNode); each relation has TWO of
 * these edges (modelA → relNode, relNode → modelB). The line is:
 *   - relation-coloured (objectTypeConfigs 'relation'), thin;
 *   - UNDIRECTED — NO arrowhead, NO pill label (the pill is the node now). The
 *     two-way join would be misrepresented by a directional table→table arrow.
 *   - facing-side anchored: the MODEL end attaches on the side of the card facing
 *     the relation node, at the exact column ROW (`data.column` / `data.columns`);
 *     the RELATION-NODE end attaches at that node's facing-side center.
 *
 * Reuses the pure `edgeRouting` helpers (facingSides + columnAnchor +
 * routeAroundObstacles) and reads LIVE node geometry from `nodeInternals` with
 * the mandatory null-geometry guard chain (via `nodeBox`) so the first paint is a
 * finite path, never NaN, and the line follows a card during a drag.
 *
 * Wrapped in React.memo with a geometry comparator; the route recompute is gated
 * to the dragging regime (the static regime keeps its last path).
 */

const RELATION_COLOR = getTypeColors('relation').connectionHandle; // '#3b82f6'

const POSITION_ENUM = {
  [SIDE.Left]: Position.Left,
  [SIDE.Right]: Position.Right,
  [SIDE.Top]: Position.Top,
  [SIDE.Bottom]: Position.Bottom,
};

function RelationLinkEdgeInner({ id, source, target, sourceHandle, targetHandle, data = {} }) {
  const rfStoreApi = useRfStoreApi();

  // The relation-node end carries NO column list; the MODEL end is whichever end
  // is `modelEnd` in data ('source' → the source node is the model card;
  // 'target' → the target node is the model card).
  const modelEnd = data.modelEnd === 'target' ? 'target' : 'source';

  // Subscribe ONLY to this edge's two endpoints (a primitive geometry signature)
  // so a 50-node drag re-renders an edge only when ITS source/target moves — not
  // a useNodes() array scan over every node every frame.
  const geomSig = useRfStore(
    useCallback(
      s => {
        const sn = s.nodeInternals.get(source);
        const tn = s.nodeInternals.get(target);
        const sig = n => {
          if (!n) return 'x';
          const p = n.positionAbsolute ?? n.position ?? { x: 0, y: 0 };
          return `${p.x},${p.y},${n.width ?? ''},${n.height ?? ''},${n.dragging ? 1 : 0}`;
        };
        return `${sig(sn)}|${sig(tn)}`;
      },
      [source, target]
    )
  );

  const path = useMemo(() => {
    const { nodeInternals } = rfStoreApi.getState();
    const srcNode = nodeInternals.get(source);
    const tgtNode = nodeInternals.get(target);
    const srcBox = nodeBox(srcNode);
    const tgtBox = nodeBox(tgtNode);

    const { sourceSide, targetSide } = facingSides(srcBox, tgtBox);

    // Anchor the MODEL end at its column row; the RELATION-NODE end at its
    // facing-side center (no columns → columnAnchor with a null handle returns
    // the side-edge midpoint). Each end's `columns`/`handle` is only non-null for
    // the model side.
    const sourceColumns = modelEnd === 'source' ? data.columns || [] : [];
    const targetColumns = modelEnd === 'target' ? data.columns || [] : [];
    const p0 = columnAnchor(srcBox, sourceHandle ?? null, sourceColumns, sourceSide);
    const p1 = columnAnchor(tgtBox, targetHandle ?? null, targetColumns, targetSide);

    // Route around the OTHER cards. This memo only re-runs when geomSig changes
    // (this edge's endpoints moved, or a drag-stop committed), so non-dragging
    // edges never pay the route cost — the two-regime gate.
    const selfIds = new Set([source, target]);
    const obstacles = [];
    nodeInternals.forEach(n => {
      if (n.id === source || n.id === target) return;
      obstacles.push({ id: n.id, ...nodeBox(n) });
    });

    const points = routeAroundObstacles(p0, p1, obstacles, selfIds);

    if (points.length === 2) {
      // Clean curve when there are zero bends.
      const [bezier] = getBezierPath({
        sourceX: p0.x,
        sourceY: p0.y,
        sourcePosition: POSITION_ENUM[sourceSide] || Position.Right,
        targetX: p1.x,
        targetY: p1.y,
        targetPosition: POSITION_ENUM[targetSide] || Position.Left,
      });
      return bezier;
    }
    return roundedPath(points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    geomSig,
    sourceHandle,
    targetHandle,
    modelEnd,
    data.columns,
    source,
    target,
    rfStoreApi,
  ]);

  // No markerEnd → no arrowhead (undirected). Relation-coloured thin line.
  return <BaseEdge id={id} path={path} style={{ stroke: RELATION_COLOR, strokeWidth: 1.5 }} />;
}

// Geometry comparator — the static regime keeps its last path and skips the
// route recompute; only re-render when this edge's own endpoints, handles, or
// column data change.
const areEqual = (prev, next) => {
  if (prev.id !== next.id) return false;
  if (prev.source !== next.source || prev.target !== next.target) return false;
  if (prev.sourceHandle !== next.sourceHandle || prev.targetHandle !== next.targetHandle)
    return false;
  const pd = prev.data || {};
  const nd = next.data || {};
  return (
    pd.relationName === nd.relationName &&
    pd.modelEnd === nd.modelEnd &&
    pd.column === nd.column &&
    pd.columns === nd.columns
  );
};

const RelationLinkEdge = React.memo(RelationLinkEdgeInner, areEqual);
RelationLinkEdge.displayName = 'RelationLinkEdge';

export default RelationLinkEdge;
