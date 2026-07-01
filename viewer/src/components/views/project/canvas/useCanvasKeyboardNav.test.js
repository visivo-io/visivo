/**
 * useCanvasKeyboardNav pure-helper tests (VIS-790 / Track D D-7).
 *
 * The hook itself is exercised via the component test (CanvasKeyboardLayer);
 * here we lock the pure announcement + Tab-cycle helpers it exports, which are
 * the canvas-specific additions on top of the shared breadcrumbNav model.
 */
import { announceSelection, computeTabKey } from './useCanvasKeyboardNav';

const rows = () => [
  {
    height: 'medium',
    items: [
      { width: 6, chart: 'ref(a)' },
      { width: 6, table: 'ref(b)' },
    ],
  },
  { height: 'small', items: [{ width: 12, chart: 'ref(c)' }] },
];

const nestedRows = () => [
  {
    items: [
      { width: 2, chart: 'ref(top0)' },
      {
        width: 1,
        rows: [
          { items: [{ chart: 'ref(n0)' }, { table: 'ref(n1)' }] },
          { items: [{ markdown: 'ref(n2)' }] },
        ],
      },
    ],
  },
];

describe('announceSelection (VIS-790)', () => {
  test('dashboard root', () => {
    expect(announceSelection('dashboard', 'dash', rows())).toBe('Dashboard selected');
    expect(announceSelection('', 'dash', rows())).toBe('Dashboard selected');
  });
  test('a top-level row', () => {
    expect(announceSelection('row.1', 'dash', rows())).toBe('Row 2 selected');
  });
  test('a top-level item', () => {
    expect(announceSelection('row.0.item.1', 'dash', rows())).toBe('Row 1, item 2 selected');
  });
  test('a nested item', () => {
    expect(announceSelection('row.0.item.1.row.0.item.1', 'dash', nestedRows())).toBe(
      'Row 1, item 2, row 1, item 2 selected'
    );
  });
});

describe('computeTabKey (VIS-790)', () => {
  test('dashboard → first row, first item', () => {
    expect(computeTabKey('dashboard', rows(), 1)).toBe('row.0.item.0');
  });
  test('dashboard with no rows stays put', () => {
    expect(computeTabKey('dashboard', [], 1)).toBe('dashboard');
  });
  test('a selected ROW steps into its first item', () => {
    expect(computeTabKey('row.0', rows(), 1)).toBe('row.0.item.0');
  });
  test('Tab cycles items within the current row (wraps)', () => {
    expect(computeTabKey('row.0.item.0', rows(), 1)).toBe('row.0.item.1');
    // From the last item, Tab wraps to the first.
    expect(computeTabKey('row.0.item.1', rows(), 1)).toBe('row.0.item.0');
  });
  test('Shift+Tab cycles backwards within the row (wraps)', () => {
    expect(computeTabKey('row.0.item.0', rows(), -1)).toBe('row.0.item.1');
  });
  test('Tab cycles NESTED items within their nested row', () => {
    expect(computeTabKey('row.0.item.1.row.0.item.0', nestedRows(), 1)).toBe(
      'row.0.item.1.row.0.item.1'
    );
  });
});
