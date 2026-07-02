/**
 * breadcrumbNav pure-helper tests (VIS-804 / Track G G-2).
 *
 * Covers the breadcrumb segment derivation and the keyboard-nav handlers
 * (sibling step ↑/↓, hierarchy step ←/→, reorder ⌘↑/↓, and the immutable
 * reorder applier) against flat AND nested-container selection keys.
 */
import {
  tokenizeOutlineKey,
  tokensToKey,
  buildBreadcrumbSegments,
  computeSiblingKey,
  computeHierarchyKey,
  computeReorder,
  applyReorder,
} from './breadcrumbNav';

const ref = name => '${ref(' + name + ')}';

// A dashboard with two top-level rows; row 0 has a chart + table, row 1 has a
// container item whose nested row holds a markdown.
const ROWS = [
  {
    height: 'medium',
    items: [{ chart: ref('great_fib'), width: 2 }, { table: 'sales_table', width: 1 }],
  },
  {
    height: 'small',
    items: [
      {
        width: 1,
        rows: [{ height: 'medium', items: [{ markdown: 'notes' }] }],
      },
    ],
  },
];

describe('tokenizeOutlineKey / tokensToKey', () => {
  test('dashboard root → no tokens', () => {
    expect(tokenizeOutlineKey('dashboard')).toEqual([]);
    expect(tokenizeOutlineKey(null)).toEqual([]);
    expect(tokensToKey([])).toBe('dashboard');
  });

  test('round-trips flat + nested keys', () => {
    expect(tokenizeOutlineKey('row.1.item.0.row.0.item.0')).toEqual([
      { axis: 'row', index: 1 },
      { axis: 'item', index: 0 },
      { axis: 'row', index: 0 },
      { axis: 'item', index: 0 },
    ]);
    expect(tokensToKey(tokenizeOutlineKey('row.1.item.0'))).toBe('row.1.item.0');
  });
});

describe('buildBreadcrumbSegments', () => {
  test('dashboard selection → single dashboard segment', () => {
    const segs = buildBreadcrumbSegments('dashboard', 'my-dash', ROWS);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ key: 'dashboard', kind: 'dashboard', label: 'my-dash' });
  });

  test('row selection → dashboard ▸ row', () => {
    const segs = buildBreadcrumbSegments('row.0', 'my-dash', ROWS);
    expect(segs.map(s => s.key)).toEqual(['dashboard', 'row.0']);
    expect(segs[1]).toMatchObject({ kind: 'row', type: 'row', label: 'Row 1' });
  });

  test('item selection → dashboard ▸ row ▸ item (leaf name + type)', () => {
    const segs = buildBreadcrumbSegments('row.0.item.0', 'my-dash', ROWS);
    expect(segs.map(s => s.key)).toEqual(['dashboard', 'row.0', 'row.0.item.0']);
    expect(segs[2]).toMatchObject({ kind: 'item', type: 'chart', label: 'great_fib' });
  });

  test('nested container selection → full ancestry chain', () => {
    const key = 'row.1.item.0.row.0.item.0';
    const segs = buildBreadcrumbSegments(key, 'my-dash', ROWS);
    expect(segs.map(s => s.key)).toEqual([
      'dashboard',
      'row.1',
      'row.1.item.0',
      'row.1.item.0.row.0',
      key,
    ]);
    expect(segs[2]).toMatchObject({ kind: 'container', type: 'dashboard' });
    expect(segs[4]).toMatchObject({ kind: 'item', type: 'markdown', label: 'notes' });
  });

  test('stale key past the live config → resolves the valid prefix only', () => {
    const segs = buildBreadcrumbSegments('row.0.item.9', 'my-dash', ROWS);
    // item.9 does not exist → walk stops at the row.
    expect(segs.map(s => s.key)).toEqual(['dashboard', 'row.0']);
  });
});

describe('computeSiblingKey (↑/↓)', () => {
  test('steps among row siblings and wraps', () => {
    expect(computeSiblingKey('row.0', ROWS, 1)).toBe('row.1');
    expect(computeSiblingKey('row.1', ROWS, 1)).toBe('row.0'); // wrap
    expect(computeSiblingKey('row.0', ROWS, -1)).toBe('row.1'); // wrap back
  });

  test('steps among item siblings within a row', () => {
    expect(computeSiblingKey('row.0.item.0', ROWS, 1)).toBe('row.0.item.1');
    expect(computeSiblingKey('row.0.item.1', ROWS, 1)).toBe('row.0.item.0');
  });

  test('dashboard root has no siblings', () => {
    expect(computeSiblingKey('dashboard', ROWS, 1)).toBe('dashboard');
  });

  test('single-child level stays put', () => {
    // row.1 has a single item → no sibling step.
    expect(computeSiblingKey('row.1.item.0', ROWS, 1)).toBe('row.1.item.0');
  });
});

describe('computeHierarchyKey (←/→)', () => {
  test('up steps to the parent', () => {
    expect(computeHierarchyKey('row.0.item.0', ROWS, 'up')).toBe('row.0');
    expect(computeHierarchyKey('row.0', ROWS, 'up')).toBe('dashboard');
    expect(computeHierarchyKey('dashboard', ROWS, 'up')).toBe('dashboard');
  });

  test('down descends into the first child', () => {
    expect(computeHierarchyKey('dashboard', ROWS, 'down')).toBe('row.0');
    expect(computeHierarchyKey('row.0', ROWS, 'down')).toBe('row.0.item.0');
    // container item → first nested row.
    expect(computeHierarchyKey('row.1.item.0', ROWS, 'down')).toBe('row.1.item.0.row.0');
  });

  test('down on a leaf item with no children stays put', () => {
    expect(computeHierarchyKey('row.0.item.0', ROWS, 'down')).toBe('row.0.item.0');
  });
});

describe('computeReorder + applyReorder (⌘↑/↓)', () => {
  test('reorder descriptor clamps at range edges', () => {
    expect(computeReorder('row.0', ROWS, -1)).toBeNull(); // already first
    expect(computeReorder('row.1', ROWS, 1)).toBeNull(); // already last
    expect(computeReorder('dashboard', ROWS, 1)).toBeNull(); // root
  });

  test('swaps top-level rows immutably', () => {
    const op = computeReorder('row.0', ROWS, 1);
    expect(op).toMatchObject({ axis: 'row', parentKey: 'dashboard', fromIndex: 0, toIndex: 1 });
    const next = applyReorder({ rows: ROWS }, op);
    expect(next.rows[0]).toBe(ROWS[1]);
    expect(next.rows[1]).toBe(ROWS[0]);
    // original untouched
    expect(ROWS[0].items[0].chart).toBe(ref('great_fib'));
  });

  test('swaps items within a row', () => {
    const op = computeReorder('row.0.item.1', ROWS, -1);
    expect(op).toMatchObject({ axis: 'item', parentKey: 'row.0', fromIndex: 1, toIndex: 0 });
    const next = applyReorder({ rows: ROWS }, op);
    expect(next.rows[0].items[0].table).toBe('sales_table');
    expect(next.rows[0].items[1].chart).toBe(ref('great_fib'));
  });
});

// A container with MULTIPLE nested sub-rows — the shape the nested keyboard nav
// (sibling step + ⌘-reorder inside a container) operates on.
const MULTI_NESTED_ROWS = [
  { height: 'medium', items: [{ chart: ref('top_chart'), width: 1 }] },
  {
    height: 'small',
    items: [
      {
        width: 1,
        rows: [
          { height: 'small', items: [{ markdown: 'm1' }, { markdown: 'm2' }] },
          { height: 'medium', items: [{ table: 't1' }] },
        ],
      },
    ],
  },
];

describe('nested container rows (multi-sub-row keyboard nav)', () => {
  test('↑/↓ steps among a container’s sub-rows and wraps', () => {
    expect(computeSiblingKey('row.1.item.0.row.0', MULTI_NESTED_ROWS, 1)).toBe(
      'row.1.item.0.row.1'
    );
    // wrap from the last sub-row back to the first
    expect(computeSiblingKey('row.1.item.0.row.1', MULTI_NESTED_ROWS, 1)).toBe(
      'row.1.item.0.row.0'
    );
  });

  test('→ on an empty dashboard stays on the root (nothing to descend into)', () => {
    expect(computeHierarchyKey('dashboard', [], 'down')).toBe('dashboard');
  });

  test('⌘↓ reorders a container’s sub-rows in place, leaving the rest untouched', () => {
    const op = computeReorder('row.1.item.0.row.0', MULTI_NESTED_ROWS, 1);
    expect(op).toMatchObject({
      axis: 'row',
      parentKey: 'row.1.item.0',
      fromIndex: 0,
      toIndex: 1,
    });
    const next = applyReorder({ rows: MULTI_NESTED_ROWS }, op);
    const subRows = next.rows[1].items[0].rows;
    // Sub-rows swapped…
    expect(subRows[0].items[0].table).toBe('t1');
    expect(subRows[1].items[0].markdown).toBe('m1');
    // …the outer structure and the original config are untouched (pure).
    expect(next.rows[0]).toBe(MULTI_NESTED_ROWS[0]);
    expect(MULTI_NESTED_ROWS[1].items[0].rows[0].items[0].markdown).toBe('m1');
  });

  test('⌘↑ reorders items INSIDE a nested sub-row at full depth', () => {
    const key = 'row.1.item.0.row.0.item.1';
    const op = computeReorder(key, MULTI_NESTED_ROWS, -1);
    expect(op).toMatchObject({
      axis: 'item',
      parentKey: 'row.1.item.0.row.0',
      fromIndex: 1,
      toIndex: 0,
    });
    const next = applyReorder({ rows: MULTI_NESTED_ROWS }, op);
    const items = next.rows[1].items[0].rows[0].items;
    expect(items.map(it => it.markdown)).toEqual(['m2', 'm1']);
    // Sibling sub-row untouched.
    expect(next.rows[1].items[0].rows[1].items[0].table).toBe('t1');
  });

  test('applyReorder is a safe no-op when the path no longer resolves', () => {
    const config = { rows: MULTI_NESTED_ROWS };
    // Parent row past the live config.
    const stale = applyReorder(config, {
      axis: 'item',
      parentKey: 'row.9',
      fromIndex: 0,
      toIndex: 1,
    });
    expect(stale.rows).toEqual(MULTI_NESTED_ROWS);
    // Nested parent item past the live config.
    const staleDeep = applyReorder(config, {
      axis: 'row',
      parentKey: 'row.1.item.9',
      fromIndex: 0,
      toIndex: 1,
    });
    expect(staleDeep.rows).toEqual(MULTI_NESTED_ROWS);
    // No config / no op → unchanged input.
    expect(applyReorder(null, { axis: 'row' })).toBeNull();
    expect(applyReorder(config, null)).toBe(config);
  });
});
