import React, { useCallback, useMemo, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  Position,
  getBezierPath,
  useReactFlow,
  useStore as useRfStore,
  useStoreApi as useRfStoreApi,
} from 'reactflow';
import useStore from '../../../../stores/store';
import { getTypeColors } from '../../common/objectTypeConfigs';
import {
  SIDE,
  facingSides,
  columnAnchor,
  routeAroundObstacles,
  roundedPath,
  parallelOffset,
  selfLoopPath,
  nodeBox,
} from './edgeRouting';

/**
 * RelationPillEdge — the geometry-aware floating edge for the ERD (build spec §4/§5).
 *
 * - Reads LIVE node geometry from `nodeInternals` (a useStore selector) so the
 *   edge follows a card during a drag, with the mandatory null-geometry guard
 *   chain (width 260 / estimated height / positionAbsolute ?? position ?? {0,0})
 *   so the first paint is a finite path, never NaN.
 * - Facing-side anchoring overrides RF's fixed left=target/right=source topology.
 * - Column-row anchors (deterministic from card geometry, not getBoundingClientRect).
 * - Route-around-cards (AABB only) — recomputed only while an endpoint is dragging.
 * - Self-loops (source === target) render a rounded loop off the card right side.
 * - Parallel edges offset perpendicular so duplicate relations are distinct.
 * - A clickable + draggable pill via EdgeLabelRenderer: click → open the edit
 *   modal; drag (>4px) → set/persist data.waypoint; double-click → clear it.
 *
 * Wrapped in React.memo with a geometry+dragging+waypoint comparator (§4.8).
 */

const RELATION_BLUE = getTypeColors('relation').connectionHandle; // '#3b82f6'
const DRAG_THRESHOLD = 4; // px before a pill pointer-move becomes a waypoint drag

const POSITION_ENUM = {
  [SIDE.Left]: Position.Left,
  [SIDE.Right]: Position.Right,
  [SIDE.Top]: Position.Top,
  [SIDE.Bottom]: Position.Bottom,
};

const JOIN_GLYPH = {
  inner: '⋈',
  left: '⟕',
  right: '⟖',
  full: '⟗',
};

function RelationPillEdgeInner({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  markerEnd,
  data = {},
}) {
  // The canvas stamps the per-scope key into edge.data so persistence routes to
  // the right scope bucket ('semantic-layer' / 'relation:<name>' / ...).
  const scopeKey = data.scopeKey;
  const { screenToFlowPosition } = useReactFlow();
  const rfStoreApi = useRfStoreApi();
  const setErdEdgeWaypoint = useStore(s => s.setErdEdgeWaypoint);
  const openEditRelationModal = useStore(s => s.openEditRelationModal);
  const getRelationByName = useStore(s => s.getRelationByName);

  const isSelfLoop = source === target;

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

  // In-flight pill drag bookkeeping (no re-render needed during the gesture).
  const pointerStateRef = useRef(null);

  const geometry = useMemo(() => {
    const { nodeInternals } = rfStoreApi.getState();
    const srcNode = nodeInternals.get(source);
    const tgtNode = nodeInternals.get(target);
    const dragging = Boolean(srcNode?.dragging || tgtNode?.dragging);
    const srcBox = nodeBox(srcNode);
    const tgtBox = nodeBox(tgtNode);

    if (isSelfLoop) {
      const outY = srcBox.y + 36 + 15; // header + half row (rough; loop is decorative)
      const loop = selfLoopPath(srcBox, { outY, inY: outY + 30 });
      return { path: loop.path, labelX: loop.labelX, labelY: loop.labelY };
    }

    const { sourceSide, targetSide } = facingSides(srcBox, tgtBox);
    const sourceColumns = data.sourceColumns || [];
    const targetColumns = data.targetColumns || [];
    let p0 = columnAnchor(srcBox, sourceHandle, sourceColumns, sourceSide);
    let p1 = columnAnchor(tgtBox, targetHandle, targetColumns, targetSide);

    // Parallel-edge perpendicular offset (separates duplicate relations).
    const off = parallelOffset(data.parallelIndex, data.parallelCount);
    if (off !== 0) {
      const horizontal = sourceSide === SIDE.Left || sourceSide === SIDE.Right;
      // Offset perpendicular to the edge's travel axis.
      if (horizontal) {
        p0 = { ...p0, y: p0.y + off };
        p1 = { ...p1, y: p1.y + off };
      } else {
        p0 = { ...p0, x: p0.x + off };
        p1 = { ...p1, x: p1.x + off };
      }
    }

    // A forced waypoint always wins; otherwise route around the OTHER cards. This
    // memo only re-runs when geomSig changes (this edge's endpoints moved, or a
    // drag-stop committed), so non-dragging edges never pay the route cost — the
    // two-regime gate (§4.8). `dragging` is read above for that signal.
    void dragging;
    const waypoint = data.waypoint || null;
    const selfIds = new Set([source, target]);
    const obstacles = [];
    nodeInternals.forEach(n => {
      if (n.id === source || n.id === target) return;
      obstacles.push({ id: n.id, ...nodeBox(n) });
    });

    const points = routeAroundObstacles(p0, p1, obstacles, selfIds, { waypoint });

    let path;
    let labelX;
    let labelY;
    if (points.length === 2 && !waypoint) {
      // Clean curve when there are zero bends and no override.
      const [bezier, lx, ly] = getBezierPath({
        sourceX: p0.x,
        sourceY: p0.y,
        sourcePosition: POSITION_ENUM[sourceSide] || Position.Right,
        targetX: p1.x,
        targetY: p1.y,
        targetPosition: POSITION_ENUM[targetSide] || Position.Left,
      });
      path = bezier;
      labelX = lx;
      labelY = ly;
    } else {
      path = roundedPath(points);
      // Pill at the override waypoint if set, else the polyline midpoint.
      const mid = waypoint || points[Math.floor(points.length / 2)] || p0;
      labelX = mid.x;
      labelY = mid.y;
    }
    return { path, labelX, labelY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    geomSig,
    sourceHandle,
    targetHandle,
    isSelfLoop,
    data.waypoint,
    data.parallelIndex,
    data.parallelCount,
    data.sourceColumns,
    data.targetColumns,
    source,
    target,
    rfStoreApi,
  ]);

  const relationName = data.relationName;

  const openEditor = useCallback(() => {
    if (!relationName) return;
    const relation =
      (getRelationByName && getRelationByName(relationName)) || { name: relationName };
    if (openEditRelationModal) openEditRelationModal(relation);
  }, [relationName, getRelationByName, openEditRelationModal]);

  const onPointerDown = useCallback(
    e => {
      e.stopPropagation();
      const target_ = e.currentTarget;
      try {
        target_.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      pointerStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        pointerId: e.pointerId,
        target: target_,
      };
    },
    []
  );

  const onPointerMove = useCallback(
    e => {
      const st = pointerStateRef.current;
      if (!st) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (!st.dragging && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
      st.dragging = true;
      // Track the pointer in flow coords so the lever follows pan/zoom.
      const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (scopeKey && setErdEdgeWaypoint) setErdEdgeWaypoint(scopeKey, id, pt);
    },
    [screenToFlowPosition, scopeKey, setErdEdgeWaypoint, id]
  );

  const endPointer = useCallback(
    e => {
      const st = pointerStateRef.current;
      pointerStateRef.current = null;
      if (!st) return;
      try {
        st.target.releasePointerCapture?.(st.pointerId);
      } catch {
        /* release is best-effort */
      }
      if (!st.dragging) {
        // A click (moved < threshold) → open the relation editor.
        openEditor();
      } else if (e?.type === 'pointercancel' || e?.type === 'blur') {
        // An interrupted drag must not leave a stray half-applied waypoint; the
        // last committed pointer position already persisted via onPointerMove.
      }
    },
    [openEditor]
  );

  const onDoubleClick = useCallback(
    e => {
      e.stopPropagation();
      pointerStateRef.current = null;
      if (scopeKey && setErdEdgeWaypoint) setErdEdgeWaypoint(scopeKey, id, null);
    },
    [scopeKey, setErdEdgeWaypoint, id]
  );

  const glyph = JOIN_GLYPH[data.joinType] || JOIN_GLYPH.inner;
  const safeName = String(relationName || '').replace(/\s+/g, '_');

  return (
    <>
      <BaseEdge id={id} path={geometry.path} markerEnd={markerEnd} style={{ stroke: RELATION_BLUE, strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          data-testid={`erd-relation-pill-${safeName}`}
          className="nodrag nopan"
          role="button"
          tabIndex={0}
          title={data.condition || relationName}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onDoubleClick={onDoubleClick}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${geometry.labelX}px, ${geometry.labelY}px)`,
            pointerEvents: 'all',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 9999,
            // Relation-blue text on white — legible, no dark-on-dark/light-on-light.
            background: '#ffffff',
            color: RELATION_BLUE,
            border: `1px solid ${RELATION_BLUE}`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 12 }}>
            {glyph}
          </span>
          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {relationName}
          </span>
          {data.isDefault && (
            <span aria-label="default" title="Default relation" style={{ color: '#f59e0b' }}>
              ★
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Geometry+dragging+waypoint comparator — the static regime keeps its last path
// and skips the expensive route recompute; only re-render when this edge's own
// geometry scalars, dragging flags, waypoint, or parallel index change.
const areEqual = (prev, next) => {
  if (prev.id !== next.id) return false;
  if (prev.source !== next.source || prev.target !== next.target) return false;
  if (prev.sourceHandle !== next.sourceHandle || prev.targetHandle !== next.targetHandle)
    return false;
  if (prev.markerEnd !== next.markerEnd) return false;
  const pd = prev.data || {};
  const nd = next.data || {};
  const wpEq =
    (pd.waypoint?.x ?? null) === (nd.waypoint?.x ?? null) &&
    (pd.waypoint?.y ?? null) === (nd.waypoint?.y ?? null);
  return (
    wpEq &&
    pd.scopeKey === nd.scopeKey &&
    pd.parallelIndex === nd.parallelIndex &&
    pd.parallelCount === nd.parallelCount &&
    pd.relationName === nd.relationName &&
    pd.joinType === nd.joinType &&
    pd.isDefault === nd.isDefault &&
    pd.sourceColumns === nd.sourceColumns &&
    pd.targetColumns === nd.targetColumns
  );
};

const RelationPillEdge = React.memo(RelationPillEdgeInner, areEqual);
RelationPillEdge.displayName = 'RelationPillEdge';

export const RELATION_EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  color: RELATION_BLUE,
};

export default RelationPillEdge;
