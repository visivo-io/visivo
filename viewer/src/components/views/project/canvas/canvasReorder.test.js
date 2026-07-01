/**
 * canvasReorder tests (VIS-771 / Track D D-3).
 *
 * The pure config transforms backing the canvas drag-and-drop gestures. dnd-kit
 * pointer drags can't run in jsdom, so the geometry/wiring is exercised by the
 * Playwright story; here we lock the (immutable) reshape logic at every nesting
 * depth + drop intent.
 */
import {
  parseCanvasPath,
  reorderItemsInRow,
  reorderTopLevelRows,
  insertItemAtTarget,
  buildLibraryItem,
  smallestWidthInRow,
  ROW_TEMPLATES,
  buildTemplateRow,
  insertRowAtIndex,
  setItemRef,
  removeItemAtPath,
  moveItemBetweenRows,
  moveItemIntoSlot,
} from './canvasReorder';

const config = () => ({
  rows: [
    {
      height: 'medium',
      items: [
        { width: 6, chart: 'ref(a)' },
        { width: 3, table: 'ref(b)' },
        { width: 3, markdown: 'ref(c)' },
      ],
    },
    {
      height: 'small',
      items: [{ width: 12, chart: 'ref(d)' }],
    },
  ],
});

const names = items => items.map(it => it.chart || it.table || it.markdown || it.input);

describe('parseCanvasPath', () => {
  test('parses a top-level row path', () => {
    expect(parseCanvasPath('row.2')).toEqual([{ kind: 'row', index: 2 }]);
  });
  test('parses an item path', () => {
    expect(parseCanvasPath('row.0.item.1')).toEqual([
      { kind: 'row', index: 0 },
      { kind: 'item', index: 1 },
    ]);
  });
  test('parses a nested path', () => {
    expect(parseCanvasPath('row.0.item.1.row.2.item.0')).toEqual([
      { kind: 'row', index: 0 },
      { kind: 'item', index: 1 },
      { kind: 'row', index: 2 },
      { kind: 'item', index: 0 },
    ]);
  });
  test('returns [] for the dashboard chrome key and malformed input', () => {
    expect(parseCanvasPath('dashboard')).toEqual([]);
    expect(parseCanvasPath('')).toEqual([]);
    expect(parseCanvasPath('row.x')).toEqual([]);
    expect(parseCanvasPath(null)).toEqual([]);
  });
});

describe('reorderItemsInRow', () => {
  test('moves an item earlier in its row (immutably)', () => {
    const before = config();
    const after = reorderItemsInRow(before, 'row.0', 2, 0);
    expect(names(after.rows[0].items)).toEqual(['ref(c)', 'ref(a)', 'ref(b)']);
    // Input is never mutated.
    expect(names(before.rows[0].items)).toEqual(['ref(a)', 'ref(b)', 'ref(c)']);
    // Untouched row is preserved.
    expect(after.rows[1]).toBe(before.rows[1]);
  });

  test('moves an item later in its row', () => {
    const after = reorderItemsInRow(config(), 'row.0', 0, 2);
    expect(names(after.rows[0].items)).toEqual(['ref(b)', 'ref(c)', 'ref(a)']);
  });

  test('a no-op (from === to) returns the same config reference', () => {
    const before = config();
    expect(reorderItemsInRow(before, 'row.0', 1, 1)).toBe(before);
  });

  test('reorders within a nested row container', () => {
    const nested = {
      rows: [
        {
          items: [
            {
              width: 12,
              rows: [{ items: [{ chart: 'ref(x)' }, { chart: 'ref(y)' }] }],
            },
          ],
        },
      ],
    };
    const after = reorderItemsInRow(nested, 'row.0.item.0.row.0', 0, 1);
    expect(names(after.rows[0].items[0].rows[0].items)).toEqual(['ref(y)', 'ref(x)']);
  });
});

describe('moveItemBetweenRows (VIS-973 cross-row move)', () => {
  test('moves an item to the end of another row, preserving its width', () => {
    const after = moveItemBetweenRows(config(), 'row.0', 0, { kind: 'end-of-row', rowPath: 'row.1' });
    expect(names(after.rows[0].items)).toEqual(['ref(b)', 'ref(c)']);
    expect(names(after.rows[1].items)).toEqual(['ref(d)', 'ref(a)']);
    // 'a' kept its own width (6), not the destination row's.
    expect(after.rows[1].items[1].width).toBe(6);
  });

  test('moves an item to a between-items position in another row', () => {
    const after = moveItemBetweenRows(config(), 'row.0', 2, {
      kind: 'between-items',
      rowPath: 'row.1',
      index: 0,
    });
    expect(names(after.rows[0].items)).toEqual(['ref(a)', 'ref(b)']);
    expect(names(after.rows[1].items)).toEqual(['ref(c)', 'ref(d)']);
  });

  test('moves an item into a NESTED sub-row', () => {
    const nested = {
      rows: [
        { height: 'medium', items: [{ width: 6, chart: 'ref(a)' }] },
        {
          height: 'medium',
          items: [{ width: 6, rows: [{ height: 'small', items: [{ width: 12, table: 'ref(n)' }] }] }],
        },
      ],
    };
    const after = moveItemBetweenRows(nested, 'row.0', 0, {
      kind: 'end-of-row',
      rowPath: 'row.1.item.0.row.0',
    });
    expect(names(after.rows[0].items)).toEqual([]);
    expect(names(after.rows[1].items[0].rows[0].items)).toEqual(['ref(n)', 'ref(a)']);
  });

  test('is a no-op for a same-row target, a missing item, or a non-row target', () => {
    const c = config();
    expect(moveItemBetweenRows(c, 'row.0', 0, { kind: 'end-of-row', rowPath: 'row.0' })).toBe(c);
    expect(moveItemBetweenRows(c, 'row.0', 9, { kind: 'end-of-row', rowPath: 'row.1' })).toBe(c);
    expect(moveItemBetweenRows(c, 'row.0', 0, { kind: 'between-rows', index: 0 })).toBe(c);
  });
});

describe('moveItemIntoSlot (VIS-989 fill an empty slot)', () => {
  // row 0: [chart a, EMPTY slot, table c]; row 1: [chart d]
  const slotConfig = () => ({
    rows: [
      {
        height: 'medium',
        items: [{ width: 6, chart: 'ref(a)' }, { width: 3 }, { width: 3, table: 'ref(c)' }],
      },
      { height: 'small', items: [{ width: 12, chart: 'ref(d)' }] },
    ],
  });

  test('fills an empty slot in another row with the dragged item (a move)', () => {
    // Drag row.1 item 0 (chart d) onto row.0's empty slot at index 1.
    const after = moveItemIntoSlot(slotConfig(), 'row.1', 0, 'row.0.item.1');
    // The empty slot is now the moved item; the source row keeps its remaining
    // (here: re-seeded by sanitize elsewhere — the helper leaves it empty).
    expect(names(after.rows[0].items)).toEqual(['ref(a)', 'ref(d)', 'ref(c)']);
    expect(after.rows[0].items[1].chart).toBe('ref(d)');
    // The moved item kept its own width (12), the slot's width (3) is discarded.
    expect(after.rows[0].items[1].width).toBe(12);
    expect(after.rows[1].items).toEqual([]); // source emptied (sanitize re-seeds)
  });

  test('fills an empty slot within the SAME row (index shift handled)', () => {
    // Drag row.0 item 0 (chart a) onto the empty slot at index 1 in the same row.
    const after = moveItemIntoSlot(slotConfig(), 'row.0', 0, 'row.0.item.1');
    // After removing index 0, the slot shifts to index 0 and is filled with a.
    expect(names(after.rows[0].items)).toEqual(['ref(a)', 'ref(c)']);
    expect(after.rows[0].items[0].chart).toBe('ref(a)');
  });

  test('is a no-op when the target is NOT an empty slot', () => {
    const c = slotConfig();
    // row.0 item.0 is a chart (filled), not an empty slot.
    expect(moveItemIntoSlot(c, 'row.1', 0, 'row.0.item.0')).toBe(c);
  });

  test('is a no-op for a missing source item or the slot dragged onto itself', () => {
    const c = slotConfig();
    expect(moveItemIntoSlot(c, 'row.1', 9, 'row.0.item.1')).toBe(c);
    // Dragging the empty slot onto itself.
    expect(moveItemIntoSlot(c, 'row.0', 1, 'row.0.item.1')).toBe(c);
  });
});

describe('reorderTopLevelRows', () => {
  test('swaps two top-level rows', () => {
    const after = reorderTopLevelRows(config(), 1, 0);
    expect(after.rows[0].height).toBe('small');
    expect(after.rows[1].height).toBe('medium');
  });
  test('a no-op returns the same reference', () => {
    const before = config();
    expect(reorderTopLevelRows(before, 0, 0)).toBe(before);
  });
});

describe('insertItemAtTarget', () => {
  test('between-items splices into the target row at the index', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'between-items', rowPath: 'row.0', index: 1 },
      { width: 1, chart: 'ref(new)' }
    );
    expect(names(after.rows[0].items)).toEqual(['ref(a)', 'ref(new)', 'ref(b)', 'ref(c)']);
  });

  test('end-of-row appends to the target row', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'end-of-row', rowPath: 'row.1' },
      { width: 1, table: 'ref(new)' }
    );
    expect(names(after.rows[1].items)).toEqual(['ref(d)', 'ref(new)']);
  });

  test('between-rows wraps the new item in a new top-level row at the index', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'between-rows', index: 1 },
      { width: 1, chart: 'ref(new)' }
    );
    expect(after.rows).toHaveLength(3);
    expect(after.rows[1].items).toHaveLength(1);
    expect(after.rows[1].items[0].chart).toBe('ref(new)');
    expect(after.rows[1].height).toBe('medium');
    // Existing rows shifted down.
    expect(after.rows[2].height).toBe('small');
  });

  test('between-rows at the end appends a new row', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'between-rows', index: 2 },
      { width: 1, chart: 'ref(new)' }
    );
    expect(after.rows).toHaveLength(3);
    expect(after.rows[2].items[0].chart).toBe('ref(new)');
  });

  test('in-container appends a sub-row to the container item', () => {
    const withContainer = {
      rows: [
        {
          items: [{ width: 12, rows: [{ items: [{ chart: 'ref(x)' }] }] }],
        },
      ],
    };
    const after = insertItemAtTarget(
      withContainer,
      { kind: 'in-container', itemPath: 'row.0.item.0' },
      { width: 1, chart: 'ref(new)' }
    );
    expect(after.rows[0].items[0].rows).toHaveLength(2);
    expect(after.rows[0].items[0].rows[1].items[0].chart).toBe('ref(new)');
  });

  test('unrecognised target returns the config unchanged', () => {
    const before = config();
    expect(insertItemAtTarget(before, { kind: 'nope' }, {})).toBe(before);
  });
});

describe('smallestWidthInRow (VIS-901 #4 smart width)', () => {
  test('returns the smallest item width in the target row', () => {
    expect(smallestWidthInRow(config(), 'row.0')).toBe(3); // 6/3/3 → 3
    expect(smallestWidthInRow(config(), 'row.1')).toBe(12); // single 12-wide slot
  });
  test('treats a missing width as 1', () => {
    const cfg = { rows: [{ items: [{ chart: 'ref(a)' }, { width: 4 }] }] };
    expect(smallestWidthInRow(cfg, 'row.0')).toBe(1);
  });
  test('returns 1 for an empty / unknown row', () => {
    expect(smallestWidthInRow({ rows: [{ items: [] }] }, 'row.0')).toBe(1);
    expect(smallestWidthInRow(config(), 'row.9')).toBe(1);
  });
  test('reads a nested row path', () => {
    const cfg = {
      rows: [{ items: [{ width: 6, rows: [{ items: [{ width: 2 }, { width: 5 }] }] }] }],
    };
    expect(smallestWidthInRow(cfg, 'row.0.item.0.row.0')).toBe(2);
  });
});

describe('insertItemAtTarget — smart width (VIS-901 #4)', () => {
  test('between-items default width = smallest item width in the row', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'between-items', rowPath: 'row.0', index: 1 },
      buildLibraryItem('chart', 'x')
    );
    // row.0 widths are 6/3/3 → smallest 3, so the new item inserts at width 3.
    expect(after.rows[0].items[1]).toEqual({ width: 3, chart: 'ref(x)' });
  });

  test('all-width-1 row stays width 1 on insert', () => {
    const cfg = { rows: [{ items: [{ width: 1, chart: 'ref(a)' }, { width: 1, chart: 'ref(b)' }] }] };
    const after = insertItemAtTarget(
      cfg,
      { kind: 'end-of-row', rowPath: 'row.0' },
      buildLibraryItem('table', 't')
    );
    expect(after.rows[0].items[2]).toEqual({ width: 1, table: 'ref(t)' });
  });

  test('an explicit caller width is preserved (not overridden by smart width)', () => {
    const after = insertItemAtTarget(
      config(),
      { kind: 'end-of-row', rowPath: 'row.0' },
      { width: 8, chart: 'ref(big)' }
    );
    expect(after.rows[0].items[3]).toEqual({ width: 8, chart: 'ref(big)' });
  });
});

describe('insertItemAtTarget — on-item slot drop (VIS-901 #4)', () => {
  test('filling an EMPTY slot in place preserves the slot width', () => {
    const cfg = { rows: [{ items: [{ width: 4 }, { width: 8, chart: 'ref(a)' }] }] };
    const after = insertItemAtTarget(
      cfg,
      { kind: 'on-item', rowPath: 'row.0', index: 0 },
      buildLibraryItem('chart', 'new')
    );
    expect(after.rows[0].items).toHaveLength(2); // no new slot — filled in place
    expect(after.rows[0].items[0]).toEqual({ width: 4, chart: 'ref(new)' });
  });

  test('dropping onto a FILLED slot inserts a new item before it (smart width)', () => {
    const cfg = { rows: [{ items: [{ width: 6, chart: 'ref(a)' }, { width: 6, chart: 'ref(b)' }] }] };
    const after = insertItemAtTarget(
      cfg,
      { kind: 'on-item', rowPath: 'row.0', index: 1 },
      buildLibraryItem('table', 't')
    );
    expect(after.rows[0].items).toHaveLength(3);
    // Smart width = smallest in row (6); new item lands before index 1.
    expect(after.rows[0].items[1]).toEqual({ width: 6, table: 'ref(t)' });
    expect(after.rows[0].items[2]).toEqual({ width: 6, chart: 'ref(b)' });
  });

  test('input is never mutated', () => {
    const before = { rows: [{ items: [{ width: 2 }] }] };
    insertItemAtTarget(before, { kind: 'on-item', rowPath: 'row.0', index: 0 }, buildLibraryItem('chart', 'z'));
    expect(before.rows[0].items[0]).toEqual({ width: 2 });
  });
});

describe('buildLibraryItem', () => {
  test('builds a width-1 item referencing the dropped object by type', () => {
    expect(buildLibraryItem('chart', 'my-chart')).toEqual({ width: 1, chart: 'ref(my-chart)' });
    expect(buildLibraryItem('table', 't1')).toEqual({ width: 1, table: 'ref(t1)' });
  });
  test('returns a bare layout slot when type/name are missing', () => {
    expect(buildLibraryItem(null, null)).toEqual({ width: 1 });
  });
});

describe('buildTemplateRow (VIS-794 / D-7)', () => {
  test('exposes the five D-7 templates', () => {
    expect(ROW_TEMPLATES.map(t => t.key)).toEqual(['blank', 'kpi', '2up', '3up', 'mix']);
  });

  test('blank → one full-width empty slot', () => {
    expect(buildTemplateRow('blank')).toEqual({ height: 'medium', items: [{ width: 12 }] });
  });

  test('kpi → four equal narrow empty slots', () => {
    const row = buildTemplateRow('kpi');
    expect(row.items).toHaveLength(4);
    expect(row.items.every(it => it.width === 3)).toBe(true);
    // Empty slots carry NO leaf ref — backend-valid after sanitize.
    expect(row.items.every(it => Object.keys(it).length === 1)).toBe(true);
  });

  test('2up / 3up / mix produce the expected slot widths', () => {
    expect(buildTemplateRow('2up').items.map(i => i.width)).toEqual([6, 6]);
    expect(buildTemplateRow('3up').items.map(i => i.width)).toEqual([4, 4, 4]);
    expect(buildTemplateRow('mix').items.map(i => i.width)).toEqual([8, 4]);
  });

  test('unknown template key returns null', () => {
    expect(buildTemplateRow('nope')).toBeNull();
    expect(buildTemplateRow(undefined)).toBeNull();
  });
});

describe('insertRowAtIndex (VIS-794 / D-7)', () => {
  const row = () => ({ height: 'medium', items: [{ width: 12 }] });

  test('inserts a row at the given index (immutably)', () => {
    const before = config();
    const after = insertRowAtIndex(before, 1, row());
    expect(after).not.toBe(before);
    expect(before.rows).toHaveLength(2); // input untouched
    expect(after.rows).toHaveLength(3);
    expect(after.rows[1]).toEqual(row());
    // Surrounding rows preserved in order.
    expect(names(after.rows[0].items)).toEqual(names(before.rows[0].items));
    expect(names(after.rows[2].items)).toEqual(names(before.rows[1].items));
  });

  test('clamps an out-of-range index to append / prepend', () => {
    const before = config();
    expect(insertRowAtIndex(before, 999, row()).rows).toHaveLength(3);
    expect(insertRowAtIndex(before, 999, row()).rows[2]).toEqual(row());
    expect(insertRowAtIndex(before, -5, row()).rows[0]).toEqual(row());
  });

  test('seeds rows on an empty / rows-less config (D-8 empty canvas)', () => {
    expect(insertRowAtIndex({}, 0, row()).rows).toEqual([row()]);
    expect(insertRowAtIndex(null, 0, row()).rows).toEqual([row()]);
    expect(insertRowAtIndex({ rows: [] }, 0, row()).rows).toEqual([row()]);
  });

  test('a falsy row returns the config unchanged', () => {
    const before = config();
    expect(insertRowAtIndex(before, 0, null)).toBe(before);
  });
});

// ── Nested rows/items (VIS-903) ─────────────────────────────────────────────
// A config with a container item holding two sub-rows, exercised by the nested
// reorder + insert paths.
const nestedConfig = () => ({
  rows: [
    {
      height: 'large',
      items: [
        { width: 2, chart: 'ref(top0)' },
        {
          width: 1,
          rows: [
            { height: 'small', items: [{ width: 1, chart: 'ref(n0)' }] },
            { height: 'small', items: [{ width: 1, table: 'ref(n1)' }] },
            { height: 'small', items: [{ width: 1, markdown: 'ref(n2)' }] },
          ],
        },
      ],
    },
  ],
});

const subRowLeaf = (config, ri) =>
  names(config.rows[0].items[1].rows[ri].items);

describe('parseNestedRowPath (VIS-903)', () => {
  const { parseNestedRowPath } = require('./canvasReorder');
  test('parses a nested row path into containerPath + rowIndex', () => {
    expect(parseNestedRowPath('row.0.item.1.row.2')).toEqual({
      containerPath: 'row.0.item.1',
      rowIndex: 2,
    });
  });
  test('parses a deeply nested row path', () => {
    expect(parseNestedRowPath('row.0.item.1.row.0.item.0.row.1')).toEqual({
      containerPath: 'row.0.item.1.row.0.item.0',
      rowIndex: 1,
    });
  });
  test('returns null for a top-level row path', () => {
    expect(parseNestedRowPath('row.0')).toBeNull();
  });
  test('returns null for an item path or malformed input', () => {
    expect(parseNestedRowPath('row.0.item.1')).toBeNull();
    expect(parseNestedRowPath('dashboard')).toBeNull();
    expect(parseNestedRowPath('')).toBeNull();
  });
});

describe('reorderRowsInContainer (VIS-903)', () => {
  const { reorderRowsInContainer } = require('./canvasReorder');
  test('reorders sibling sub-rows of a container item', () => {
    const before = nestedConfig();
    const after = reorderRowsInContainer(before, 'row.0.item.1', 0, 2);
    // n0 sub-row moves to the end.
    expect(subRowLeaf(after, 0)).toEqual(['ref(n1)']);
    expect(subRowLeaf(after, 1)).toEqual(['ref(n2)']);
    expect(subRowLeaf(after, 2)).toEqual(['ref(n0)']);
  });
  test('is immutable — returns a new config, leaves the original intact', () => {
    const before = nestedConfig();
    const snapshot = JSON.stringify(before);
    const after = reorderRowsInContainer(before, 'row.0.item.1', 1, 0);
    expect(after).not.toBe(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
  test('no-op for from===to or invalid path', () => {
    const before = nestedConfig();
    expect(reorderRowsInContainer(before, 'row.0.item.1', 1, 1)).toBe(before);
    expect(reorderRowsInContainer(before, 'row.0', 0, 1)).toBe(before);
  });
});

describe('insertItemAtTarget — nested between-rows (VIS-903)', () => {
  test('inserts a new sub-row into a container at the given index', () => {
    const before = nestedConfig();
    const item = buildLibraryItem('chart', 'fresh');
    const after = insertItemAtTarget(
      before,
      { kind: 'between-rows', index: 1, containerPath: 'row.0.item.1' },
      item
    );
    const subRows = after.rows[0].items[1].rows;
    expect(subRows).toHaveLength(4);
    expect(names(subRows[1].items)).toEqual(['ref(fresh)']);
    // Siblings preserved around the inserted row.
    expect(names(subRows[0].items)).toEqual(['ref(n0)']);
    expect(names(subRows[2].items)).toEqual(['ref(n1)']);
  });
  test('appends a sub-row when the index equals the sibling count', () => {
    const before = nestedConfig();
    const after = insertItemAtTarget(
      before,
      { kind: 'between-rows', index: 3, containerPath: 'row.0.item.1' },
      buildLibraryItem('chart', 'tail')
    );
    const subRows = after.rows[0].items[1].rows;
    expect(subRows).toHaveLength(4);
    expect(names(subRows[3].items)).toEqual(['ref(tail)']);
  });
  test('leaves top-level between-rows behaviour unchanged when no containerPath', () => {
    const before = nestedConfig();
    const after = insertItemAtTarget(
      before,
      { kind: 'between-rows', index: 0 },
      buildLibraryItem('chart', 'newtop')
    );
    expect(after.rows).toHaveLength(2);
    expect(names(after.rows[0].items)).toEqual(['ref(newtop)']);
  });
});

// ── Wrap-in-container helpers (VIS-781 / D-5) ───────────────────────────────
describe('wrapItemInContainer / unwrap / add (VIS-781)', () => {
  const {
    wrapItemInContainer,
    unwrapTrivialContainer,
    isTriviallyWrappedContainer,
    addRowInsideContainer,
    addItemToRow,
  } = require('./canvasReorder');

  test('wraps a leaf item into a single-row container, inheriting its width', () => {
    const before = config();
    const after = wrapItemInContainer(before, 'row.0.item.0');
    const wrapped = after.rows[0].items[0];
    expect(Array.isArray(wrapped.rows)).toBe(true);
    expect(wrapped.width).toBe(6); // inherited from the original leaf
    expect(wrapped.rows).toHaveLength(1);
    expect(wrapped.rows[0].items).toHaveLength(1);
    // The inner item is the original leaf, sans its own width.
    expect(wrapped.rows[0].items[0].chart).toBe('ref(a)');
    expect(wrapped.rows[0].items[0].width).toBeUndefined();
  });

  test('wrapping is immutable', () => {
    const before = config();
    const snapshot = JSON.stringify(before);
    wrapItemInContainer(before, 'row.0.item.0');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('wraps a NESTED leaf at any depth', () => {
    const before = wrapItemInContainer(config(), 'row.0.item.0');
    // row.0.item.0 is now a container; wrap its inner leaf.
    const after = wrapItemInContainer(before, 'row.0.item.0.row.0.item.0');
    const innerContainer = after.rows[0].items[0].rows[0].items[0];
    expect(Array.isArray(innerContainer.rows)).toBe(true);
    expect(innerContainer.rows[0].items[0].chart).toBe('ref(a)');
  });

  test('wrapping a container is a no-op (only leaves wrap)', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    expect(wrapItemInContainer(wrapped, 'row.0.item.0')).toBe(wrapped);
  });

  test('isTriviallyWrappedContainer: true for 1×1, false for leaf / multi', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    expect(isTriviallyWrappedContainer(wrapped, 'row.0.item.0')).toBe(true);
    expect(isTriviallyWrappedContainer(config(), 'row.0.item.0')).toBe(false);
    const withExtraRow = addRowInsideContainer(wrapped, 'row.0.item.0');
    expect(isTriviallyWrappedContainer(withExtraRow, 'row.0.item.0')).toBe(false);
  });

  test('unwrap restores the inner leaf and its width on a trivial container', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    const after = unwrapTrivialContainer(wrapped, 'row.0.item.0');
    const item = after.rows[0].items[0];
    expect(item.chart).toBe('ref(a)');
    expect(item.width).toBe(6);
    expect(item.rows).toBeUndefined();
  });

  test('unwrap is a no-op on a non-trivial container', () => {
    const wrapped = addRowInsideContainer(
      wrapItemInContainer(config(), 'row.0.item.0'),
      'row.0.item.0'
    );
    expect(unwrapTrivialContainer(wrapped, 'row.0.item.0')).toBe(wrapped);
  });

  test('addRowInsideContainer appends an empty sub-row to the container', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    const after = addRowInsideContainer(wrapped, 'row.0.item.0');
    expect(after.rows[0].items[0].rows).toHaveLength(2);
    expect(after.rows[0].items[0].rows[1].items).toEqual([{ width: 1 }]);
  });

  test('addRowInsideContainer is a no-op on a leaf', () => {
    const before = config();
    expect(addRowInsideContainer(before, 'row.0.item.0')).toBe(before);
  });

  test('addItemToRow appends an empty slot to a top-level row', () => {
    const before = config();
    const after = addItemToRow(before, 'row.1');
    expect(after.rows[1].items).toHaveLength(2);
    expect(after.rows[1].items[1]).toEqual({ width: 12 }); // smart width = smallest in row
  });

  test('addItemToRow works on a nested row', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    const after = addItemToRow(wrapped, 'row.0.item.0.row.0');
    expect(after.rows[0].items[0].rows[0].items).toHaveLength(2);
  });

  test('5-levels-deep wrap renders without error (no depth limit, Q12)', () => {
    let cfg = config();
    let path = 'row.0.item.0';
    for (let i = 0; i < 5; i += 1) {
      cfg = wrapItemInContainer(cfg, path);
      path = `${path}.row.0.item.0`;
    }
    // Walk down 5 container levels to the original leaf.
    let node = cfg.rows[0].items[0];
    for (let i = 0; i < 5; i += 1) {
      expect(Array.isArray(node.rows)).toBe(true);
      node = node.rows[0].items[0];
    }
    expect(node.chart).toBe('ref(a)');
  });
});

// ── Broken-ref repair helpers (VIS-792 / Track L L-1) ───────────────────────
const { wrapItemInContainer, addItemToRow } = require('./canvasReorder');

describe('setItemRef (VIS-792)', () => {
  test('re-points a leaf to a new ref of the same type, preserving width', () => {
    const after = setItemRef(config(), 'row.0.item.0', 'chart', 'new_chart');
    expect(after.rows[0].items[0]).toEqual({ width: 6, chart: 'ref(new_chart)' });
  });

  test('re-points a leaf to a DIFFERENT type, clearing the stale leaf field', () => {
    const after = setItemRef(config(), 'row.0.item.0', 'table', 'new_table');
    const item = after.rows[0].items[0];
    expect(item.chart).toBeUndefined();
    expect(item.table).toBe('ref(new_table)');
    expect(item.width).toBe(6);
  });

  test('works at any nesting depth', () => {
    const wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    const after = setItemRef(wrapped, 'row.0.item.0.row.0.item.0', 'markdown', 'note');
    expect(after.rows[0].items[0].rows[0].items[0].markdown).toBe('ref(note)');
  });

  test('no-op for an invalid type or missing name', () => {
    const cfg = config();
    expect(setItemRef(cfg, 'row.0.item.0', 'bogus', 'x')).toBe(cfg);
    expect(setItemRef(cfg, 'row.0.item.0', 'chart', '')).toBe(cfg);
    expect(setItemRef(cfg, 'row.9.item.9', 'chart', 'x')).toBe(cfg);
  });

  test('is immutable (does not mutate the input config)', () => {
    const cfg = config();
    const snapshot = JSON.stringify(cfg);
    setItemRef(cfg, 'row.0.item.0', 'chart', 'new_chart');
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});

describe('removeItemAtPath (VIS-792)', () => {
  test('removes a top-level item from its row', () => {
    const after = removeItemAtPath(config(), 'row.0.item.1');
    expect(names(after.rows[0].items)).toEqual(['ref(a)', 'ref(c)']);
  });

  test('removes a nested item at depth', () => {
    let wrapped = wrapItemInContainer(config(), 'row.0.item.0');
    wrapped = addItemToRow(wrapped, 'row.0.item.0.row.0');
    expect(wrapped.rows[0].items[0].rows[0].items).toHaveLength(2);
    const after = removeItemAtPath(wrapped, 'row.0.item.0.row.0.item.1');
    expect(after.rows[0].items[0].rows[0].items).toHaveLength(1);
  });

  test('no-op for an invalid path', () => {
    const cfg = config();
    expect(removeItemAtPath(cfg, 'row.9.item.9')).toBe(cfg);
    expect(removeItemAtPath(cfg, 'row.0')).toBe(cfg);
  });

  test('is immutable (does not mutate the input config)', () => {
    const cfg = config();
    const snapshot = JSON.stringify(cfg);
    removeItemAtPath(cfg, 'row.0.item.1');
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});
