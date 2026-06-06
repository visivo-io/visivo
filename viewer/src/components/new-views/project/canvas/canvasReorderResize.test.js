/**
 * canvasReorder resize-helper tests (VIS-777 / Track D D-4).
 *
 * The pure, immutable config transforms behind the canvas resize gestures:
 *   - setItemWidth        → item col-span (1–12), siblings rebalance relatively.
 *   - setRowHeight        → Row.height (HeightEnum token OR int px / fluid mode).
 *   - HeightEnum helpers  → enum ↔ pixel mapping + nearest-stop snapping.
 *
 * Every transform must return a NEW config (never mutate the input) and the
 * SAME reference on a no-op, so the store's optimistic-update path can rely on
 * referential identity.
 */
import {
  setItemWidth,
  resizeItemFromLeft,
  setRowHeight,
  HEIGHT_ENUM_STOPS,
  heightEnumToPixels,
  pixelsToNearestHeightEnum,
} from './canvasReorder';

const baseConfig = () => ({
  rows: [
    {
      height: 'medium',
      items: [
        { width: 6, chart: 'ref(a)' },
        { width: 6, table: 'ref(b)' },
      ],
    },
    {
      height: 'small',
      items: [{ width: 12, chart: 'ref(c)' }],
    },
  ],
});

describe('setItemWidth (VIS-777)', () => {
  test('sets the integer col-span of the addressed item', () => {
    const cfg = baseConfig();
    const next = setItemWidth(cfg, 'row.0.item.0', 8);
    expect(next.rows[0].items[0].width).toBe(8);
    // Sibling untouched — relative grid means it rebalances at render (8/14 vs 6/14).
    expect(next.rows[0].items[1].width).toBe(6);
  });

  test('is immutable — returns a new config and never mutates the input', () => {
    const cfg = baseConfig();
    const snapshot = JSON.stringify(cfg);
    const next = setItemWidth(cfg, 'row.0.item.0', 8);
    expect(next).not.toBe(cfg);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });

  test('clamps width to [1, 12]', () => {
    const cfg = baseConfig();
    expect(setItemWidth(cfg, 'row.0.item.0', 99).rows[0].items[0].width).toBe(12);
    expect(setItemWidth(cfg, 'row.0.item.0', 0).rows[0].items[0].width).toBe(1);
    expect(setItemWidth(cfg, 'row.0.item.0', -5).rows[0].items[0].width).toBe(1);
  });

  test('returns the SAME reference when the width is unchanged (no-op)', () => {
    const cfg = baseConfig();
    expect(setItemWidth(cfg, 'row.0.item.0', 6)).toBe(cfg);
  });

  test('returns the SAME reference for a row path or malformed path', () => {
    const cfg = baseConfig();
    expect(setItemWidth(cfg, 'row.0', 8)).toBe(cfg);
    expect(setItemWidth(cfg, 'dashboard', 8)).toBe(cfg);
    expect(setItemWidth(cfg, '', 8)).toBe(cfg);
  });

  test('works at nesting depth (container sub-row item)', () => {
    const cfg = {
      rows: [
        {
          items: [
            {
              width: 12,
              rows: [{ items: [{ width: 4, chart: 'ref(x)' }, { width: 8, chart: 'ref(y)' }] }],
            },
          ],
        },
      ],
    };
    const next = setItemWidth(cfg, 'row.0.item.0.row.0.item.1', 6);
    expect(next.rows[0].items[0].rows[0].items[1].width).toBe(6);
    expect(next).not.toBe(cfg);
  });
});

describe('resizeItemFromLeft (VIS-901)', () => {
  test('transfers columns from the left neighbour to grow this item (drag left)', () => {
    const cfg = baseConfig();
    // Grow item 1 by 2 cols → neighbour (item 0) loses 2. Row total unchanged.
    const next = resizeItemFromLeft(cfg, 'row.0', 1, 2);
    expect(next.rows[0].items[1].width).toBe(8);
    expect(next.rows[0].items[0].width).toBe(4);
    expect(next.rows[0].items[0].width + next.rows[0].items[1].width).toBe(12);
  });

  test('transfers columns to the left neighbour to shrink this item (drag right)', () => {
    const cfg = baseConfig();
    const next = resizeItemFromLeft(cfg, 'row.0', 1, -2);
    expect(next.rows[0].items[1].width).toBe(4);
    expect(next.rows[0].items[0].width).toBe(8);
  });

  test('clamps so the LEFT NEIGHBOUR never drops below width 1 (growing)', () => {
    const cfg = baseConfig(); // both items width 6
    // Asking for +10 can only take 5 from the neighbour (6 → 1).
    const next = resizeItemFromLeft(cfg, 'row.0', 1, 10);
    expect(next.rows[0].items[1].width).toBe(11);
    expect(next.rows[0].items[0].width).toBe(1);
  });

  test('clamps so THIS ITEM never drops below width 1 (shrinking)', () => {
    const cfg = baseConfig(); // both items width 6
    const next = resizeItemFromLeft(cfg, 'row.0', 1, -10);
    expect(next.rows[0].items[1].width).toBe(1);
    expect(next.rows[0].items[0].width).toBe(11);
  });

  test('is a no-op for the FIRST item in a row (no left neighbour)', () => {
    const cfg = baseConfig();
    expect(resizeItemFromLeft(cfg, 'row.0', 0, 3)).toBe(cfg);
  });

  test('is immutable — returns a new config and never mutates the input', () => {
    const cfg = baseConfig();
    const snapshot = JSON.stringify(cfg);
    const next = resizeItemFromLeft(cfg, 'row.0', 1, 2);
    expect(next).not.toBe(cfg);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });

  test('returns the SAME reference on a zero / fully-clamped-to-zero transfer', () => {
    const cfg = baseConfig();
    expect(resizeItemFromLeft(cfg, 'row.0', 1, 0)).toBe(cfg);
    // Item already width 1 can't shrink further → transfer clamps to 0.
    const tight = {
      rows: [{ items: [{ width: 11, chart: 'ref(a)' }, { width: 1, chart: 'ref(b)' }] }],
    };
    expect(resizeItemFromLeft(tight, 'row.0', 1, -3)).toBe(tight);
  });

  test('returns the SAME reference for an item path or malformed path', () => {
    const cfg = baseConfig();
    expect(resizeItemFromLeft(cfg, 'row.0.item.1', 1, 2)).toBe(cfg);
    expect(resizeItemFromLeft(cfg, 'dashboard', 1, 2)).toBe(cfg);
    expect(resizeItemFromLeft(cfg, '', 1, 2)).toBe(cfg);
  });

  test('works at nesting depth (container sub-row item)', () => {
    const cfg = {
      rows: [
        {
          items: [
            {
              width: 12,
              rows: [{ items: [{ width: 4, chart: 'ref(x)' }, { width: 8, chart: 'ref(y)' }] }],
            },
          ],
        },
      ],
    };
    const next = resizeItemFromLeft(cfg, 'row.0.item.0.row.0', 1, 2);
    expect(next.rows[0].items[0].rows[0].items[1].width).toBe(10);
    expect(next.rows[0].items[0].rows[0].items[0].width).toBe(2);
    expect(next).not.toBe(cfg);
  });
});

describe('setRowHeight (VIS-777)', () => {
  test('sets a HeightEnum token (tick mode)', () => {
    const cfg = baseConfig();
    const next = setRowHeight(cfg, 'row.0', 'large');
    expect(next.rows[0].height).toBe('large');
    expect(next).not.toBe(cfg);
  });

  test('sets a numeric pixel value (Shift-fluid mode) clamped to a sane range', () => {
    const cfg = baseConfig();
    expect(setRowHeight(cfg, 'row.0', 357).rows[0].height).toBe(357);
    expect(setRowHeight(cfg, 'row.0', 10).rows[0].height).toBe(48); // floor
    expect(setRowHeight(cfg, 'row.0', 9999).rows[0].height).toBe(2048); // ceil
  });

  test('rounds a fractional pixel value to an int', () => {
    const cfg = baseConfig();
    expect(setRowHeight(cfg, 'row.0', 357.6).rows[0].height).toBe(358);
  });

  test('is immutable and returns the SAME reference on a no-op', () => {
    const cfg = baseConfig();
    const snapshot = JSON.stringify(cfg);
    expect(setRowHeight(cfg, 'row.0', 'medium')).toBe(cfg); // unchanged enum
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });

  test('returns the SAME reference for an item path or malformed path', () => {
    const cfg = baseConfig();
    expect(setRowHeight(cfg, 'row.0.item.0', 'large')).toBe(cfg);
    expect(setRowHeight(cfg, '', 'large')).toBe(cfg);
  });

  test('works at nesting depth (sub-row weight via enum)', () => {
    const cfg = {
      rows: [
        {
          items: [
            { width: 12, rows: [{ height: 'small', items: [{ chart: 'ref(x)' }] }] },
          ],
        },
      ],
    };
    const next = setRowHeight(cfg, 'row.0.item.0.row.0', 'large');
    expect(next.rows[0].items[0].rows[0].height).toBe('large');
    expect(next).not.toBe(cfg);
  });
});

describe('HeightEnum helpers (VIS-777)', () => {
  test('enum stops are ascending in pixel size', () => {
    for (let i = 1; i < HEIGHT_ENUM_STOPS.length; i += 1) {
      expect(HEIGHT_ENUM_STOPS[i].px).toBeGreaterThan(HEIGHT_ENUM_STOPS[i - 1].px);
    }
  });

  test('heightEnumToPixels mirrors the renderer mapping', () => {
    expect(heightEnumToPixels('small')).toBe(256);
    expect(heightEnumToPixels('medium')).toBe(396);
    expect(heightEnumToPixels('large')).toBe(512);
    expect(heightEnumToPixels('unknown')).toBe(396); // falls back to medium
  });

  test('pixelsToNearestHeightEnum snaps to the closest stop', () => {
    expect(pixelsToNearestHeightEnum(260)).toBe('small'); // ~256
    expect(pixelsToNearestHeightEnum(400)).toBe('medium'); // ~396
    expect(pixelsToNearestHeightEnum(500)).toBe('large'); // ~512
    expect(pixelsToNearestHeightEnum(5000)).toBe('xxlarge'); // ceil stop
    expect(pixelsToNearestHeightEnum(0)).toBe('compact'); // floor stop
  });
});
