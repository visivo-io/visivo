/**
 * layoutEngine.js — the pluggable ERD layout machine (build spec §3).
 *
 * The edge system and the drag system call ONLY `runLayout({nodes, edges,
 * options}) => { nodes }` — never dagre or packBoxes directly. This `runLayout`
 * seam is the single contract; a future async engine (e.g. elkjs) drops in
 * behind it touching zero edge/drag code. We ship one dep-free engine today:
 * `clusterGridEngine` (Union-Find clustering → per-cluster dagre → masonry pack).
 *
 * Refine-only: `runLayout` produces the SEED positions; the hook overlays any
 * user-saved positions on top (§6), so first paint is always the synchronous
 * engine output and saved/moved cards are never reshuffled.
 *
 * Pure module — no React, no DOM. Geometry consts come from erdGeometry.js.
 */
import { computeLayout } from '../../lineage/useLineageDag';
import {
  ERD_NODE_WIDTH,
  ERD_GRID_GAP_X,
  ERD_GRID_GAP_Y,
} from './erdGeometry';

/**
 * Partition nodes into connected components (Union-Find), IGNORING self-loops
 * (`source === target`), so a model joined to itself stays a singleton rather
 * than a degenerate cluster. Isolated models are singleton components. O(V+E).
 *
 * @returns {Array<Array<string>>} list of components, each an array of node ids.
 */
export function connectedComponents(nodes, edges) {
  const ids = (nodes || []).map(n => n.id);
  const parent = new Map(ids.map(id => [id, id]));

  const find = x => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  (edges || []).forEach(edge => {
    const { source, target } = edge;
    if (source == null || target == null) return;
    if (source === target) return; // self-loop — never clusters
    if (!parent.has(source) || !parent.has(target)) return;
    union(source, target);
  });

  const groups = new Map();
  ids.forEach(id => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });
  return Array.from(groups.values());
}

/**
 * Shortest-column masonry packer with variable box width + height. Each box is a
 * super-node `{ id, width, height }`; returns `{ [id]: { x, y } }` origins.
 *
 * Column count is biased WIDER than square (`ceil(sqrt(n * 1.6))`, capped at n,
 * floored at 3 unless fewer boxes) so the canvas fills wide and `fitView`
 * doesn't zoom cards unreadable. Each box drops into whichever column is
 * currently shortest.
 *
 * BACK-COMPAT: when every box is a singleton card (width === ERD_NODE_WIDTH), the
 * x/y origins are IDENTICAL to the legacy `packGridLayout` — the column x-step is
 * the fixed `ERD_NODE_WIDTH + ERD_GRID_GAP_X`, and a box advances its column by
 * `height + ERD_GRID_GAP_Y`. For variable-width clusters the per-column x is the
 * running max of `(columnBaseX, prevColumnBaseX + prevColumnMaxWidth + gap)` so
 * wide clusters never overlap their right neighbor.
 */
export function packBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) return {};
  const n = boxes.length;
  const cols = Math.min(n, Math.max(3, Math.ceil(Math.sqrt(n * 1.6))));

  const colHeights = new Array(cols).fill(0); // running y per column
  const colMaxWidth = new Array(cols).fill(0); // widest box dropped in each column
  const colItems = Array.from({ length: cols }, () => []); // [{ boxId, y, width }]

  boxes.forEach(box => {
    const width = box.width ?? ERD_NODE_WIDTH;
    const height = box.height ?? 80;
    // Shortest column wins (ties → leftmost, matching legacy order).
    let col = 0;
    for (let i = 1; i < cols; i += 1) {
      if (colHeights[i] < colHeights[col]) col = i;
    }
    const y = colHeights[col];
    colItems[col].push({ boxId: box.id, y, width });
    colHeights[col] = y + height + ERD_GRID_GAP_Y;
    if (width > colMaxWidth[col]) colMaxWidth[col] = width;
  });

  // Resolve each column's x-origin. Legacy uses a fixed slot width; we keep that
  // when every column is a singleton-width column, otherwise expand to clear the
  // widest cluster in the previous column.
  const colX = new Array(cols).fill(0);
  for (let i = 1; i < cols; i += 1) {
    const fixedSlot = i * (ERD_NODE_WIDTH + ERD_GRID_GAP_X);
    const cleared = colX[i - 1] + (colMaxWidth[i - 1] || ERD_NODE_WIDTH) + ERD_GRID_GAP_X;
    colX[i] = Math.max(fixedSlot, cleared);
  }

  const origins = {};
  colItems.forEach((items, col) => {
    items.forEach(item => {
      origins[item.boxId] = { x: colX[col], y: item.y };
    });
  });
  return origins;
}

/**
 * `clusterGridEngine` — the shipped dep-free layout engine.
 *
 * STEP 1 CLUSTER       Union-Find over edges (self-loops ignored).
 * STEP 2 PER-CLUSTER   dagre LR per multi-node component (singletons skip dagre).
 *                      Adaptive ranksep for tall cards (maxH > 200 → 1.5*maxH).
 * STEP 3 NORMALIZE     shift each cluster to min-x=0, min-y=0; record bbox.
 * STEP 4 PACK          packBoxes treats each cluster bbox as a super-node.
 * STEP 5 TRANSLATE     finalPos = superNodeOrigin + nodeLocalClusterPos.
 *
 * @returns {{ nodes: Array }} nodes with `position: { x, y }` written.
 */
export function clusterGridEngine({ nodes, edges, options = {} }) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  if (nodeList.length === 0) return { nodes: nodeList };

  const edgeList = Array.isArray(edges) ? edges : [];
  const byId = new Map(nodeList.map(n => [n.id, n]));
  const components = connectedComponents(nodeList, edgeList);

  // Local (cluster-relative) position per node id, plus per-cluster bbox.
  const localPos = new Map();
  const clusterBoxes = [];

  components.forEach((memberIds, idx) => {
    const clusterId = `cluster-${idx}`;
    const members = memberIds.map(id => byId.get(id)).filter(Boolean);

    if (members.length === 1) {
      // Singleton — no dagre. Local origin (0,0); bbox = its layoutSize.
      const node = members[0];
      localPos.set(node.id, { x: 0, y: 0 });
      clusterBoxes.push({
        id: clusterId,
        members: [node.id],
        width: node.layoutSize?.width ?? ERD_NODE_WIDTH,
        height: node.layoutSize?.height ?? 80,
      });
      return;
    }

    const memberSet = new Set(memberIds);
    const clusterEdges = edgeList.filter(
      e => e.source !== e.target && memberSet.has(e.source) && memberSet.has(e.target)
    );

    // Adaptive ranksep: a tall card needs the LR gap widened so the next rank
    // clears it. 1.5× the tallest card when it exceeds 200px (spec §3 step 2).
    const maxH = members.reduce(
      (m, node) => Math.max(m, node.layoutSize?.height ?? 0),
      0
    );
    const dagreOpts = {
      ranksep: maxH > 200 ? Math.max(100, 1.5 * maxH) : options.ranksep ?? 100,
      nodesep: options.nodesep ?? 50,
      rankdir: options.direction ?? 'LR',
    };

    let laid;
    try {
      laid = computeLayout(members, clusterEdges, null, dagreOpts);
    } catch {
      // dagre unavailable (e.g. unmocked bare test) → keep zeroed positions so
      // the graph still renders; pack treats them as a tight stack.
      laid = members.map(node => ({ ...node, position: { x: 0, y: 0 } }));
    }

    // Normalize: shift to min-x=0, min-y=0; record bbox (account for card size).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    laid.forEach(node => {
      const w = node.layoutSize?.width ?? ERD_NODE_WIDTH;
      const h = node.layoutSize?.height ?? 80;
      const { x, y } = node.position;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    laid.forEach(node => {
      localPos.set(node.id, {
        x: node.position.x - minX,
        y: node.position.y - minY,
      });
    });

    clusterBoxes.push({
      id: clusterId,
      members: memberIds,
      width: maxX - minX,
      height: maxY - minY,
    });
  });

  // Pack the clusters as super-nodes, then translate each node into place.
  const origins = packBoxes(clusterBoxes);
  const positioned = nodeList.map(node => {
    // Find this node's cluster origin.
    const box = clusterBoxes.find(b => b.members.includes(node.id));
    const origin = (box && origins[box.id]) || { x: 0, y: 0 };
    const local = localPos.get(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: { x: origin.x + local.x, y: origin.y + local.y },
    };
  });

  return { nodes: positioned };
}

/**
 * The pluggable layout seam. Synchronous today (clusterGridEngine); the contract
 * tolerates a Promise return for a future async engine. Edge/drag code calls
 * ONLY this — never dagre/packBoxes.
 *
 * @param {{ nodes: Array, edges: Array, options?: object }} input
 * @returns {{ nodes: Array }}
 */
export function runLayout({ nodes, edges, options = {} }) {
  return clusterGridEngine({ nodes, edges, options });
}

export default runLayout;
