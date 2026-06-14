import { mergeById } from './erdNodeMerge';

const n = (id, x, y, extra = {}) => ({ id, position: { x, y }, data: { name: id }, ...extra });

describe('mergeById (controlled-node reconciliation §6)', () => {
  it('clause 1: keeps a moved (prev) node position over a fresh seed', () => {
    const prev = [n('a', 100, 200)]; // user moved it here
    const seeded = [n('a', 0, 0)]; // hook re-seeded at origin
    const out = mergeById(prev, seeded, {});
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 100, y: 200 });
  });

  it('clause 2: a saved position overlays the prev position', () => {
    const prev = [n('a', 100, 200)];
    const seeded = [n('a', 0, 0)];
    const out = mergeById(prev, seeded, { a: { x: 5, y: 6 } });
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 5, y: 6 });
  });

  it('clause 3: a NEW node takes its fresh seed slot (no prev)', () => {
    const prev = [n('a', 100, 200)];
    const seeded = [n('a', 0, 0), n('b', 300, 0)]; // b is new
    const out = mergeById(prev, seeded, {});
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 100, y: 200 }); // preserved
    expect(out.find(x => x.id === 'b').position).toEqual({ x: 300, y: 0 }); // fresh slot
  });

  it('clause 3: a NEW node with a saved position takes the saved slot', () => {
    const prev = [];
    const seeded = [n('b', 300, 0)];
    const out = mergeById(prev, seeded, { b: { x: 9, y: 9 } });
    expect(out.find(x => x.id === 'b').position).toEqual({ x: 9, y: 9 });
  });

  it('clause 4: drops ids no longer present in seeded (deleted nodes)', () => {
    const prev = [n('a', 1, 1), n('gone', 2, 2)];
    const seeded = [n('a', 0, 0)];
    const out = mergeById(prev, seeded, {});
    expect(out.map(x => x.id)).toEqual(['a']);
  });

  it('the §6 regression: drag a card then add a model — dragged card unmoved, only new takes a slot', () => {
    // User dragged "a" to (400,400); then "c" is added to the project.
    const prev = [n('a', 400, 400), n('b', 0, 0)];
    const seeded = [n('a', 0, 0), n('b', 0, 100), n('c', 300, 0)];
    const out = mergeById(prev, seeded, {});
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 400, y: 400 }); // unmoved
    expect(out.find(x => x.id === 'b').position).toEqual({ x: 0, y: 0 }); // kept prev
    expect(out.find(x => x.id === 'c').position).toEqual({ x: 300, y: 0 }); // fresh slot
  });

  it('carries the LATEST data/type/layoutSize forward (only position is reconciled)', () => {
    const prev = [n('a', 100, 200, { type: 'old', data: { name: 'a', columns: [] } })];
    const seeded = [
      n('a', 0, 0, { type: 'relationEdgeNode', data: { name: 'a', columns: ['new_col'] }, layoutSize: { width: 260, height: 120 } }),
    ];
    const out = mergeById(prev, seeded, {});
    const a = out.find(x => x.id === 'a');
    expect(a.position).toEqual({ x: 100, y: 200 }); // preserved
    expect(a.type).toBe('relationEdgeNode'); // latest type
    expect(a.data.columns).toEqual(['new_col']); // latest data
    expect(a.layoutSize).toEqual({ width: 260, height: 120 }); // latest size
  });

  it('ignores non-finite saved coords (falls back to prev/seed)', () => {
    const prev = [n('a', 100, 200)];
    const seeded = [n('a', 0, 0)];
    const out = mergeById(prev, seeded, { a: { x: NaN, y: 1 } });
    expect(out.find(x => x.id === 'a').position).toEqual({ x: 100, y: 200 });
  });

  it('handles empty prev / empty seeded gracefully', () => {
    expect(mergeById([], [], {})).toEqual([]);
    expect(mergeById(undefined, undefined, undefined)).toEqual([]);
  });
});
