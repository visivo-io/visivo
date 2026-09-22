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
 * The pixel fixtures below are the OUTPUT of `viewer/e2e/tools/measure-canvas-grid.mjs`,
 * a committed harness that builds these exact rows in headless Chromium from
 * Dashboard.renderRow's styles and measures every slot. Re-run it with
 * `node e2e/tools/measure-canvas-grid.mjs` from `viewer/`. Its last run:
 *
 *     worst |formula − rendered| (static)       = 0.021591px
 *     worst |ghost − rendered| (width)          = 0.022500px
 *     worst |ghost − rendered| (left)           = 0.017857px
 *     worst |frozen box.left − rendered| (left) = 592.140625px  <- pre-fix
 *
 * That last line is the second half of the finding: the ghost's LEFT edge. See
 * the `previewItemLeftShiftPx` block below.
 *
 * These fixtures pin the formula against regression; they cannot, on their own,
 * prove it still matches the RENDERER. `dashboardGridContract.test.jsx` is the
 * test that couples this module to <Dashboard>'s actual row markup.
 */
import {
  MAX_ITEM_WIDTH,
  gridTrackPx,
  itemSlotWidthPx,
  nearestSpanForWidth,
  precedingColsInRow,
  previewItemLeftShiftPx,
  previewItemWidthPx,
  readColumnGapPx,
  rowGridTotal,
  rowTotalForSpan,
  spanLeftOffsetPx,
} from './canvasGridGeometry';
import { setItemWidth } from './canvasReorder';

// Dashboard.jsx renders rows with `gap: '0.7rem'` → 11.2px at a 16px root.
const REAL_GAP = 11.2;

// Chromium resolves `fr` tracks at LayoutUnit (1/64 = 0.015625px) precision and
// that rounding accumulates across the tracks a slot straddles, so a browser
// fixture can never match the float formula exactly. 0.05px is two LayoutUnits
// wide and still three orders of magnitude below anything a user can see —
// a genuinely different formula could not slip under it.
const BROWSER_EPS = 0.05;

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
    // Browser measured 494.4063px on the [6,6] @1000 row (formula 494.4px).
    expect(
      Math.abs(itemSlotWidthPx({ rowWidth: 1000, totalCols: 12, spanCols: 6, gapPx: REAL_GAP }) - 494.4063)
    ).toBeLessThan(BROWSER_EPS);
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
    // VERBATIM `getBoundingClientRect().width` readings from
    // e2e/tools/measure-canvas-grid.mjs — LayoutUnit rounding included, so they
    // are the BROWSER's numbers and not the formula's own output rounded.
    const w = (rowWidth, totalCols, spanCols) =>
      itemSlotWidthPx({ rowWidth, totalCols, spanCols, gapPx: REAL_GAP });
    const measured = [
      // [1,2] @900 → 292.5313 / 596.2813
      [w(900, 3, 1), 292.5313],
      [w(900, 3, 2), 596.2813],
      // [3,5,1] @1200 → 392.5313 / 661.7031 / 123.375
      [w(1200, 9, 3), 392.5313],
      [w(1200, 9, 5), 661.7031],
      [w(1200, 9, 1), 123.375],
      // [7,2,4,1] @1013 → 500.9063 / 135.125 / 281.4375 / 61.9688
      [w(1013, 14, 7), 500.9063],
      [w(1013, 14, 2), 135.125],
      [w(1013, 14, 4), 281.4375],
      [w(1013, 14, 1), 61.9688],
    ];
    for (const [formula, browser] of measured) {
      expect(Math.abs(formula - browser)).toBeLessThan(BROWSER_EPS);
    }
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

describe('precedingColsInRow / spanLeftOffsetPx — where a slot STARTS', () => {
  test('counts the columns in front of an item, unset widths as 1', () => {
    const items = [{ width: 3 }, { width: 5 }, {}, { width: 1 }];
    expect(precedingColsInRow(items, 0)).toBe(0);
    expect(precedingColsInRow(items, 1)).toBe(3);
    expect(precedingColsInRow(items, 2)).toBe(8);
    expect(precedingColsInRow(items, 3)).toBe(9);
  });

  test('degrades safely on junk input', () => {
    expect(precedingColsInRow(null, 2)).toBe(0);
    expect(precedingColsInRow(undefined, 2)).toBe(0);
    expect(precedingColsInRow([{ width: 4 }], -3)).toBe(0);
  });

  test('browser-measured left offsets reproduce exactly (4 real row shapes)', () => {
    // Every number here is a `getBoundingClientRect().left − row.left` read out
    // of headless Chromium by e2e/tools/measure-canvas-grid.mjs, VERBATIM —
    // including the browser's LayoutUnit (1/64px) rounding, which is why the
    // tolerance is BROWSER_EPS and not an arbitrary decimal precision.
    const at = (rowWidth, totalCols, precedingCols) =>
      spanLeftOffsetPx({ rowWidth, totalCols, precedingCols, gapPx: REAL_GAP });
    const measured = [
      // [6,6] @1000 → item 1
      [at(1000, 12, 6), 505.5938],
      // [3,5,1] @1200 → items 1 and 2
      [at(1200, 9, 3), 403.7188],
      [at(1200, 9, 8), 1076.6094],
      // [7,2,4,1] @1013 → items 1 and 3
      [at(1013, 14, 7), 512.0938],
      [at(1013, 14, 13), 951.0313],
      // [2,2,2,2] @1200 → item 3
      [at(1200, 8, 6), 908.3906],
    ];
    for (const [formula, browser] of measured) {
      expect(Math.abs(formula - browser)).toBeLessThan(BROWSER_EPS);
    }
  });

  test('the first slot always starts at the row edge', () => {
    expect(spanLeftOffsetPx({ rowWidth: 1000, totalCols: 12, precedingCols: 0, gapPx: REAL_GAP })).toBe(0);
  });

  test('a non-finite gap degrades to 0 instead of poisoning the arithmetic', () => {
    expect(spanLeftOffsetPx({ rowWidth: 800, totalCols: 4, precedingCols: 2, gapPx: NaN })).toBe(400);
  });
});

describe('previewItemLeftShiftPx — M26 second half: the slot MOVES as it grows', () => {
  test('THE finding: a 6/6 row dragged to width 10 slides item 1 126px LEFT', () => {
    // The whole row re-tracks: 12 columns of 73.07px become 16 of 52.00px, so
    // the six columns in FRONT of item 1 shrink and drag it left with them. A
    // ghost pinned at the item's measured `left` is 126px out — and, being the
    // last item, is painted hanging 126px off the row's right edge.
    const shift = previewItemLeftShiftPx({
      rowWidth: 1000,
      startTotal: 12,
      startCols: 6,
      spanCols: 10,
      precedingCols: 6,
      gapPx: REAL_GAP,
    });
    expect(shift).toBeCloseTo(-126.4, 1);
    // Browser: item 1 sits at 505.59 before and 379.19 after.
    expect(505.59 + shift).toBeCloseTo(379.19, 1);
  });

  test('the FIRST item in a row never moves — its left edge is the row edge', () => {
    for (let span = 1; span <= MAX_ITEM_WIDTH; span += 1) {
      expect(
        previewItemLeftShiftPx({
          rowWidth: 1000,
          startTotal: 12,
          startCols: 6,
          spanCols: span,
          precedingCols: 0,
          gapPx: REAL_GAP,
        })
      ).toBe(0);
    }
  });

  test('a left-edge TRANSFER holds the tracks still, so the shift is 0', () => {
    // Columns only move ACROSS the shared boundary: the total — and therefore
    // every track — is unchanged, and that gesture anchors the RIGHT edge.
    expect(
      previewItemLeftShiftPx({
        rowWidth: 1200,
        startTotal: 12,
        startCols: 6,
        spanCols: 9,
        precedingCols: 3,
        gapPx: REAL_GAP,
        rebalance: false,
      })
    ).toBe(0);
  });

  test('zero travel is a zero shift — the ghost is welded to the card at rest', () => {
    for (const gapPx of [0, REAL_GAP]) {
      expect(
        previewItemLeftShiftPx({
          rowWidth: 900,
          startTotal: 9,
          startCols: 5,
          spanCols: 5,
          precedingCols: 3,
          gapPx,
        })
      ).toBeCloseTo(0, 9);
    }
  });

  test('shrinking pushes the slot RIGHT (the tracks in front of it grow)', () => {
    const shift = previewItemLeftShiftPx({
      rowWidth: 1000,
      startTotal: 12,
      startCols: 4,
      spanCols: 2,
      precedingCols: 4,
      gapPx: REAL_GAP,
    });
    expect(shift).toBeGreaterThan(0);
  });

  test('GHOST LEFT == DROP LEFT: the preview matches the COMMITTED re-layout', () => {
    // Independent derivation, same shape as the width round-trip: run the real
    // mutation the gesture commits (`setItemWidth`), lay the resulting row out
    // from scratch, and check the ghost's left edge against it. Also asserts the
    // pre-fix ghost (frozen at the start left) really was wrong, so this test
    // cannot pass by accident on a formula that ignores the shift.
    const rowWidth = 1140;
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
    let worstFrozenError = 0;
    for (const widths of shapes) {
      for (let index = 0; index < widths.length; index += 1) {
        for (let span = 1; span <= MAX_ITEM_WIDTH; span += 1) {
          const config = { rows: [{ items: widths.map(width => ({ width })) }] };
          const items = config.rows[0].items;
          const startTotal = rowGridTotal(items);
          const precedingCols = precedingColsInRow(items, index);
          const startLeft = spanLeftOffsetPx({
            rowWidth,
            totalCols: startTotal,
            precedingCols,
            gapPx: REAL_GAP,
          });
          const ghostLeft =
            startLeft +
            previewItemLeftShiftPx({
              rowWidth,
              startTotal,
              startCols: widths[index],
              spanCols: span,
              precedingCols,
              gapPx: REAL_GAP,
            });

          const committed = setItemWidth(config, `row.0.item.${index}`, span);
          const after = committed.rows[0].items;
          const droppedLeft = spanLeftOffsetPx({
            rowWidth,
            totalCols: rowGridTotal(after),
            precedingCols: precedingColsInRow(after, index),
            gapPx: REAL_GAP,
          });
          expect(ghostLeft).toBeCloseTo(droppedLeft, 9);
          worstFrozenError = Math.max(worstFrozenError, Math.abs(startLeft - droppedLeft));
        }
      }
    }
    // The pre-fix ghost froze `left` at the start box: hundreds of pixels off.
    expect(worstFrozenError).toBeGreaterThan(300);
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
