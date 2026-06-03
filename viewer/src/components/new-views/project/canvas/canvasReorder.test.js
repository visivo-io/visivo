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

describe('buildLibraryItem', () => {
  test('builds a width-1 item referencing the dropped object by type', () => {
    expect(buildLibraryItem('chart', 'my-chart')).toEqual({ width: 1, chart: 'ref(my-chart)' });
    expect(buildLibraryItem('table', 't1')).toEqual({ width: 1, table: 'ref(t1)' });
  });
  test('returns a bare layout slot when type/name are missing', () => {
    expect(buildLibraryItem(null, null)).toEqual({ width: 1 });
  });
});
