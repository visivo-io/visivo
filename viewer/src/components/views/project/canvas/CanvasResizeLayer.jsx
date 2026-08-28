import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { useCommitCanvasConfig } from '../../workspace/WorkspaceDndContext';
import {
  parseCanvasPath,
  setItemWidth,
  resizeItemFromLeft,
  setRowHeight,
  HEIGHT_ENUM_STOPS,
  heightEnumToPixels,
  pixelsToNearestHeightEnum,
} from './canvasReorder';
import {
  MAX_ITEM_WIDTH,
  nearestSpanForWidth,
  previewItemWidthPx,
  readColumnGapPx,
  rowGridTotal,
} from './canvasGridGeometry';

/**
 * CanvasResizeLayer — VIS-777 / Track D D-4 (design D-3 "Resize handles").
 *
 * The resize-gesture overlay for the Workspace dashboard canvas. A SIBLING over
 * the render-only <Dashboard> (mounted by ProjectCanvas next to the selection +
 * DnD overlays), it MEASURES the live DOM via the same composite
 * `data-canvas-path` markers the other overlays read, then paints edge handles
 * on the CURRENTLY SELECTED item / row and turns a drag on them into a config
 * mutation persisted through the shell's shared `commitCanvasConfig`
 * (optimistic → validate → save).
 *
 * WIDTHS ARE RELATIVE, NOT A 12-COLUMN GRID (M26). <Dashboard> lays a row out as
 * `repeat(Σ item.width, minmax(0, 1fr))` with a `0.7rem` gap, so growing one
 * item grows the DENOMINATOR too: a 6/6 row whose first item goes to 8 renders
 * at 8/14, not 8/12. This layer used to preview against a hardcoded `COLS = 12`
 * and scale the start box by `live / start`, which promised a size the commit
 * could not deliver (a 1000px 6/6 row previewed 667px and committed 571px) and
 * printed an `N / 12` readout on rows that were never 12 wide. Every pixel here
 * now comes from `canvasGridGeometry` — the single owner of that sum-normalized
 * formula, verified against real CSS grid layout — so the ghost is exactly the
 * geometry the drop produces.
 *
 * Handle types (D-3 contract):
 *   - Item RIGHT-EDGE (↔ width): drag changes the item's integer relative width
 *     (1–12). Siblings rebalance live, so the row total moves with the drag; the
 *     span committed is the one whose RENDERED edge lands nearest the pointer. A
 *     `N / total` readout pill rides the handle.
 *   - Item LEFT-EDGE (↔ width): drag moves the boundary shared with the PREVIOUS
 *     sibling, transferring grid columns between this item and its left neighbour
 *     (drag left grows this item / shrinks the neighbour; drag right inverts),
 *     clamped so neither drops below width 1. The first item in a row has no
 *     shared left boundary, so it gets no left handle.
 *   - Row BOTTOM-EDGE (↕ height): drag snaps to HeightEnum tick stops by
 *     default (label stack, active stop mulberry-filled). Holding Shift switches
 *     to FLUID mode — a numeric pixel value written as an int to `Row.height`
 *     (which accepts `Union[HeightEnum, int]`).
 *   - Container CORNER (⤡ both axes): on a container item (Item.rows non-empty)
 *     a se-resize corner resizes width + height in one gesture.
 *
 * The chart inside the slot stays STATIC during the drag: we never re-layout the
 * Dashboard mid-gesture. The overlay paints ONE emphasized mulberry ghost at the
 * live target geometry and FADES the card being resized (a direct imperative
 * opacity on the measured node, restored on release / Esc / pointercancel /
 * unmount), so a gesture shows exactly one outline and it is unambiguous which
 * geometry will land. The new config commits on pointer-UP, so the expensive
 * chart re-render happens once, at drag-end.
 *
 * Pointer handling is RAW (not dnd-kit): the handle calls `setPointerCapture` on
 * pointer-down so a canvas reflow mid-drag (charts finishing load, the optimistic
 * config swap) can never drop the gesture — the moves keep flowing to the
 * captured handle regardless of what reflows underneath.
 *
 * Mulberry / primary (`primary`) is the SELECTION colour only (matches the
 * selection overlay + DnD insertion bar). Type colours come from
 * objectTypeConfigs.js elsewhere and are never used here.
 */

const MULBERRY = 'var(--color-primary-500)';

// How far the card being resized fades while its ghost is on screen.
const DRAG_FADE_OPACITY = '0.35';

// Classify a composite selection key as item / row / chrome (mirrors the
// selection overlay's kindForKey).
const kindForKey = key => {
  if (!key || key === 'dashboard') return 'chrome';
  const parts = key.split('.');
  return parts[parts.length - 2] === 'item' ? 'item' : 'row';
};

// The path of the ROW that owns an item selection (strip the trailing
// `.item.N`). Used to surface the row-height handle from an item selection
// (VIS-986): row height is governed by the ROW, but the user almost always has
// an ITEM selected (a canvas click selects the innermost slot), so the height
// affordance has to be reachable from that item — anchored on its parent row.
//   `row.0.item.1`              → `row.0`
//   `row.0.item.1.row.0.item.1` → `row.0.item.1.row.0`
//   `row.0` (a row key)         → itself
const parentRowPathOf = key => {
  if (!key) return null;
  const i = key.lastIndexOf('.item.');
  return i > 0 ? key.slice(0, i) : key;
};

// Measure a node's box relative to the overlay root (same idiom as the sibling
// overlays — absolute positioning inside the shared positioned ancestor).
const measure = (el, rootEl) => {
  if (!el || !rootEl) return null;
  const node = el.getBoundingClientRect();
  const root = rootEl.getBoundingClientRect();
  return {
    top: node.top - root.top,
    left: node.left - root.left,
    width: node.width,
    height: node.height,
  };
};

// Resolve the config node (item or row) addressed by a composite path, plus its
// parent row's item-width context (so the width gesture can reason about the
// per-column pixel width and the sibling total).
const resolveSelection = (config, key) => {
  const segments = parseCanvasPath(key);
  if (!segments.length) return null;
  // Walk the spine to the addressed node + its parent items array.
  let rows = Array.isArray(config?.rows) ? config.rows : null;
  let row = null;
  let item = null;
  let itemsInRow = null;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.kind === 'row') {
      if (!rows || !rows[seg.index]) return null;
      row = rows[seg.index];
      item = null;
      itemsInRow = Array.isArray(row.items) ? row.items : [];
    } else {
      if (!itemsInRow || !itemsInRow[seg.index]) return null;
      item = itemsInRow[seg.index];
      rows = Array.isArray(item.rows) ? item.rows : null;
    }
  }
  const last = segments[segments.length - 1];
  return { segments, row, item, itemsInRow, isItem: last.kind === 'item' };
};

const CanvasResizeLayer = ({ rootRef, dashboardName }) => {
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const dashboards = useStore(s => s.dashboards);
  const commitCanvasConfig = useCommitCanvasConfig();

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  // Measured box of the selected node, kept fresh against reflow.
  const [box, setBox] = useState(null);
  // Measured box of the ROW that governs height for the current selection: the
  // selected row itself, or — for an item selection — its parent row. The
  // row-height handle (VIS-986) is anchored on this so it spans the full row and
  // sits at the row's bottom edge even when only a single item is selected.
  const [heightBox, setHeightBox] = useState(null);
  // Live drag state — null at rest; otherwise the in-flight gesture descriptor:
  //   { kind: 'width'|'width-left'|'height'|'corner', startX, startY,
  //     rowWidth, gapPx, startTotal, rebalance, maxCols, startSlotPx,
  //     startCols, liveCols, liveTotal, startPx, livePx, fluid, label, box }
  // The rowWidth/gapPx/startTotal trio is the row's MEASURED grid context,
  // frozen at pointer-down so every frame can re-derive the truthful preview
  // (canvasGridGeometry) without another DOM read.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  // The canvas node currently faded under its ghost, plus the inline styles to
  // put back. Held in a ref (not state) because it is imperative DOM the layer
  // borrows from the render-only <Dashboard> for the length of one gesture.
  const fadedRef = useRef(null);

  const selectedKind = kindForKey(selectedKey);

  const selection = useMemo(() => {
    if (!dashboardConfig || selectedKind === 'chrome') return null;
    return resolveSelection(dashboardConfig, selectedKey);
  }, [dashboardConfig, selectedKey, selectedKind]);

  // Is the selected item a container (Item.rows non-empty)? Containers get the
  // both-axes corner handle.
  const isContainerItem = !!(
    selection?.isItem &&
    Array.isArray(selection.item?.rows) &&
    selection.item.rows.length > 0
  );

  // The row that governs height for a width/height gesture: for an item
  // selection it's the item's PARENT row; for a row selection it's the row
  // itself. The width gesture targets the ITEM; the height gesture targets the
  // ROW (or, for a row selection, that row).
  const measureBox = useCallback(() => {
    const root = rootRef.current;
    if (!root || !selectedKey || selectedKind === 'chrome') {
      setBox(null);
      setHeightBox(null);
      return;
    }
    const el = root.querySelector(`[data-canvas-path="${selectedKey}"]`);
    setBox(el ? measure(el, root) : null);
    // The height-governing row box: for a row selection it's the same node; for
    // an item selection it's the parent row (so the height handle spans the row).
    const rowPath = selectedKind === 'item' ? parentRowPathOf(selectedKey) : selectedKey;
    const rowEl =
      rowPath && rowPath !== selectedKey
        ? root.querySelector(`[data-canvas-path="${rowPath}"]`)
        : el;
    setHeightBox(rowEl ? measure(rowEl, root) : null);
  }, [rootRef, selectedKey, selectedKind]);

  // Re-measure on selection change + reflow. We deliberately DO NOT re-measure
  // while a drag is in flight: the box is frozen to the gesture's start
  // geometry so the ghost stays anchored even as the optimistic config swap
  // reflows the canvas underneath (the gesture's pointer capture keeps the
  // moves flowing regardless).
  useEffect(() => {
    measureBox();
  }, [measureBox]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onReflow = () => {
      if (dragRef.current) return; // frozen during a gesture
      measureBox();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onReflow) : null;
    if (ro) ro.observe(root);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [rootRef, measureBox]);

  // ── Gesture math ──────────────────────────────────────────────────────────
  // Per-column pixel width = the row's pixel width / its total grid columns.
  // The row's total columns = sum of sibling item widths (relative grid). For a
  // width gesture we need the parent ROW's pixel width; the selected item box's
  // own width is one item, so we read the parent row box for the denominator.
  const rowPathForItem = useMemo(() => {
    if (!selection?.isItem) return null;
    const segs = selection.segments.slice(0, -1);
    return segs.map(s => `${s.kind}.${s.index}`).join('.');
  }, [selection]);

  // The selected item's index within its parent row. Drives the LEFT-edge
  // handle: only items past index 0 share a boundary with a previous sibling,
  // so the first item in a row gets no left handle.
  const itemIndexInRow = useMemo(() => {
    if (!selection?.isItem || !selection.segments.length) return -1;
    return selection.segments[selection.segments.length - 1].index;
  }, [selection]);
  const hasLeftNeighbor = itemIndexInRow > 0;

  // ── Faded card ────────────────────────────────────────────────────────────
  // The gesture paints ONE emphasized outline (the ghost). To keep the target
  // unambiguous, the card being resized fades underneath it rather than getting
  // a second competing frame. We set the opacity directly on the measured
  // <Dashboard> node — React never wrote an `opacity` style key on it, so a
  // re-render leaves ours alone — and always restore what was there before.
  const restoreFadedNode = useCallback(() => {
    const faded = fadedRef.current;
    fadedRef.current = null;
    if (!faded || !faded.el) return;
    faded.el.style.opacity = faded.prevOpacity || '';
    faded.el.style.transition = faded.prevTransition || '';
  }, []);

  const fadeNodeAtPath = useCallback(
    path => {
      restoreFadedNode();
      const root = rootRef.current;
      const el = root && path ? root.querySelector(`[data-canvas-path="${path}"]`) : null;
      if (!el) return;
      fadedRef.current = {
        el,
        prevOpacity: el.style.opacity,
        prevTransition: el.style.transition,
      };
      el.style.transition = 'opacity 120ms ease-out';
      el.style.opacity = DRAG_FADE_OPACITY;
    },
    [rootRef, restoreFadedNode]
  );

  // An unmount mid-gesture (route change, canvas teardown) must not leave a card
  // stranded at 35% opacity.
  useEffect(() => () => restoreFadedNode(), [restoreFadedNode]);

  const beginDrag = useCallback(
    (e, kind) => {
      if (!box || !selection) return;
      e.preventDefault();
      e.stopPropagation();
      const root = rootRef.current;

      const isWidthKind = kind === 'width' || kind === 'width-left' || kind === 'corner';
      const startCols = selection.item?.width || 1;

      // Left-edge context: the previous sibling's start width bounds how far the
      // shared boundary can move (the neighbour can't drop below width 1).
      const neighborStartCols =
        kind === 'width-left' && hasLeftNeighbor
          ? selection.itemsInRow?.[itemIndexInRow - 1]?.width || 1
          : 1;

      // Width context — MEASURED, then run through the same sum-normalized
      // formula <Dashboard> lays the row out with (canvasGridGeometry). We keep
      // the row's live pixel width, its live column gap and its start grid total
      // so every frame of the gesture can ask "what will this width RENDER as?"
      // without touching the DOM again.
      //
      // A RIGHT-EDGE (or corner) drag rebalances the row: the item's weight and
      // the row total both move, so the reachable span is only bounded by the
      // persistence clamp. A LEFT-EDGE drag TRANSFERS columns across the shared
      // boundary: the total is fixed and the neighbour cannot drop below 1.
      let rowWidth = box.width;
      let gapPx = 0;
      let startTotal = startCols;
      const rebalance = kind !== 'width-left';
      let maxCols = MAX_ITEM_WIDTH;
      if (isWidthKind && rowPathForItem && root) {
        const rowEl = root.querySelector(`[data-canvas-path="${rowPathForItem}"]`);
        const rowBox = rowEl ? measure(rowEl, root) : null;
        rowWidth = rowBox ? rowBox.width : box.width;
        gapPx = readColumnGapPx(rowEl);
        startTotal = rowGridTotal(selection.itemsInRow);
        maxCols = rebalance
          ? MAX_ITEM_WIDTH
          : Math.min(MAX_ITEM_WIDTH, startCols + Math.max(0, neighborStartCols - 1));
      }
      // The item's slot width at rest, in the row's measured pixel space. The
      // pointer delta is applied to THIS (not to the item's own measured box) so
      // the target width and the candidate widths are quoted in one space, and a
      // zero-travel gesture resolves back to `startCols` exactly.
      const startSlotPx = Math.max(
        1,
        previewItemWidthPx({
          rowWidth,
          startTotal,
          startCols,
          spanCols: startCols,
          gapPx,
          rebalance,
        })
      );

      // Height context: the gesture's row is the selection's row (item → parent
      // row; row → itself). startPx from the row's current enum/px height.
      const rowHeight = selection.row?.height;
      const startPx =
        typeof rowHeight === 'number' ? rowHeight : heightEnumToPixels(rowHeight);

      const next = {
        kind,
        startX: e.clientX,
        startY: e.clientY,
        rowWidth,
        gapPx,
        startTotal,
        rebalance,
        maxCols,
        startSlotPx,
        startCols,
        liveCols: startCols,
        liveTotal: startTotal,
        startPx,
        livePx: startPx,
        fluid: !!e.shiftKey,
        label:
          kind === 'height' || kind === 'corner'
            ? e.shiftKey
              ? `${Math.round(startPx)} px`
              : pixelsToNearestHeightEnum(startPx)
            : `${startCols} / ${startTotal}`,
        box,
      };
      dragRef.current = next;
      setDrag(next);

      // One emphasized outline (the ghost) + a faded card: dim the node the
      // gesture actually resizes — the ITEM for a width/corner drag, the whole
      // ROW for a height drag (the ghost spans the row there).
      fadeNodeAtPath(
        kind === 'height' && selectedKind === 'item' ? parentRowPathOf(selectedKey) : selectedKey
      );

      // Capture the pointer on the handle so a reflow mid-drag can't drop the
      // gesture (the canvas-overlay gotcha — the canvas reflows on the
      // optimistic config swap, but the captured handle keeps receiving moves).
      try {
        if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function') {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture is best-effort; the window-level move listener below
        // is the fallback so the gesture still completes.
      }
    },
    [
      box,
      selection,
      rowPathForItem,
      itemIndexInRow,
      hasLeftNeighbor,
      rootRef,
      selectedKey,
      selectedKind,
      fadeNodeAtPath,
    ]
  );

  // Window-level move/up handlers active only while a drag is in flight. They
  // read dragRef (stable) and recompute the live width/height from the pointer
  // delta at frame rate — pure arithmetic, no DOM reads, no reflow.
  useEffect(() => {
    if (!drag) return undefined;

    const onMove = e => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      let liveCols = d.liveCols;
      let livePx = d.livePx;
      const fluid = !!e.shiftKey;

      // Width: the pointer drags the slot's EDGE, so the span we pick is the one
      // whose RENDERED width lands nearest where the edge now is. `startSlotPx`
      // and the candidate widths both come from canvasGridGeometry, so the ghost
      // tracks the hand as closely as an integer weight allows — no fixed
      // `rowWidth / total` step that sum-normalization makes a lie.
      if (d.kind === 'width' || d.kind === 'corner' || d.kind === 'width-left') {
        // Right edge: dragging right (dx > 0) grows. Left edge: dragging LEFT
        // (dx < 0) grows, because the boundary moves away from the item.
        const targetWidthPx = d.kind === 'width-left' ? d.startSlotPx - dx : d.startSlotPx + dx;
        liveCols = nearestSpanForWidth({
          rowWidth: d.rowWidth,
          startTotal: d.startTotal,
          startCols: d.startCols,
          targetWidthPx,
          gapPx: d.gapPx,
          minCols: 1,
          maxCols: d.maxCols,
          rebalance: d.rebalance,
        });
      }
      if (d.kind === 'height' || d.kind === 'corner') {
        livePx = Math.max(48, Math.min(2048, d.startPx + dy));
      }

      // The row's grid total AFTER the drag — it moves with a right-edge drag
      // and holds still for a left-edge transfer. This is the readout's honest
      // denominator: `8 / 14`, never `8 / 12` on a row that is 14 wide.
      const liveTotal = d.rebalance
        ? Math.max(1, d.startTotal - d.startCols + liveCols)
        : d.startTotal;

      let label;
      if (d.kind === 'width' || d.kind === 'width-left') {
        label = `${liveCols} / ${liveTotal}`;
      } else if (d.kind === 'corner') {
        const hLabel = fluid ? `${Math.round(livePx)} px` : pixelsToNearestHeightEnum(livePx);
        label = `width ${liveCols} / ${liveTotal} · height ${hLabel}`;
      } else {
        label = fluid ? `${Math.round(livePx)} px` : pixelsToNearestHeightEnum(livePx);
      }

      const updated = { ...d, liveCols, liveTotal, livePx, fluid, label };
      dragRef.current = updated;
      setDrag(updated);
    };

    // Abort: drop the gesture WITHOUT committing and un-fade the card. Fires on
    // Esc and on pointercancel (the browser took the pointer away mid-gesture —
    // an interrupted drag never expressed an intent to resize).
    const onAbort = () => {
      dragRef.current = null;
      setDrag(null);
      restoreFadedNode();
      measureBox();
    };

    const onKeyDown = e => {
      if (e.key !== 'Escape' || !dragRef.current) return;
      e.preventDefault();
      onAbort();
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      restoreFadedNode();
      if (!d || !selection || !dashboardConfig) {
        measureBox();
        return;
      }

      let nextConfig = dashboardConfig;
      const fluid = d.fluid;

      // Width / corner-width → item col-span.
      if ((d.kind === 'width' || d.kind === 'corner') && selection.isItem) {
        nextConfig = setItemWidth(nextConfig, selectedKey, d.liveCols);
      }
      // Left-edge width → transfer columns across the boundary with the left
      // neighbour (this item gains `liveCols - startCols`; the neighbour loses
      // the same). Clamping lives in `resizeItemFromLeft`.
      if (d.kind === 'width-left' && selection.isItem && rowPathForItem) {
        const deltaCols = d.liveCols - d.startCols;
        nextConfig = resizeItemFromLeft(
          nextConfig,
          rowPathForItem,
          itemIndexInRow,
          deltaCols
        );
      }
      // Height / corner-height → row height (enum tick OR fluid px int).
      if (d.kind === 'height' || d.kind === 'corner') {
        const rowPath =
          selection.isItem && rowPathForItem ? rowPathForItem : selectedKey;
        // Fluid px ints are TOP-LEVEL-row only: a NESTED sub-row's height is a
        // relative weight, and Dashboard.heightToWeight maps any number to the
        // max weight — so nested rows always snap to an enum stop.
        const nested = parseCanvasPath(rowPath).length > 1;
        const nextHeight =
          fluid && !nested ? Math.round(d.livePx) : pixelsToNearestHeightEnum(d.livePx);
        nextConfig = setRowHeight(nextConfig, rowPath, nextHeight);
      }

      if (nextConfig !== dashboardConfig) {
        commitCanvasConfig(dashboardName, nextConfig, { kind: 'resize_item', fluid });
        emitWorkspaceEvent('canvas_action', {
          kind: 'resize_item',
          axis: d.kind,
          fluid,
          width: d.liveCols,
          height: fluid ? Math.round(d.livePx) : pixelsToNearestHeightEnum(d.livePx),
          path: selectedKey,
        });
      }
      // Re-measure against the (re-laid-out) canvas after the commit.
      measureBox();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onAbort);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onAbort);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    drag,
    selection,
    dashboardConfig,
    dashboardName,
    selectedKey,
    rowPathForItem,
    itemIndexInRow,
    commitCanvasConfig,
    measureBox,
    restoreFadedNode,
  ]);

  if (!dashboardConfig || !box || selectedKind === 'chrome' || !selection) return null;

  // Ghost geometry while dragging — THE TRUTHFUL PREVIEW (M26).
  //
  // The width is the pixel width the slot will actually render at once the new
  // relative weight is committed: `previewItemWidthPx` re-derives it from the
  // row's measured width, its live gap and the SUM-NORMALIZED total (which moves
  // with a right-edge drag), exactly as <Dashboard> lays the row out. We express
  // it as a RATIO against the item's own start slot so the ghost is anchored to
  // the measured box — zero travel is pixel-identical to the card underneath,
  // and any canvas scale/zoom cancels out.
  //
  // Height gestures stretch the box to their live pixel height. Pure geometry on
  // the overlay — the Dashboard render below is untouched (chart stays static).
  const previewWidthFor = spanCols =>
    previewItemWidthPx({
      rowWidth: drag.rowWidth,
      startTotal: drag.startTotal,
      startCols: drag.startCols,
      spanCols,
      gapPx: drag.gapPx,
      rebalance: drag.rebalance,
    });

  const ghost = (() => {
    if (!drag) return null;
    // A pure height drag resizes the ROW, so preview the full row box
    // (heightBox) growing — even when the gesture started from a single item's
    // bottom edge (VIS-986).
    if (drag.kind === 'height' && heightBox) {
      return {
        top: heightBox.top,
        left: heightBox.left,
        width: heightBox.width,
        height: heightBox.height * (drag.livePx / Math.max(1, drag.startPx)),
      };
    }
    let w = box.width;
    let h = box.height;
    let left = box.left;
    if (drag.kind === 'width' || drag.kind === 'corner' || drag.kind === 'width-left') {
      w = box.width * (previewWidthFor(drag.liveCols) / Math.max(1, drag.startSlotPx));
    }
    if (drag.kind === 'width-left') {
      // The left-edge gesture moves the LEFT boundary: anchor the right edge and
      // extend leftward as the span grows.
      left = box.left + box.width - w;
    }
    if (drag.kind === 'corner') {
      h = box.height * (drag.livePx / Math.max(1, drag.startPx));
    }
    return { top: box.top, left, width: w, height: h };
  })();

  // Which handles to show: an ITEM selection gets the right-edge width handle
  // PLUS the row-height handle anchored on its parent row (VIS-986 — so height
  // is reachable from the item the user actually clicked, not only from a
  // hard-to-hit row selection). A container item uses the corner for both axes,
  // so it does NOT also get the standalone height bar. A ROW selection gets the
  // bottom-edge height handle. An item with a LEFT neighbour also gets a
  // left-edge width handle that moves the shared boundary; the first item in a
  // row has no shared left boundary and so gets no left handle.
  //
  // DURING a gesture only the handle being dragged is painted: the others sit at
  // the pre-drag geometry, which the ghost has already moved on from, and a
  // solid mulberry bar at a stale edge is exactly the second emphasis M26 asks
  // us to delete.
  const dragging = !!drag;
  const showWidthHandle = selection.isItem && (!dragging || drag.kind === 'width');
  const showLeftWidthHandle =
    selection.isItem && hasLeftNeighbor && (!dragging || drag.kind === 'width-left');
  const showHeightHandle =
    !isContainerItem && !!heightBox && (!dragging || drag.kind === 'height'); // rows + non-container items
  const showCornerHandle = isContainerItem && (!dragging || drag.kind === 'corner');

  // The handle you are holding rides the GHOST's matching edge, so the affordance
  // stays under the pointer and reads as the edge you are dragging; at rest every
  // handle sits on the measured selection box.
  const widthAnchor = dragging && ghost && drag.kind !== 'height' ? ghost : box;
  const heightAnchor = drag?.kind === 'height' && ghost ? ghost : heightBox;

  const handleBase =
    'pointer-events-auto absolute z-30 transition-opacity hover:opacity-100';

  return (
    <div
      data-testid="canvas-resize-layer"
      // z-40 (above the Add Row layer's z-30): the resize handles are painted
      // only on the SELECTED node and must win the pointer over the Add Row
      // between-rows pill that sits in the same row-bottom gap — otherwise the
      // pill steals the row-height resize zone (VIS-986 follow-up).
      className="pointer-events-none absolute inset-0 z-40"
    >
      {/* Drag ghost — the live target geometry, painted only during a gesture,
          and the ONLY emphasized outline on screen while it is (M26). The card
          it will replace is faded imperatively instead of getting a second
          competing frame, so "what lands where" is unambiguous: one solid 2px
          mulberry ring at the geometry the drop produces, lifted off the canvas
          by a soft drop shadow (a shadow, not a second ring). */}
      {drag && ghost && (
        <div
          data-testid="canvas-resize-ghost"
          data-canvas-outline="emphasized"
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md"
          style={{
            top: ghost.top,
            left: ghost.left,
            width: ghost.width,
            height: ghost.height,
            background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
            boxShadow: `0 0 0 2px ${MULBERRY}, 0 10px 24px -8px rgba(17, 12, 15, 0.35)`,
          }}
        />
      )}

      {/* Item LEFT-EDGE width handle (↔). Mirrors the right-edge handle but moves
          the boundary shared with the PREVIOUS sibling — only rendered when the
          item has a left neighbour. */}
      {showLeftWidthHandle && (
        <div
          role="button"
          tabIndex={0}
          data-testid={`canvas-resize-width-left-${selectedKey}`}
          data-resize-axis="width-left"
          aria-label="Resize item width from left edge"
          title="Drag to resize width from the left"
          className={`${handleBase} opacity-80`}
          onPointerDown={e => beginDrag(e, 'width-left')}
          style={{
            top: widthAnchor.top + 6,
            left: widthAnchor.left - 3,
            width: 6,
            height: Math.max(0, widthAnchor.height - 12),
            cursor: 'col-resize',
            background: drag?.kind === 'width-left' ? MULBERRY : `${MULBERRY}99`,
            borderRadius: 3,
            touchAction: 'none',
          }}
        />
      )}

      {/* Item RIGHT-EDGE width handle (↔). A 2px rule hugging the slot's right
          edge; full mulberry on hover, col-resize cursor. */}
      {showWidthHandle && (
        <div
          role="button"
          tabIndex={0}
          data-testid={`canvas-resize-width-${selectedKey}`}
          data-resize-axis="width"
          aria-label="Resize item width"
          title="Drag to resize width"
          className={`${handleBase} opacity-80`}
          onPointerDown={e => beginDrag(e, 'width')}
          style={{
            top: widthAnchor.top + 6,
            left: widthAnchor.left + widthAnchor.width - 3,
            width: 6,
            height: Math.max(0, widthAnchor.height - 12),
            cursor: 'col-resize',
            background: drag?.kind === 'width' ? MULBERRY : `${MULBERRY}99`,
            borderRadius: 3,
            touchAction: 'none',
          }}
        />
      )}

      {/* Row BOTTOM-EDGE height handle (↕). Anchored on the height-governing ROW
          box, so it spans the full row at its bottom edge — reachable whether
          the user selected the row or just one of its items (VIS-986). */}
      {showHeightHandle && (
        <div
          role="button"
          tabIndex={0}
          data-testid={`canvas-resize-height-${selectedKey}`}
          data-resize-axis="height"
          aria-label="Resize row height"
          title="Drag to resize row height (small / medium / large / xlarge) — hold Shift for a precise pixel value"
          className={`${handleBase} opacity-80`}
          onPointerDown={e => beginDrag(e, 'height')}
          style={{
            // A taller hit zone (10px) so the row-height handle is easy to grab
            // (VIS-986 follow-up — a 6px strip was too fiddly to land on).
            top: heightAnchor.top + heightAnchor.height - 5,
            left: heightAnchor.left + 6,
            width: Math.max(0, heightAnchor.width - 12),
            height: 10,
            cursor: 'row-resize',
            background: drag?.kind === 'height' ? MULBERRY : `${MULBERRY}99`,
            borderRadius: 4,
            touchAction: 'none',
          }}
        />
      )}

      {/* Container CORNER handle (⤡ both axes). */}
      {showCornerHandle && (
        <div
          role="button"
          tabIndex={0}
          data-testid={`canvas-resize-corner-${selectedKey}`}
          data-resize-axis="corner"
          aria-label="Resize container width and height"
          title="Drag to resize width and height"
          className={`${handleBase} opacity-90`}
          onPointerDown={e => beginDrag(e, 'corner')}
          style={{
            top: widthAnchor.top + widthAnchor.height - 9,
            left: widthAnchor.left + widthAnchor.width - 9,
            width: 14,
            height: 14,
            cursor: 'se-resize',
            background: '#fff',
            border: `2px solid ${MULBERRY}`,
            borderRadius: 3,
            touchAction: 'none',
          }}
        />
      )}

      {/* Live readout — rides the GHOST's active edge during the gesture, so the
          number sits on the geometry it describes. A width readout is honest
          about the row it lands in: `N / <row total>` (the total a right-edge
          drag rebalances TO), never `N / 12` on a row that is not 12 wide. For a
          height tick drag it shows the HeightEnum stack with the active stop
          mulberry-filled; otherwise a single readout pill. */}
      {drag && (
        <div
          data-testid="canvas-resize-readout"
          aria-hidden="true"
          className="pointer-events-none absolute z-40"
          style={{
            top: Math.max(2, (ghost || box).top - 8),
            left:
              drag.kind === 'height'
                ? (heightAnchor || box).left + (heightAnchor || box).width / 2 - 40
                : drag.kind === 'width-left'
                  ? widthAnchor.left
                  : widthAnchor.left + widthAnchor.width - 30,
          }}
        >
          {drag.kind === 'height' && !drag.fluid ? (
            <div className="flex flex-col gap-0.5 rounded-md bg-white/95 p-1 shadow-md ring-1 ring-primary-200">
              {HEIGHT_ENUM_STOPS.map(stop => {
                const active = stop.label === drag.label;
                return (
                  <span
                    key={stop.label}
                    data-active={active ? 'true' : 'false'}
                    className="rounded px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={{
                      background: active ? MULBERRY : 'transparent',
                      color: active ? '#fff' : '#6b7280',
                    }}
                  >
                    {stop.label}
                  </span>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-md tabular-nums"
              style={{ background: MULBERRY }}
            >
              {drag.label}
              {drag.fluid && drag.kind !== 'width' ? ' · fluid' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CanvasResizeLayer;
