import { renderHook, act } from '@testing-library/react';
import { useAdaptiveColumnSizing } from './useAdaptiveColumnSizing';
import { calculateColumnWidth } from '../duckdb/schemaUtils';

// Mock ResizeObserver: capture the most recent callback so tests can drive
// width changes synchronously.
let capturedCallback = null;

beforeEach(() => {
  capturedCallback = null;
  global.ResizeObserver = class {
    constructor(cb) {
      capturedCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const fireResize = width => {
  if (!capturedCallback) return;
  act(() => {
    capturedCallback([{ contentRect: { width } }]);
  });
};

const makeColumns = (n, namePrefix = 'col') =>
  Array.from({ length: n }, (_, i) => ({
    name: `${namePrefix}${i}`,
    displayName: `${namePrefix} ${i}`,
    normalizedType: 'string',
    duckdbType: 'VARCHAR',
  }));

const makeRef = () => {
  const ref = { current: document.createElement('div') };
  return ref;
};

describe('useAdaptiveColumnSizing', () => {
  it('starts with empty sizing and not compressed before container width is measured', () => {
    const cols = makeColumns(3);
    const ref = makeRef();
    const { result } = renderHook(() => useAdaptiveColumnSizing(cols, ref));
    expect(result.current.columnSizing).toEqual({});
    expect(result.current.isCompressed).toBe(false);
  });

  it('applies natural sizing when container is wide enough', () => {
    const cols = makeColumns(3);
    const ref = makeRef();
    const { result } = renderHook(() => useAdaptiveColumnSizing(cols, ref));

    // Plenty of room
    fireResize(5000);

    expect(result.current.isCompressed).toBe(false);
    for (const col of cols) {
      const expected = calculateColumnWidth(col.displayName, col.normalizedType);
      expect(result.current.columnSizing[col.name]).toBe(expected);
    }
  });

  it('compresses columns when natural total exceeds container', () => {
    const cols = makeColumns(10, 'very_long_column_name_that_forces_wide_columns');
    const ref = makeRef();
    const { result } = renderHook(() => useAdaptiveColumnSizing(cols, ref));

    fireResize(800); // Far less than the 10 wide columns need naturally

    expect(result.current.isCompressed).toBe(true);
    const total = Object.values(result.current.columnSizing).reduce(
      (s, w) => s + w,
      0
    );
    // Compressed total should be near the container width (within rounding +
    // floor at MIN_COMPRESSED_COLUMN_WIDTH = 80).
    expect(total).toBeLessThanOrEqual(10 * 80 + 1); // floor case if 800/10=80
    expect(total).toBeGreaterThanOrEqual(800 - 1);
  });

  it('keeps manually-resized columns at their dragged width during compression', () => {
    const cols = makeColumns(4);
    const ref = makeRef();
    const { result } = renderHook(() => useAdaptiveColumnSizing(cols, ref));

    fireResize(1000);

    // Simulate tanstack reporting an active resize on col1, then user
    // releasing it at width 250.
    act(() => {
      result.current.setColumnSizingInfo({ isResizingColumn: 'col1' });
    });
    act(() => {
      result.current.setColumnSizing(prev => ({ ...prev, col1: 250 }));
    });
    act(() => {
      result.current.setColumnSizingInfo({ isResizingColumn: false });
    });

    // Now shrink the viewport to force compression.
    fireResize(400);

    expect(result.current.isCompressed).toBe(true);
    expect(result.current.columnSizing.col1).toBe(250);
    // Other 3 columns split (400 - 250) = 150 → 50 each, but floored at 80.
    expect(result.current.columnSizing.col0).toBeGreaterThanOrEqual(80);
    expect(result.current.columnSizing.col0).toBe(result.current.columnSizing.col2);
    expect(result.current.columnSizing.col0).toBe(result.current.columnSizing.col3);
  });

  it('does not override columnSizing while a resize is in progress', () => {
    const cols = makeColumns(3);
    const ref = makeRef();
    const { result } = renderHook(() => useAdaptiveColumnSizing(cols, ref));

    fireResize(1000);

    act(() => {
      result.current.setColumnSizingInfo({ isResizingColumn: 'col0' });
    });

    const beforeSize = result.current.columnSizing.col0;

    act(() => {
      result.current.setColumnSizing(prev => ({ ...prev, col0: beforeSize + 75 }));
    });

    // Container resize while drag is active — should not stomp on the drag value.
    fireResize(900);

    expect(result.current.columnSizing.col0).toBe(beforeSize + 75);
  });

  it('resets manual tracking when the column list changes', () => {
    const initial = makeColumns(3);
    const ref = makeRef();
    const { result, rerender } = renderHook(
      ({ columns }) => useAdaptiveColumnSizing(columns, ref),
      { initialProps: { columns: initial } }
    );

    fireResize(1000);

    // Mark col0 as manual + dragged
    act(() => {
      result.current.setColumnSizingInfo({ isResizingColumn: 'col0' });
    });
    act(() => {
      result.current.setColumnSizing(prev => ({ ...prev, col0: 300 }));
    });
    act(() => {
      result.current.setColumnSizingInfo({ isResizingColumn: false });
    });

    expect(result.current.columnSizing.col0).toBe(300);

    // Simulate a different table loading (different column set).
    const replacement = makeColumns(2, 'other');
    rerender({ columns: replacement });

    fireResize(1000);

    // Manual set is reset; sizing reflects the new columns only.
    expect(result.current.columnSizing).not.toHaveProperty('col0');
    expect(result.current.columnSizing).toHaveProperty('other0');
    expect(result.current.columnSizing).toHaveProperty('other1');
  });
});
