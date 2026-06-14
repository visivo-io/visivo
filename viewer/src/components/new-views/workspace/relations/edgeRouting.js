/**
 * edgeRouting.js — PURE geometry for the ERD floating edge (build spec §4).
 *
 * No trig, no SQL, no DOM, no React. Just AABB / Liang-Barsky math, side
 * selection, column-row anchoring, route-around-cards, rounded orthogonal path
 * building, parallel-edge offset, and the self-loop path.
 *
 * Side values are the React-Flow `Position` enum strings ('left' | 'right' |
 * 'top' | 'bottom') so the edge component can feed them straight to RF.
 */
import {
  ERD_HEADER_H,
  ERD_ROW_H,
  ERD_NODE_WIDTH,
  estimateErdNodeHeight,
} from './erdGeometry';

export const SIDE = Object.freeze({
  Left: 'left',
  Right: 'right',
  Top: 'top',
  Bottom: 'bottom',
});

const centerOf = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * Facing-side selection — overrides React-Flow's fixed left=target/right=source
 * topology. The dominant axis of the center→center vector picks the sides so a
 * card to the LEFT gets a left-attached edge.
 *
 * @returns {{ sourceSide, targetSide }} Position enum strings.
 */
export function facingSides(srcBox, tgtBox) {
  const sc = centerOf(srcBox);
  const tc = centerOf(tgtBox);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominant: source exits toward the target on the X axis.
    if (dx >= 0) return { sourceSide: SIDE.Right, targetSide: SIDE.Left };
    return { sourceSide: SIDE.Left, targetSide: SIDE.Right };
  }
  // Vertical dominant.
  if (dy >= 0) return { sourceSide: SIDE.Bottom, targetSide: SIDE.Top };
  return { sourceSide: SIDE.Top, targetSide: SIDE.Bottom };
}

/**
 * Column-row anchor. For a horizontal edge (Left/Right side) the attach Y is
 * deterministic from card geometry (NOT getBoundingClientRect, which breaks
 * under zoom): header + rowIndex*ROW + ROW/2, clamped inside the card. An
 * unresolved handle (unhydrated columns) → card vertical center.
 *
 * For a vertical edge (Top/Bottom) the X is the card center and Y is the card
 * top/bottom edge (column anchoring degrades to center-X).
 *
 * @returns {{ x, y }}
 */
export function columnAnchor(box, handleId, columns, side) {
  const cols = Array.isArray(columns) ? columns : [];

  if (side === SIDE.Top || side === SIDE.Bottom) {
    return {
      x: box.x + box.width / 2,
      y: side === SIDE.Top ? box.y : box.y + box.height,
    };
  }

  // Horizontal (Left/Right).
  const x = side === SIDE.Right ? box.x + box.width : box.x;
  const rowIndex = handleId == null ? -1 : cols.indexOf(handleId);
  let y;
  if (rowIndex < 0) {
    // Unresolved / no handle → facing-side vertical center.
    y = box.y + box.height / 2;
  } else {
    y = box.y + ERD_HEADER_H + rowIndex * ERD_ROW_H + ERD_ROW_H / 2;
  }
  // Clamp inside the card body (header..bottom).
  const min = box.y + ERD_HEADER_H;
  const max = box.y + box.height;
  y = Math.max(min, Math.min(max, y));
  return { x, y };
}

/**
 * Does segment p0→p1 cross the axis-aligned box (inflated by `pad`)? Liang-Barsky
 * slab clipping — no trig. Returns false for a segment that merely runs alongside.
 */
export function segmentIntersectsAABB(p0, p1, box, pad = 0) {
  const minX = box.x - pad;
  const minY = box.y - pad;
  const maxX = box.x + box.width + pad;
  const maxY = box.y + box.height + pad;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    // p * t <= q ; update [t0, t1]. Return false if fully rejected.
    if (p === 0) return q >= 0; // parallel — inside slab only if q >= 0
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, p0.x - minX) &&
    clip(dx, maxX - p0.x) &&
    clip(-dy, p0.y - minY) &&
    clip(dy, maxY - p0.y)
  ) {
    // Intersects if the clipped sub-interval is non-empty within [0,1].
    return t0 <= t1 && t1 >= 0 && t0 <= 1;
  }
  return false;
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Route a path from p0 → p1 detouring around obstacle boxes. AABB-only, single
 * perpendicular detour per obstacle, recurse on sub-segments, cap at `maxBends`
 * total. Honors a forced `waypoint` (the pill drag): when set, the route is
 * p0 → waypoint → p1 and auto-routing is skipped entirely (user override wins).
 *
 * @param {{x,y}} p0 source anchor
 * @param {{x,y}} p1 target anchor
 * @param {Array<{id,x,y,width,height}>} boxes obstacle cards (with ids)
 * @param {Set<string>} selfIds ids to EXCLUDE (source + target cards)
 * @param {{pad,maxBends,waypoint}} opts
 * @returns {Array<{x,y}>} polyline points including p0 and p1.
 */
export function routeAroundObstacles(p0, p1, boxes, selfIds, opts = {}) {
  const { pad = 16, maxBends = 3, waypoint = null } = opts;

  // Forced waypoint (pill drag) — user override wins, skip auto-routing.
  if (waypoint && Number.isFinite(waypoint.x) && Number.isFinite(waypoint.y)) {
    return [p0, { x: waypoint.x, y: waypoint.y }, p1];
  }

  const obstacles = (boxes || []).filter(b => b && !(selfIds && selfIds.has(b.id)));

  // A GLOBAL bend budget shared across the whole recursion (not per-branch), so
  // the total number of inserted detours never exceeds `maxBends`. Once the
  // budget hits zero the remaining legs are accepted as-is (best-effort, never
  // loops — resolves the "single-bend degrade" cap requirement).
  let budget = maxBends;

  const route = (a, b) => {
    if (budget <= 0) return [a, b];

    // Nearest obstructing box by center distance from `a`.
    let nearest = null;
    let nearestEntry = Infinity;
    obstacles.forEach(box => {
      if (segmentIntersectsAABB(a, b, box, pad)) {
        const c = centerOf(box);
        const d = dist(a, { x: c.x, y: c.y });
        if (d < nearestEntry) {
          nearestEntry = d;
          nearest = box;
        }
      }
    });

    if (!nearest) return [a, b]; // clear

    budget -= 1; // spend one bend on this detour

    // One perpendicular detour clearing the box's nearest face toward the side
    // with more free space. Detour axis is perpendicular to dominant travel.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bMinX = nearest.x - pad;
    const bMaxX = nearest.x + nearest.width + pad;
    const bMinY = nearest.y - pad;
    const bMaxY = nearest.y + nearest.height + pad;

    let detour;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const mid = (a.y + b.y) / 2;
      const goDown = mid >= centerOf(nearest).y;
      detour = { x: (a.x + b.x) / 2, y: goDown ? bMaxY : bMinY };
    } else {
      const mid = (a.x + b.x) / 2;
      const goRight = mid >= centerOf(nearest).x;
      detour = { x: goRight ? bMaxX : bMinX, y: (a.y + b.y) / 2 };
    }

    const left = route(a, detour);
    const right = route(detour, b);
    return [...left.slice(0, -1), ...right];
  };

  return route(p0, p1);
}

/**
 * Build a rounded orthogonal SVG path `d` string through a polyline. Corners are
 * filleted by `radius`. Falls back to a straight line for 2 points.
 */
export function roundedPath(points, radius = 8) {
  const pts = (points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    // Trim the corner by radius along each leg (clamped to half the leg length).
    const inLen = dist(prev, cur);
    const outLen = dist(cur, next);
    const r1 = Math.min(radius, inLen / 2);
    const r2 = Math.min(radius, outLen / 2);
    const inDir = { x: (cur.x - prev.x) / (inLen || 1), y: (cur.y - prev.y) / (inLen || 1) };
    const outDir = { x: (next.x - cur.x) / (outLen || 1), y: (next.y - cur.y) / (outLen || 1) };
    const p1 = { x: cur.x - inDir.x * r1, y: cur.y - inDir.y * r1 };
    const p2 = { x: cur.x + outDir.x * r2, y: cur.y + outDir.y * r2 };
    d += ` L ${p1.x},${p1.y} Q ${cur.x},${cur.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/**
 * Perpendicular offset for one edge in a parallel group: symmetric about the
 * group center, `spacing` px apart. parallelIndex in [0, count).
 */
export function parallelOffset(parallelIndex = 0, parallelCount = 1, spacing = 18) {
  const i = Number.isFinite(parallelIndex) ? parallelIndex : 0;
  const n = Number.isFinite(parallelCount) && parallelCount > 0 ? parallelCount : 1;
  return (i - (n - 1) / 2) * spacing;
}

/**
 * Self-loop path (source === target). A rounded rectangular loop off the card
 * RIGHT side, from the source column row out, arc right, back into the target
 * column row. No obstacle routing. Returns the SVG `d` plus the pill apex.
 *
 * @param {{x,y,width,height}} box the card
 * @param {{ outY, inY, extent, radius }} opts
 * @returns {{ path, labelX, labelY }}
 */
export function selfLoopPath(box, opts = {}) {
  const rightX = box.x + box.width;
  const outY = Number.isFinite(opts.outY)
    ? opts.outY
    : box.y + ERD_HEADER_H + ERD_ROW_H / 2;
  const inY = Number.isFinite(opts.inY)
    ? opts.inY
    : box.y + ERD_HEADER_H + ERD_ROW_H * 1.5;
  const extent = opts.extent ?? 48;
  const radius = opts.radius ?? 10;
  const apexX = rightX + extent;

  const points = [
    { x: rightX, y: outY },
    { x: apexX, y: outY },
    { x: apexX, y: inY },
    { x: rightX, y: inY },
  ];
  return {
    path: roundedPath(points, radius),
    labelX: apexX,
    labelY: (outY + inY) / 2,
  };
}

/**
 * Convenience: a card box from a (possibly partially-measured) RF node, with the
 * mandatory null-geometry fallbacks (width 260, height from estimateErdNodeHeight,
 * positionAbsolute ?? position ?? {0,0}). Used by the edge component's guard chain.
 */
export function nodeBox(node) {
  const width = node?.width ?? node?.data?.layoutSize?.width ?? ERD_NODE_WIDTH;
  const height =
    node?.height ?? node?.data?.layoutSize?.height ?? estimateErdNodeHeight(node?.data || {});
  const pos = node?.positionAbsolute ?? node?.position ?? { x: 0, y: 0 };
  return { x: pos.x, y: pos.y, width, height };
}
