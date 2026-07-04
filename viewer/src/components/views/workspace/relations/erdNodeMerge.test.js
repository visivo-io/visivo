import { mergeById } from './erdNodeMerge';

const n = (id, x, y, extra = {}) => ({ id, position: { x, y }, data: { name: id }, ...extra });

describe('mergeById (controlled-node reconciliation §6)', () => {
  it('clause 1: a SAVED (user-moved) node keeps its saved position over a fresh seed', () => {
    const prev = [n('a', 100, 200)];
    const seeded = [n('a', 0, 0)]; // hook re-seeded at origin
    const out = mergeById(prev, seeded, { a: { x: 100, y: 200 } });
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 100, y: 200 });
  });

  it('clause 1: a saved position wins even for a brand-new node (no prev)', () => {
    const out = mergeById([], [n('a', 0, 0)], { a: { x: 5, y: 6 } });
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 5, y: 6 });
  });

  it('clause 2: an UN-saved node adopts the FRESH seed on re-layout (re-pack)', () => {
    // Columns hydrated → the card grew → the engine re-packed it to a new slot.
    // An un-moved (un-saved) card must follow the fresh seed, else a stale-height
    // slot freezes and a taller neighbour overlaps it.
    const prev = [n('a', 0, 0)];
    const seeded = [n('a', 0, 300)]; // re-packed lower
    const out = mergeById(prev, seeded, {});
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 0, y: 300 });
  });

  it('clause 3: a NEW node takes its fresh seed slot (no prev, not saved)', () => {
    const prev = [n('a', 0, 0)];
    const seeded = [n('a', 0, 0), n('b', 300, 0)]; // b is new
    const out = mergeById(prev, seeded, {});
    expect(out.find(x => x.id === 'b').position).toEqual({ x: 300, y: 0 });
  });

  it('clause 4: drops ids no longer present in seeded (deleted nodes)', () => {
    const prev = [n('a', 1, 1), n('gone', 2, 2)];
    const seeded = [n('a', 0, 0)];
    const out = mergeById(prev, seeded, {});
    expect(out.map(x => x.id)).toEqual(['a']);
  });

  it('the §6 regression: drag a card (saved) then add a model — dragged card stays, new takes a slot', () => {
    // User dragged "a" to (400,400) — persisted to savedPositions on drag-stop;
    // then "c" is added to the project (re-seed).
    const prev = [n('a', 400, 400), n('b', 0, 0)];
    const seeded = [n('a', 0, 0), n('b', 0, 100), n('c', 300, 0)];
    const out = mergeById(prev, seeded, { a: { x: 400, y: 400 } });
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 400, y: 400 }); // saved → kept
    expect(out.find(x => x.id === 'b').position).toEqual({ x: 0, y: 100 }); // un-saved → fresh seed
    expect(out.find(x => x.id === 'c').position).toEqual({ x: 300, y: 0 }); // fresh slot
  });

  it('carries the LATEST data/type/layoutSize forward for a saved (preserved) node', () => {
    const prev = [n('a', 100, 200, { type: 'old', data: { name: 'a', columns: [] } })];
    const seeded = [
      n('a', 0, 0, { type: 'relationEdgeNode', data: { name: 'a', columns: ['new_col'] }, layoutSize: { width: 260, height: 120 } }),
    ];
    const out = mergeById(prev, seeded, { a: { x: 100, y: 200 } });
    const a = out.find(x => x.id === 'a');
    expect(a.position).toEqual({ x: 100, y: 200 }); // saved → preserved
    expect(a.type).toBe('relationEdgeNode'); // latest type
    expect(a.data.columns).toEqual(['new_col']); // latest data
    expect(a.layoutSize).toEqual({ width: 260, height: 120 }); // latest size
  });

  it('ignores non-finite saved coords (an un-moved node then takes the fresh seed)', () => {
    const prev = [n('a', 100, 200)];
    const seeded = [n('a', 7, 8)];
    const out = mergeById(prev, seeded, { a: { x: NaN, y: 1 } });
    // Non-finite saved → not treated as a move → un-saved node adopts the seed.
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 7, y: 8 });
  });

  it('PRESERVES the RF-measured width/height across a re-seed (else nodes hide)', () => {
    // RF wrote width/height onto the controlled node after measuring it. The
    // re-seed from the layout output carries NONE — if mergeById dropped the
    // measured dims, RF would mark the node unmeasured and hide it permanently
    // (the ResizeObserver never re-fires on an unchanged size). The measured
    // fields must survive.
    const prev = [
      n('a', 0, 0, { width: 191, height: 124, positionAbsolute: { x: 0, y: 0 } }),
    ];
    const seeded = [n('a', 0, 0, { layoutSize: { width: 260, height: 130 } })]; // no width/height
    const a = mergeById(prev, seeded, {}).find(x => x.id === 'a');
    expect(a.width).toBe(191);
    expect(a.height).toBe(124);
    expect(a.positionAbsolute).toEqual({ x: 0, y: 0 });
    // ...while still adopting the latest seeded layoutSize.
    expect(a.layoutSize).toEqual({ width: 260, height: 130 });
  });

  it('a brand-new node has no measured dims to carry (RF measures it on mount)', () => {
    const out = mergeById([], [n('b', 5, 5)], {});
    const b = out.find(x => x.id === 'b');
    expect(b.width).toBeUndefined();
    expect(b.height).toBeUndefined();
  });

  it('handles empty prev / empty seeded gracefully', () => {
    expect(mergeById([], [], {})).toEqual([]);
    expect(mergeById(undefined, undefined, undefined)).toEqual([]);
  });
});
