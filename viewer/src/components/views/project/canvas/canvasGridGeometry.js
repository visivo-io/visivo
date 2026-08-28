/**
 * canvasGridGeometry — the ONE place the canvas overlays turn a dashboard row's
 * relative item widths into pixels (VIS-777 follow-up / M26).
 *
 * `Item.width` is NOT a column index in a fixed 12-column grid. It is a RELATIVE
 * WEIGHT, and <Dashboard> renders a row by SUM-NORMALIZING those weights
 * (Dashboard.jsx `renderRow` / `renderNestedRow`):
 *
 *     const totalWidth = visibleItems.reduce((s, i) => s + (i.width || 1), 0);
 *     style={{ display: 'grid',
 *              gridTemplateColumns: `repeat(${totalWidth}, minmax(0, 1fr))`,
 *              gap: '0.7rem' }}
 *     …each item: style={{ gridColumn: `span ${item.width || 1}` }}
 *
 * Two consequences every overlay has to respect:
 *
 *   1. The DENOMINATOR MOVES. Growing one item's width grows the row's grid
 *      total too, so a 6/6 row whose first item goes to 8 becomes 8/14 — the
 *      item ends up at 57% of the row, not the 67% a "12-column" reading
 *      predicts. Any preview that scales the item's start box by
 *      `liveWidth / startWidth` overstates the result on EVERY row (M26: a
 *      1000px 6/6 row previewed 667px and committed 571px), and understates
 *      nothing — the error is systematic.
 *
 *   2. The GAP IS REAL. `gap: 0.7rem` is subtracted from the track budget, so a
 *      span's pixel width is NOT `rowWidth * span / total`. CSS resolves equal
 *      `minmax(0, 1fr)` tracks as `(rowWidth - (total - 1) * gap) / total`, and a
 *      `span N` slot then also swallows the N-1 gaps it straddles.
 *
 * Everything here is pure arithmetic over MEASURED pixels: callers pass the
 * row's live `getBoundingClientRect().width` and its live computed column gap
 * (`readColumnGapPx`), so a zoomed/transformed canvas stays consistent — the
 * inputs and the outputs are in the same measured space.
 *
 * Verified against real CSS grid layout in headless Chromium across 10 row
 * shapes (worst |formula − rendered| = 0.0000px). See the PR body.
 */

/**
 * The largest `Item.width` that survives a commit. This is a PERSISTENCE clamp
 * (canvasReorder.setItemWidth clamps to [1, 12]) — NOT a grid size. The grid is
 * always `Σ widths` wide; this only bounds a single item's weight so a resize
 * cannot mint an absurd 400-column row.
 */
export const MAX_ITEM_WIDTH = 12;

/** A row's grid total = Σ of its item widths (unset width defaults to 1). */
export const rowGridTotal = items =>
  (Array.isArray(items) ? items : []).reduce((sum, it) => sum + (it?.width || 1), 0) || 1;

/**
 * The pixel size of ONE `minmax(0, 1fr)` track in a `repeat(totalCols, …)` grid
 * of `rowWidth` px with `gapPx` between tracks.
 */
export const gridTrackPx = ({ rowWidth, totalCols, gapPx = 0 }) => {
  const total = Math.max(1, totalCols);
  const gap = Number.isFinite(gapPx) ? gapPx : 0;
  return (rowWidth - (total - 1) * gap) / total;
};

/**
 * The pixel width of a `grid-column: span spanCols` slot — `spanCols` tracks
 * PLUS the `spanCols - 1` gaps the span swallows.
 */
export const itemSlotWidthPx = ({ rowWidth, totalCols, spanCols, gapPx = 0 }) => {
  const span = Math.max(1, spanCols);
  const gap = Number.isFinite(gapPx) ? gapPx : 0;
  return span * gridTrackPx({ rowWidth, totalCols, gapPx: gap }) + (span - 1) * gap;
};

/**
 * The row's grid total once the dragged item's width becomes `spanCols`.
 *
 *   rebalance: true  — a RIGHT-EDGE drag. Only this item's weight changes, so
 *                      the row total moves with it (6/6 → 8/6, total 12 → 14).
 *   rebalance: false — a LEFT-EDGE drag. Columns TRANSFER across the boundary
 *                      with the previous sibling, so the total is unchanged.
 */
export const rowTotalForSpan = ({ startTotal, startCols, spanCols, rebalance = true }) =>
  rebalance ? Math.max(1, startTotal - startCols + spanCols) : Math.max(1, startTotal);

/**
 * THE formula behind the resize preview: the pixel width the item WILL render
 * at once `spanCols` is committed — the same sum-normalized geometry
 * <Dashboard> lays out with.
 */
export const previewItemWidthPx = ({
  rowWidth,
  startTotal,
  startCols,
  spanCols,
  gapPx = 0,
  rebalance = true,
}) =>
  itemSlotWidthPx({
    rowWidth,
    totalCols: rowTotalForSpan({ startTotal, startCols, spanCols, rebalance }),
    spanCols,
    gapPx,
  });

/**
 * The INVERSE of `previewItemWidthPx`: the integer span whose rendered width
 * lands nearest `targetWidthPx`.
 *
 * A resize gesture is a direct manipulation — the user drags the slot's edge to
 * where they want it — so the span the drop commits should be the one whose
 * RENDERED edge is closest to the pointer. Mapping raw pointer travel through a
 * fixed `rowWidth / total` step instead (the pre-M26 behaviour) assumes each
 * column is worth a constant number of pixels, which sum-normalization makes
 * false: on a `[1, 2]` row one extra column is worth 152px of growth but cost
 * 300px of travel, so the preview visibly detached from the hand.
 *
 * `previewItemWidthPx` is monotonically non-decreasing in `spanCols`, so scanning
 * the clamped candidate range and keeping the nearest is exact.
 *
 * Exact ties resolve toward `startCols` — the span the gesture started at. That
 * matters for the degenerate row: when the dragged item is the row's ONLY item,
 * `Σ widths` is its own width, so EVERY span renders full-bleed and the rendered
 * geometry cannot respond to the drag at all. Every candidate ties, and biasing
 * to the start makes that gesture an honest no-op instead of silently rewriting
 * a `width: 12` row to `width: 1`.
 */
export const nearestSpanForWidth = ({
  rowWidth,
  startTotal,
  startCols,
  targetWidthPx,
  gapPx = 0,
  minCols = 1,
  maxCols = MAX_ITEM_WIDTH,
  rebalance = true,
}) => {
  const lo = Math.max(1, Math.round(minCols));
  const hi = Math.max(lo, Math.round(maxCols));
  const anchor = Math.max(lo, Math.min(hi, startCols));
  if (!Number.isFinite(targetWidthPx)) return anchor;
  const EPS = 1e-9;
  let best = anchor;
  let bestDist = Infinity;
  for (let span = lo; span <= hi; span += 1) {
    const dist = Math.abs(
      previewItemWidthPx({ rowWidth, startTotal, startCols, spanCols: span, gapPx, rebalance }) -
        targetWidthPx
    );
    const closer = dist < bestDist - EPS;
    const tiedButSteadier =
      Math.abs(dist - bestDist) <= EPS && Math.abs(span - anchor) < Math.abs(best - anchor);
    if (closer || tiedButSteadier) {
      best = span;
      bestDist = dist;
    }
  }
  return best;
};

/**
 * The row's live computed `column-gap`, in the same measured pixel space as its
 * `getBoundingClientRect()`. Falls back to 0 when the value is not a length
 * (jsdom reports the `normal` initial value, and an unmeasurable gap must not
 * poison the arithmetic with NaN).
 */
export const readColumnGapPx = rowEl => {
  if (!rowEl || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return 0;
  }
  let raw;
  try {
    const style = window.getComputedStyle(rowEl);
    raw = style ? style.columnGap || style.gap : undefined;
  } catch {
    return 0;
  }
  const px = parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
};
