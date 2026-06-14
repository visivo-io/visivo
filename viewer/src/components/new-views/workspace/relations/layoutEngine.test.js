import {
  connectedComponents,
  packBoxes,
  clusterGridEngine,
  runLayout,
} from './layoutEngine';
import { packGridLayout } from './useRelationErdDag';
import {
  ERD_NODE_WIDTH,
  ERD_GRID_GAP_X,
  ERD_GRID_GAP_Y,
} from './erdGeometry';

// Mock dagre so the per-cluster layout is deterministic without a real graph
// engine. We lay each cluster member out in a horizontal row keyed by insertion
// order so bbox/normalize math is testable. computeLayout reads graph.node(id).
jest.mock('dagre', () => {
  const positions = new Map();
  return {
    graphlib: {
      Graph: class {
        constructor() {
          this._nodes = [];
          this._sizes = new Map();
        }
        setGraph() {}
        setDefaultEdgeLabel() {}
        setNode(id, dims) {
          this._nodes.push(id);
          this._sizes.set(id, dims);
          positions.set(this, this._nodes);
        }
        setEdge() {}
        node(id) {
          const order = this._nodes.indexOf(id);
          const dims = this._sizes.get(id) || { width: 180, height: 50 };
          // Place members left-to-right, 400px apart; dagre returns CENTER coords.
          return {
            x: order * 400 + dims.width / 2,
            y: 100 + dims.height / 2,
            width: dims.width,
            height: dims.height,
          };
        }
      },
    },
    layout: jest.fn(),
  };
});

const node = (id, height = 120, width = ERD_NODE_WIDTH) => ({
  id,
  data: { name: id },
  layoutSize: { width, height },
  position: { x: 0, y: 0 },
});
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });

describe('connectedComponents', () => {
  it('partitions A-B-C / D-E / F into 3 components', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F'].map(id => node(id));
    const edges = [edge('A', 'B'), edge('B', 'C'), edge('D', 'E')];
    const comps = connectedComponents(nodes, edges).map(c => c.sort());
    expect(comps).toHaveLength(3);
    const sizes = comps.map(c => c.length).sort();
    expect(sizes).toEqual([1, 2, 3]);
    expect(comps).toEqual(
      expect.arrayContaining([['A', 'B', 'C'], ['D', 'E'], ['F']])
    );
  });

  it('keeps a cycle A→B→C→A as one component', () => {
    const nodes = ['A', 'B', 'C'].map(id => node(id));
    const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];
    const comps = connectedComponents(nodes, edges);
    expect(comps).toHaveLength(1);
    expect(comps[0].sort()).toEqual(['A', 'B', 'C']);
  });

  it('ignores self-loops so a self-joined model stays a singleton', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('A', 'A')]; // self-loop only
    const comps = connectedComponents(nodes, edges);
    expect(comps).toHaveLength(2); // A and B both singletons
  });
});

describe('packBoxes', () => {
  it('returns {} for empty input', () => {
    expect(packBoxes([])).toEqual({});
    expect(packBoxes(null)).toEqual({});
  });

  it('tiles boxes across more than one column', () => {
    const boxes = Array.from({ length: 9 }, (_, i) => ({
      id: `b${i}`,
      width: ERD_NODE_WIDTH,
      height: 120,
    }));
    const origins = packBoxes(boxes);
    const xs = new Set(Object.values(origins).map(o => o.x));
    expect(xs.size).toBeGreaterThan(1); // ceil(sqrt(9*1.6)) = 4 columns
  });

  it('stacks boxes in a column by height without overlap', () => {
    const boxes = ['a', 'b', 'c', 'd'].map(id => ({ id, width: ERD_NODE_WIDTH, height: 100 }));
    const origins = packBoxes(boxes);
    const byCol = {};
    Object.values(origins).forEach(o => {
      byCol[o.x] = byCol[o.x] || [];
      byCol[o.x].push(o.y);
    });
    Object.values(byCol).forEach(ys => {
      const sorted = [...ys].sort((p, q) => p - q);
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(100);
      }
    });
  });

  it('clears a wide cluster so the next column never overlaps it', () => {
    // A wide super-node in column 0 must push later columns past its right edge.
    const wide = 900;
    const boxes = [
      { id: 'wide', width: wide, height: 100 },
      { id: 'n1', width: ERD_NODE_WIDTH, height: 100 },
      { id: 'n2', width: ERD_NODE_WIDTH, height: 100 },
    ];
    const origins = packBoxes(boxes);
    const col0x = origins.wide.x;
    const col0Right = col0x + wide;
    // Every box to the RIGHT of the wide cluster must clear its right edge + gap.
    const rightOfWide = Object.values(origins).filter(o => o.x > col0x);
    rightOfWide.forEach(o => {
      expect(o.x).toBeGreaterThanOrEqual(col0Right + ERD_GRID_GAP_X);
    });
    // And at least one box did land to the right (the cluster forced a 2nd column).
    expect(rightOfWide.length).toBeGreaterThan(0);
  });
});

describe('packGridLayout (thin wrapper) === packBoxes for singletons', () => {
  it('produces fixed-slot masonry positions matching the grid algorithm', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => node(`n${i}`, 100 + i * 10));
    const packed = packGridLayout(nodes);
    // Recompute the (square-biased) masonry inline and assert equality.
    const cols = Math.min(7, Math.max(2, Math.ceil(Math.sqrt(7))));
    const colHeights = new Array(cols).fill(0);
    const expected = nodes.map(n => {
      let col = 0;
      for (let i = 1; i < cols; i += 1) {
        if (colHeights[i] < colHeights[col]) col = i;
      }
      const x = col * (ERD_NODE_WIDTH + ERD_GRID_GAP_X);
      const y = colHeights[col];
      colHeights[col] += n.layoutSize.height + ERD_GRID_GAP_Y;
      return { id: n.id, x, y };
    });
    packed.forEach((n, i) => {
      expect(n.position.x).toBe(expected[i].x);
      expect(n.position.y).toBe(expected[i].y);
    });
  });

  it('returns input unchanged when empty/null', () => {
    expect(packGridLayout([])).toEqual([]);
    expect(packGridLayout(null)).toBeNull();
  });
});

describe('clusterGridEngine / runLayout', () => {
  it('writes a finite position to every node', () => {
    const nodes = ['A', 'B', 'C', 'D'].map(id => node(id));
    const edges = [edge('A', 'B')];
    const { nodes: out } = runLayout({ nodes, edges, options: {} });
    expect(out).toHaveLength(4);
    out.forEach(n => {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    });
  });

  it('produces no overlapping cluster bounding boxes', () => {
    // Two 2-node clusters + two singletons. Assert no two cards overlap.
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F'].map(id => node(id, 120));
    const edges = [edge('A', 'B'), edge('C', 'D')];
    const { nodes: out } = clusterGridEngine({ nodes, edges, options: {} });
    const rect = n => ({
      x: n.position.x,
      y: n.position.y,
      w: n.layoutSize.width,
      h: n.layoutSize.height,
    });
    const overlaps = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        expect(overlaps(rect(out[i]), rect(out[j]))).toBe(false);
      }
    }
  });

  it('singleton-only input matches the legacy packGridLayout', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => node(`n${i}`, 90 + i * 15));
    const fromEngine = runLayout({ nodes, edges: [], options: {} }).nodes;
    const fromLegacy = packGridLayout(nodes);
    fromEngine.forEach((n, i) => {
      expect(n.position).toEqual(fromLegacy[i].position);
    });
  });

  it('lays out a 2-node cluster with finite positions (moderate fixed ranksep)', () => {
    // Tall cards are spaced vertically by nodesep + their own height (dagre
    // handles that); the horizontal ranksep stays a moderate fixed gap so joined
    // cards sit close with room for the relation pill.
    const nodes = [node('A', 300), node('B', 300)];
    const edges = [edge('A', 'B')];
    const { nodes: out } = clusterGridEngine({ nodes, edges, options: {} });
    expect(out).toHaveLength(2);
    out.forEach(n => expect(Number.isFinite(n.position.x)).toBe(true));
    out.forEach(n => expect(Number.isFinite(n.position.y)).toBe(true));
  });

  it('returns the input array for an empty node set', () => {
    expect(runLayout({ nodes: [], edges: [] }).nodes).toEqual([]);
  });
});
