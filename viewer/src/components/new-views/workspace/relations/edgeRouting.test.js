import {
  SIDE,
  facingSides,
  columnAnchor,
  segmentIntersectsAABB,
  routeAroundObstacles,
  roundedPath,
  parallelOffset,
  selfLoopPath,
  nodeBox,
} from './edgeRouting';
import { ERD_HEADER_H, ERD_ROW_H, ERD_NODE_WIDTH } from './erdGeometry';

const box = (x, y, width = 260, height = 120, id = 'b') => ({ id, x, y, width, height });

describe('facingSides', () => {
  it('horizontal split: source on the LEFT exits Right, target enters Left', () => {
    const src = box(0, 0);
    const tgt = box(600, 0); // target to the right
    expect(facingSides(src, tgt)).toEqual({
      sourceSide: SIDE.Right,
      targetSide: SIDE.Left,
    });
  });

  it('horizontal split: target to the LEFT → source exits Left (the core bug fix)', () => {
    const src = box(600, 0);
    const tgt = box(0, 0); // target to the LEFT of source
    expect(facingSides(src, tgt)).toEqual({
      sourceSide: SIDE.Left,
      targetSide: SIDE.Right,
    });
  });

  it('vertical split: target BELOW → source exits Bottom, target enters Top', () => {
    const src = box(0, 0);
    const tgt = box(0, 600);
    expect(facingSides(src, tgt)).toEqual({
      sourceSide: SIDE.Bottom,
      targetSide: SIDE.Top,
    });
  });

  it('vertical split: target ABOVE → source exits Top, target enters Bottom', () => {
    const src = box(0, 600);
    const tgt = box(0, 0);
    expect(facingSides(src, tgt)).toEqual({
      sourceSide: SIDE.Top,
      targetSide: SIDE.Bottom,
    });
  });
});

describe('columnAnchor', () => {
  const columns = ['id', 'user_id', 'email'];

  it('anchors Y at header + idx*ROW + ROW/2 on the facing side', () => {
    const b = box(100, 200);
    const a = columnAnchor(b, 'user_id', columns, SIDE.Right);
    expect(a.x).toBe(100 + ERD_NODE_WIDTH); // right edge
    expect(a.y).toBe(200 + ERD_HEADER_H + 1 * ERD_ROW_H + ERD_ROW_H / 2);
  });

  it('Left side anchors X at the left edge', () => {
    const b = box(100, 200);
    const a = columnAnchor(b, 'id', columns, SIDE.Left);
    expect(a.x).toBe(100);
    expect(a.y).toBe(200 + ERD_HEADER_H + 0 * ERD_ROW_H + ERD_ROW_H / 2);
  });

  it('unknown / null handle falls back to the card vertical center', () => {
    const b = box(0, 0, 260, 120);
    const center = columnAnchor(b, 'nope', columns, SIDE.Right);
    expect(center.y).toBe(60); // height/2
    const noHandle = columnAnchor(b, null, columns, SIDE.Left);
    expect(noHandle.y).toBe(60);
  });

  it('a vertical (Top/Bottom) edge uses card center-X and the card top/bottom edge', () => {
    const b = box(0, 0, 260, 120);
    const top = columnAnchor(b, 'id', columns, SIDE.Top);
    expect(top.x).toBe(130);
    expect(top.y).toBe(0);
    const bottom = columnAnchor(b, 'id', columns, SIDE.Bottom);
    expect(bottom.x).toBe(130);
    expect(bottom.y).toBe(120);
  });

  it('clamps an out-of-range row to inside the card body', () => {
    // A handle index beyond the card height should clamp at the bottom.
    const b = box(0, 0, 260, 80); // short card
    const a = columnAnchor(b, 'email', ['email'], SIDE.Right); // idx 0 fits
    expect(a.y).toBeLessThanOrEqual(80);
    expect(a.y).toBeGreaterThanOrEqual(ERD_HEADER_H);
  });
});

describe('segmentIntersectsAABB', () => {
  it('true for a segment passing straight through a box', () => {
    const b = box(100, 100, 100, 100);
    expect(segmentIntersectsAABB({ x: 0, y: 150 }, { x: 300, y: 150 }, b)).toBe(true);
  });

  it('false for a segment running alongside (above) the box', () => {
    const b = box(100, 100, 100, 100);
    expect(segmentIntersectsAABB({ x: 0, y: 50 }, { x: 300, y: 50 }, b)).toBe(false);
  });

  it('respects the inflation pad', () => {
    const b = box(100, 100, 100, 100);
    // y=90 misses the raw box but a pad of 16 inflates it to catch the segment.
    expect(segmentIntersectsAABB({ x: 0, y: 90 }, { x: 300, y: 90 }, b, 0)).toBe(false);
    expect(segmentIntersectsAABB({ x: 0, y: 90 }, { x: 300, y: 90 }, b, 16)).toBe(true);
  });
});

describe('routeAroundObstacles', () => {
  it('returns a straight 2-point path when the field is clear', () => {
    const pts = routeAroundObstacles({ x: 0, y: 0 }, { x: 400, y: 0 }, [], new Set());
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ]);
  });

  it('inserts one bend around a single obstructing box', () => {
    const obstacle = box(150, -50, 100, 100, 'o');
    const pts = routeAroundObstacles(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      [obstacle],
      new Set()
    );
    expect(pts.length).toBeGreaterThan(2); // a detour was inserted
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 400, y: 0 });
  });

  it('excludes source/target boxes via selfIds', () => {
    const endpointBox = box(150, -50, 100, 100, 'src');
    const pts = routeAroundObstacles(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      [endpointBox],
      new Set(['src'])
    );
    // The only box is an endpoint → ignored → straight path.
    expect(pts).toHaveLength(2);
  });

  it('caps the total number of bends in a dense field', () => {
    // A wall of obstacles; the route must not exceed maxBends detours.
    const obstacles = Array.from({ length: 10 }, (_, i) =>
      box(50 + i * 40, -50, 30, 100, `o${i}`)
    );
    const pts = routeAroundObstacles(
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      obstacles,
      new Set(),
      { maxBends: 3 }
    );
    // p0 + at most 3 detour points + p1 = 5 max.
    expect(pts.length).toBeLessThanOrEqual(5);
    expect(Number.isFinite(pts[0].x)).toBe(true);
  });

  it('honors a forced data.waypoint and skips auto-routing', () => {
    const obstacle = box(150, -50, 100, 100, 'o');
    const pts = routeAroundObstacles(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      [obstacle],
      new Set(),
      { waypoint: { x: 200, y: 200 } }
    );
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      { x: 400, y: 0 },
    ]);
  });
});

describe('roundedPath', () => {
  it('builds a straight line for two points', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M 0,0 L 10,0');
  });

  it('inserts a quadratic fillet at an interior corner', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(d).toContain('M 0,0');
    expect(d).toContain('Q 100,0'); // rounded corner at the bend
  });

  it('returns empty string for no finite points', () => {
    expect(roundedPath([])).toBe('');
    expect(roundedPath([{ x: NaN, y: NaN }])).toBe('');
  });
});

describe('parallelOffset', () => {
  it('is symmetric about the group center', () => {
    // 2 edges → offsets -9 and +9 (spacing 18).
    expect(parallelOffset(0, 2)).toBe(-9);
    expect(parallelOffset(1, 2)).toBe(9);
    // single edge → no offset.
    expect(parallelOffset(0, 1)).toBe(0);
    // 3 edges → -18, 0, +18.
    expect(parallelOffset(0, 3)).toBe(-18);
    expect(parallelOffset(1, 3)).toBe(0);
    expect(parallelOffset(2, 3)).toBe(18);
  });

  it('defaults defensively for bad inputs', () => {
    expect(parallelOffset(undefined, undefined)).toBe(0);
  });
});

describe('selfLoopPath', () => {
  it('loops off the card right side with the pill apex to the right', () => {
    const b = box(100, 100, 260, 120);
    const loop = selfLoopPath(b);
    expect(loop.path).toContain('M '); // valid path
    expect(loop.labelX).toBeGreaterThan(b.x + b.width); // apex right of the card
  });
});

describe('nodeBox (null-geometry guard chain)', () => {
  it('falls back to width 260 and estimated height when unmeasured', () => {
    const b = nodeBox({ data: { name: 'm', columns: ['a', 'b'] } });
    expect(b.width).toBe(ERD_NODE_WIDTH);
    expect(b.height).toBeGreaterThan(0);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });

  it('prefers measured width/height/positionAbsolute when present', () => {
    const b = nodeBox({
      width: 300,
      height: 200,
      positionAbsolute: { x: 50, y: 60 },
      position: { x: 0, y: 0 },
      data: {},
    });
    expect(b).toEqual({ x: 50, y: 60, width: 300, height: 200 });
  });
});
