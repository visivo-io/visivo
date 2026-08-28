/**
 * canvasGridGeometry tests — the width math behind the truthful resize preview
 * (M26 / W7).
 *
 * The finding: <CanvasResizeLayer> previewed a resize against a hardcoded
 * 12-column grid while <Dashboard> renders a SUM-NORMALIZED relative grid, so
 * the ghost promised a width the drop could not deliver on any row whose item
 * widths did not happen to total 12 (and, because the total MOVES with the drag,
 * on 12-wide rows too).
 *
 * These are the primary guard. The headline assertions are the dossier's own
 * numbers (rowWidth 1000, total 12, startCols 6 → liveCols 8 renders 571px, not
 * 667px) plus a round-trip property: the preview must equal the geometry
 * recomputed from the config the drop ACTUALLY commits, via `setItemWidth` — the
 * two sides derived independently, so a drift in either is a failure.
 *
 * The pixel fixtures below were measured in headless Chromium against a real CSS
 * grid built with Dashboard.jsx's exact row styles; formula vs. browser agreed to
 * 0.0161px across ten row shapes.
 */
import {
  MAX_ITEM_WIDTH,
  gridTrackPx,
  itemSlotWidthPx,
  nearestSpanForWidth,
  previewItemWidthPx,
  readColumnGapPx,
  rowGridTotal,
  rowTotalForSpan,
} from './canvasGridGeometry';
import { setItemWidth } from './canvasReorder';

// Dashboard.jsx renders rows with `gap: '0.7rem'` → 11.2px at a 16px root.
const REAL_GAP = 11.2;

describe('rowGridTotal', () => {
  test('sums the row item widths — that IS the grid, not a fixed 12', () => {
    expect(rowGridTotal([{ width: 6 }, { width: 6 }])).toBe(12);
    expect(rowGridTotal([{ width: 1 }, { width: 2 }])).toBe(3);
    expect(rowGridTotal([{ width: 3 }, { width: 5 }, { width: 1 }])).toBe(9);
    expect(rowGridTotal([{ width: 9 }, { width: 2 }])).toBe(11);
  });

  test('an unset width counts as 1 (mirrors the renderer)', () => {
    expect(rowGridTotal([{}, { width: 3 }, {}])).toBe(5);
  });

  test('an empty / unusable row falls back to 1 so nothing divides by zero', () => {
    expect(rowGridTotal([])).toBe(1);
    expect(rowGridTotal(null)).toBe(1);
    expect(rowGridTotal(undefined)).toBe(1);
  });
});

describe('gridTrackPx / itemSlotWidthPx — CSS `repeat(T, minmax(0,1fr))` + gap', () => {
  test('with no gap a track is just an equal share of the row', () => {
    expect(gridTrackPx({ rowWidth: 1200, totalCols: 12, gapPx: 0 })).toBeCloseTo(100, 9);
    expect(itemSlotWidthPx({ rowWidth: 1200, totalCols: 12, spanCols: 6, gapPx: 0 })).toBeCloseTo(
      600,
      9
    );
  });

  test('the gap is subtracted from the track budget and re-added inside a span', () => {
    // 12 tracks, 11 gaps: (1000 - 11·11.2)/12 = 73.06667 per track; a span of 6
    // covers 6 tracks + the 5 gaps it straddles.
    expect(gridTrackPx({ rowWidth: 1000, totalCols: 12, gapPx: REAL_GAP })).toBeCloseTo(
      73.0666667,
      6
    );
    // Browser-measured: 494.41px (formula 494.40px).
    expect(
      itemSlotWidthPx({ rowWidth: 1000, totalCols: 12, spanCols: 6, gapPx: REAL_GAP })
    ).toBeCloseTo(494.4, 2);
  });

  test('a full-span single item gets the whole row back, gap or no gap', () => {
    expect(itemSlotWidthPx({ rowWidth: 777, totalCols: 12, spanCols: 12, gapPx: REAL_GAP })).toBeCloseTo(
      777,
      9
    );
    expect(itemSlotWidthPx({ rowWidth: 777, totalCols: 1, spanCols: 1, gapPx: REAL_GAP })).toBeCloseTo(
      777,
      9
    );
  });

  test('browser-measured fixtures reproduce exactly (3 real row shapes)', () => {
    // [1,2] on a 900px row → 292.53 / 596.28 measured.
    expect(itemSlotWidthPx({ rowWidth: 900, totalCols: 3, spanCols: 1, gapPx: REAL_GAP })).toBeCloseTo(
      292.53,
      2
    );
    expect(itemSlotWidthPx({ rowWidth: 900, totalCols: 3, spanCols: 2, gapPx: REAL_GAP })).toBeCloseTo(
      596.27,
      2
    );
    // [3,5,1] on a 1200px row → 392.53 / 661.70 / 123.38 measured.
    expect(itemSlotWidthPx({ rowWidth: 1200, totalCols: 9, spanCols: 3, gapPx: REAL_GAP })).toBeCloseTo(
      392.53,
      2
    );
    expect(itemSlotWidthPx({ rowWidth: 1200, totalCols: 9, spanCols: 5, gapPx: REAL_GAP })).toBeCloseTo(
      661.69,
      2
    );
    // [7,2,4,1] on a 1013px row → 500.91 measured for the first slot.
    expect(itemSlotWidthPx({ rowWidth: 1013, totalCols: 14, spanCols: 7, gapPx: REAL_GAP })).toBeCloseTo(
      500.9,
      2
    );
  });

  test('a non-finite gap degrades to 0 instead of poisoning the arithmetic', () => {
    expect(itemSlotWidthPx({ rowWidth: 800, totalCols: 4, spanCols: 2, gapPx: NaN })).toBe(400);
    expect(itemSlotWidthPx({ rowWidth: 800, totalCols: 4, spanCols: 2, gapPx: undefined })).toBe(400);
  });
});

describe('rowTotalForSpan — the denominator moves on a right-edge drag', () => {
  test('a rebalancing (right-edge) drag grows the row total with the item', () => {
    expect(rowTotalForSpan({ startTotal: 12, startCols: 6, spanCols: 8 })).toBe(14);
    expect(rowTotalForSpan({ startTotal: 12, startCols: 6, spanCols: 3 })).toBe(9);
    expect(rowTotalForSpan({ startTotal: 3, startCols: 1, spanCols: 2 })).toBe(4);
  });

  test('a transferring (left-edge) drag leaves the row total alone', () => {
    expect(rowTotalForSpan({ startTotal: 12, startCols: 6, spanCols: 8, rebalance: false })).toBe(12);
  });

  test('never returns a zero denominator', () => {
    expect(rowTotalForSpan({ startTotal: 0, startCols: 0, spanCols: 0 })).toBe(1);
  });
});

describe('previewItemWidthPx — M26: the ghost the drop can actually deliver', () => {
  test('THE finding: a 6/6 row dragged to width 8 renders 571px, not 667px', () => {
    const truthful = previewItemWidthPx({
      rowWidth: 1000,
      startTotal: 12,
      startCols: 6,
      spanCols: 8,
      gapPx: 0,
    });
    // 8 / (12 − 6 + 8) = 8/14 of the row.
    expect(truthful).toBeCloseTo(571.43, 2);

    // The pre-fix formula — scale the start box by live/start against a fixed
    // 12-column grid — overstates it by 95px on this row alone.
    const startBox = itemSlotWidthPx({ rowWidth: 1000, totalCols: 12, spanCols: 6, gapPx: 0 });
    const oldGhost = startBox * (8 / 6);
    expect(oldGhost).toBeCloseTo(666.67, 2);
    expect(oldGhost - truthful).toBeGreaterThan(90);
  });

  test('the error is systematic — every row shape, not just the exotic ones', () => {
    const shapes = [
      { widths: [6, 6], rowWidth: 1000, index: 0, span: 8 },
      { widths: [1, 2], rowWidth: 900, index: 0, span: 2 },
      { widths: [3, 5, 1], rowWidth: 1200, index: 0, span: 5 },
      { widths: [2, 3], rowWidth: 960, index: 1, span: 4 },
      { widths: [9, 2], rowWidth: 800, index: 0, span: 7 },
    ];
    for (const { widths, rowWidth, index, span } of shapes) {
      const startTotal = rowGridTotal(widths.map(width => ({ width })));
      const startCols = widths[index];
      const startBox = itemSlotWidthPx({ rowWidth, totalCols: startTotal, spanCols: startCols, gapPx: 0 });
      const truthful = previewItemWidthPx({
        rowWidth,
        startTotal,
        startCols,
        spanCols: span,
        gapPx: 0,
      });
      const oldGhost = startBox * (span / startCols);
      // The old ghost is wrong in the SAME direction every time: it ignores the
      // moving denominator, so growth is always overstated and shrink is always
      // understated. Signed by the drag direction, the lie is always positive.
      const lie = span > startCols ? oldGhost - truthful : truthful - oldGhost;
      expect(lie).toBeGreaterThan(2);
    }
  });

  test('a left-edge TRANSFER previews against the UNCHANGED row total', () => {
    // Columns only move across the shared boundary, so 8 of 12 stays 8 of 12.
    expect(
      previewItemWidthPx({
        rowWidth: 1200,
        startTotal: 12,
        startCols: 6,
        spanCols: 8,
        gapPx: 0,
        rebalance: false,
      })
    ).toBeCloseTo(800, 9);
  });

  test('zero travel previews the slot the item already occupies', () => {
    for (const gapPx of [0, REAL_GAP]) {
      expect(
        previewItemWidthPx({ rowWidth: 1000, startTotal: 12, startCols: 6, spanCols: 6, gapPx })
      ).toBeCloseTo(itemSlotWidthPx({ rowWidth: 1000, totalCols: 12, spanCols: 6, gapPx }), 9);
    }
  });

  test('GHOST == DROP: the preview matches the geometry recomputed from the COMMITTED config', () => {
    // Independent derivation: run the real config mutation the gesture commits
    // (`setItemWidth`), then lay the resulting row out from scratch. If the ghost
    // and the drop ever disagree again, this is the test that says so.
    const shapes = [
      [6, 6],
      [1, 2],
      [3, 5, 1],
      [2, 3],
      [9, 2],
      [12],
      [3, 3, 3, 3],
      [7, 2, 4, 1],
    ];
    const rowWidth = 1140;
    for (const widths of shapes) {
      for (let index = 0; index < widths.length; index += 1) {
        for (let span = 1; span <= MAX_ITEM_WIDTH; span += 1) {
          const config = { rows: [{ items: widths.map(width => ({ width })) }] };
          const startTotal = rowGridTotal(config.rows[0].items);
          const ghost = previewItemWidthPx({
            rowWidth,
            startTotal,
            startCols: widths[index],
            spanCols: span,
            gapPx: REAL_GAP,
          });

          const committed = setItemWidth(config, `row.0.item.${index}`, span);
          const items = committed.rows[0].items;
          const dropped = itemSlotWidthPx({
            rowWidth,
            totalCols: rowGridTotal(items),
            spanCols: items[index].width || 1,
            gapPx: REAL_GAP,
          });
          expect(ghost).toBeCloseTo(dropped, 9);
        }
      }
    }
  });
});

describe('nearestSpanForWidth — the inverse the gesture picks a span with', () => {
  const ROW = { rowWidth: 800, startTotal: 12, startCols: 6, gapPx: 0 };

  test('picks the span whose RENDERED width lands nearest the dragged edge', () => {
    // Candidates on this row: 6→400, 7→430.8, 8→457.1, 9→480.
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: 457 })).toBe(8);
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: 431 })).toBe(7);
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: 479 })).toBe(9);
  });

  test('is a true inverse of previewItemWidthPx across the whole range', () => {
    for (let span = 1; span <= MAX_ITEM_WIDTH; span += 1) {
      const width = previewItemWidthPx({ ...ROW, spanCols: span });
      expect(nearestSpanForWidth({ ...ROW, targetWidthPx: width })).toBe(span);
    }
  });

  test('zero travel is a no-op — the start span round-trips', () => {
    const startWidth = previewItemWidthPx({ ...ROW, spanCols: ROW.startCols });
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: startWidth })).toBe(6);
  });

  test('clamps to [1, MAX_ITEM_WIDTH] — the persistence clamp, never a phantom span', () => {
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: -5000 })).toBe(1);
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: 50000 })).toBe(MAX_ITEM_WIDTH);
  });

  test('a left-edge transfer is bounded by the neighbour it borrows from', () => {
    // Neighbour is 4 wide, so it can lend at most 3 columns: max span 6 + 3 = 9.
    const bounded = {
      rowWidth: 1200,
      startTotal: 10,
      startCols: 6,
      gapPx: 0,
      rebalance: false,
      maxCols: 9,
    };
    expect(nearestSpanForWidth({ ...bounded, targetWidthPx: 99999 })).toBe(9);
    expect(nearestSpanForWidth({ ...bounded, targetWidthPx: 0 })).toBe(1);
  });

  test('a SINGLE-item row is a no-op: every span renders full-bleed, so keep the start', () => {
    // Σ widths === this item's width, so the rendered slot is the whole row at
    // ANY span — the drag cannot change the geometry, and it must not silently
    // rewrite `width: 12` to `width: 1`.
    const solo = { rowWidth: 900, startTotal: 12, startCols: 12, gapPx: REAL_GAP };
    expect(previewItemWidthPx({ ...solo, spanCols: 1 })).toBeCloseTo(900, 9);
    expect(previewItemWidthPx({ ...solo, spanCols: 12 })).toBeCloseTo(900, 9);
    expect(nearestSpanForWidth({ ...solo, targetWidthPx: 300 })).toBe(12);
    expect(nearestSpanForWidth({ ...solo, targetWidthPx: 1500 })).toBe(12);
  });

  test('a non-finite target keeps the start span rather than collapsing to 1', () => {
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: NaN })).toBe(6);
    expect(nearestSpanForWidth({ ...ROW, targetWidthPx: undefined })).toBe(6);
  });
});

describe('readColumnGapPx', () => {
  test('reads a real computed column-gap off the row', () => {
    const el = document.createElement('div');
    el.style.display = 'grid';
    el.style.columnGap = '11.2px';
    document.body.appendChild(el);
    expect(readColumnGapPx(el)).toBeCloseTo(11.2, 2);
    document.body.removeChild(el);
  });

  test('a missing element or a non-length value degrades to 0, never NaN', () => {
    expect(readColumnGapPx(null)).toBe(0);
    expect(readColumnGapPx(undefined)).toBe(0);
    const el = document.createElement('div'); // jsdom reports the `normal` initial value
    expect(readColumnGapPx(el)).toBe(0);
  });

  test('survives an element whose computed style throws', () => {
    const original = window.getComputedStyle;
    window.getComputedStyle = () => {
      throw new Error('detached');
    };
    try {
      expect(readColumnGapPx(document.createElement('div'))).toBe(0);
    } finally {
      window.getComputedStyle = original;
    }
  });
});
