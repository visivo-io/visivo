import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import useStore from '../../../../stores/store';
import { parseRefValue } from '../../../../utils/refString';

/**
 * CanvasDndLayer — VIS-771 / Track D D-3.
 *
 * The drag-and-drop affordance overlay for the Workspace dashboard canvas. It
 * is a SIBLING layer over the render-only <Dashboard> (mounted by ProjectCanvas
 * next to CanvasSelectionOverlay), so it never mutates Dashboard's render — it
 * MEASURES the live DOM via the same composite `data-canvas-path` markers the
 * selection overlay reads, then paints:
 *
 *   - a **drag handle** (grip) over every row + item box → a dnd-kit
 *     `useDraggable` whose drag preview is the source pill (the shared
 *     <DragOverlay> in WorkspaceDndContext renders it; §2.6 — no thumbnails).
 *   - **drop zones** in the gaps → dnd-kit `useDroppable`s carrying a
 *     `{ kind: 'canvas-drop', target, dashboardName, config }` payload that the
 *     shared `routeWorkspaceDragEnd` router turns into a reorder / insert and
 *     commits through the dashboard save path.
 *
 * Drop intents (matching the D-2 mockup):
 *   - between-items  → vertical mulberry bar in an item gap.
 *   - end-of-row     → vertical mulberry bar at a row's trailing edge (append).
 *   - between-rows   → horizontal mulberry bar in a top-level row gap.
 *   - in-container   → mulberry-tinted region over a container item (append a
 *                      sub-row).
 *
 * There is NO second DndContext: every draggable/droppable here talks to the
 * single shell-level <WorkspaceDndContext>. The overlay layer itself is
 * pointer-events-none; only the handles + drop zones opt back into pointer
 * events so Dashboard's own interactivity (Plotly hover, links) is preserved.
 *
 * Mulberry (`#713b57`) is the active/insertion colour (NOT a type colour).
 */

const MULBERRY = '#713b57';

// Measure a node's box relative to the overlay root (so we can absolutely
// position handles/zones inside the same positioned ancestor).
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

/** The referenced object type for a dashboard item (for the drag pill). */
const itemRefType = item => {
  if (!item || typeof item !== 'object') return 'chart';
  if (item.chart) return 'chart';
  if (item.table) return 'table';
  if (item.markdown) return 'markdown';
  if (item.input) return 'input';
  if (Array.isArray(item.rows)) return 'dashboard';
  return 'chart';
};

const itemRefName = item => {
  if (!item || typeof item !== 'object') return 'item';
  const raw = item.chart || item.table || item.markdown || item.input;
  if (typeof raw === 'string') return parseRefValue(raw) || 'item';
  return 'item';
};

// ── Frame grab (VIS-975) ─────────────────────────────────────────────────────
// The drag affordance for the SELECTED row/item: a grab-able border ring around
// the node's box. This REPLACES the former six-dot grip icon — instead of a
// floating handle, the user grips the frame of the container they already have
// selected (the gesture the issue asked for).
//
// Why a ring (four edge strips) and not the whole body: the centre is left
// OPEN, so the chart/table/input inside the slot keeps full interactivity
// (Plotly hover/zoom, table scroll, links) even while the node is selected —
// only the ~12px border opts into pointer events. The resize layer paints in a
// HIGHER stacking layer (z-20 vs this layer's z-10), so its edge handles still
// win on the edges they occupy; move (this) + resize coexist on one frame.
//
// Click-vs-drag is handled by the shared PointerSensor's 5px activation
// constraint: a press that doesn't travel 5px is a click (re-selects via the
// selection overlay's root delegation), past 5px it's a drag.
const FRAME = 12; // px thickness of the grab ring

const CanvasFrameGrab = ({ id, box, kind, dragData, label, visible }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: dragData });
  // Rendered only for the SELECTED node. Keep it mounted while it is the active
  // drag (`isDragging`) so a selection change mid-drag can't unmount the source
  // and abort the gesture.
  if (!box || (!visible && !isDragging)) return null;

  const grabCursor = isDragging ? 'grabbing' : 'grab';
  const stripBase = {
    position: 'absolute',
    background: 'transparent',
    cursor: grabCursor,
    touchAction: 'none',
  };
  // Each edge strip carries the SAME drag listeners (any edge starts the drag)
  // AND the composite `data-canvas-path`: a plain (<5px) click on ANY edge of the
  // frame must re-select this exact node via the selection overlay's root
  // delegation (`closest('[data-canvas-path]')`). Without the path on every
  // strip, a click on a non-primary edge would walk up to the canvas chrome and
  // silently DESELECT to the dashboard. Dashboard's own path node renders earlier
  // in the DOM, so box queries (querySelector) still resolve to the real slot,
  // not these strips. The TOP strip is additionally the primary activator: it
  // carries the dnd-kit `attributes`, the testid, and the aria role/label.
  const strip = (key, rect, primary = false) => (
    <div
      key={key}
      {...listeners}
      data-canvas-path={id}
      {...(primary
        ? {
            ...attributes,
            'data-testid': `canvas-drag-frame-${id}`,
            'data-canvas-handle-kind': kind,
            'aria-label': label,
            title: label,
            role: 'button',
          }
        : { 'aria-hidden': 'true' })}
      className="pointer-events-auto"
      style={{ ...stripBase, ...rect }}
    />
  );

  return (
    <div
      ref={setNodeRef}
      data-canvas-frame={id}
      className="pointer-events-none absolute z-20"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {strip('top', { top: 0, left: 0, width: box.width, height: FRAME }, true)}
      {strip('bottom', { bottom: 0, left: 0, width: box.width, height: FRAME })}
      {strip('left', { top: 0, left: 0, width: FRAME, height: box.height })}
      {strip('right', { top: 0, right: 0, width: FRAME, height: box.height })}
    </div>
  );
};

// ── Row grab gutter (VIS-990) ────────────────────────────────────────────────
// A row's body is covered by its items, so a single-item row's item-frame and
// row-frame would coincide — ambiguous. Rows therefore get a DISTINCT affordance:
// a grab handle in the LEFT gutter (outside the items). Clicking it selects the
// ROW (it carries the row's data-canvas-path); dragging it drags the row. It is
// shown consistently for EVERY row (any item count) whenever the row is hovered
// or selected, so item-vs-row is always visually unambiguous.
const ROW_GUTTER_W = 16;

const CanvasRowGutter = ({ id, box, dragData, label, visible }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: dragData });
  if (!box || (!visible && !isDragging)) return null;
  // Sit in the left margin; clamp to ≥2px so it never escapes the canvas (then it
  // overlaps the row's leading edge, which is fine — that strip selects the row).
  const left = Math.max(2, box.left - ROW_GUTTER_W - 2);
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      data-testid={`canvas-drag-frame-${id}`}
      data-canvas-handle-kind="row"
      data-canvas-path={id}
      aria-label={label}
      title={label}
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-md border border-[#c6b0bb] bg-white/95 text-[#713b57] shadow-sm transition-opacity hover:bg-[#f9f6f8]"
      style={{
        top: box.top,
        left,
        width: ROW_GUTTER_W,
        height: Math.max(24, box.height),
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
      }}
    >
      {/* Vertical six-dot grip — reads as a row drag handle. */}
      <svg viewBox="0 0 12 16" width="11" height="15" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="4" cy="4" r="1" />
          <circle cx="8" cy="4" r="1" />
          <circle cx="4" cy="8" r="1" />
          <circle cx="8" cy="8" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="8" cy="12" r="1" />
        </g>
      </svg>
    </button>
  );
};

// ── Drop zone ────────────────────────────────────────────────────────────────
// A droppable region painting a mulberry insertion bar / tinted region when it
// is the active target under the cursor. `intent` styles the indicator.
const CanvasDropZone = ({ id, box, intent, data }) => {
  const { setNodeRef, isOver, active } = useDroppable({ id, data });
  if (!box) return null;
  const isDragging = !!active;
  // Opt into pointer events ONLY while a drag is in progress. At rest the zone is
  // pointer-events-none so it never swallows a canvas selection click (VIS-768
  // row/item selection); during a drag it must capture pointer events so the drop
  // registers and reorder/insert commits.
  const peClass = isDragging ? 'pointer-events-auto' : 'pointer-events-none';

  // Hit areas are generous (the gaps are thin); the visible indicator is the
  // mulberry bar/region, shown only while a drag is over this zone.
  const common = {
    ref: setNodeRef,
    'data-testid': `canvas-dropzone-${id}`,
    'data-intent': intent,
    'data-over': isOver ? 'true' : 'false',
  };

  if (intent === 'between-rows') {
    // The hit box is intentionally taller than the visible gap (it extends into
    // the adjacent rows) so the thin row gap is a comfortable drop target. The
    // mulberry bar is painted at `barTop` (the true gap centre within the box).
    const barTop = typeof box.barTop === 'number' ? box.barTop : box.height / 2 - 1.5;
    return (
      <div
        {...common}
        className={`${peClass} absolute z-20`}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      >
        {isDragging && isOver && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              left: 0,
              right: 0,
              top: barTop,
              height: 3,
              background: MULBERRY,
              boxShadow: '0 0 0 2px rgba(113,59,87,0.18)',
            }}
          />
        )}
      </div>
    );
  }

  if (intent === 'on-item' || intent === 'in-container') {
    // Slot-fill / container drop → a tinted region over the slot. `on-item`
    // sits BELOW the thin between-items/end-of-row bars (z-[18] < z-20) so a
    // precise edge drop still resolves to the insertion bar, while a drop over
    // the slot body resolves here.
    const z = intent === 'on-item' ? 'z-[18]' : 'z-[19]';
    return (
      <div
        {...common}
        className={`${peClass} absolute ${z}`}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      >
        {isDragging && isOver && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{
              background: 'rgba(113,59,87,0.08)',
              boxShadow: `inset 0 0 0 2px ${MULBERRY}, inset 0 0 0 4px rgba(255,255,255,0.6)`,
            }}
          />
        )}
      </div>
    );
  }

  // between-items / end-of-row → vertical bar.
  return (
    <div
      {...common}
      className={`${peClass} absolute z-20`}
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
    >
      {isDragging && isOver && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left: box.width / 2 - 1.5,
            top: 0,
            bottom: 0,
            width: 3,
            background: MULBERRY,
            boxShadow: '0 0 0 2px rgba(113,59,87,0.18)',
          }}
        />
      )}
    </div>
  );
};

/**
 * Build the list of handles + drop zones from the live DOM geometry. We read
 * the config (the FULL nested row/item tree — top-level rows, their items,
 * which items are containers, and recursively their sub-rows/items) from the
 * store, then measure each `data-canvas-path` node. The gaps are derived from
 * adjacent item/row boxes.
 *
 * VIS-903: the builder RECURSES through nested `Item.rows`. Every row and item
 * — at ANY depth — gets the same affordances as a top-level one: a drag grip
 * (gated on hover/selection), between-items / end-of-row / on-item / in-container
 * drop zones, and a between-rows insertion band scoped to its sibling rows.
 * The composite `data-canvas-path` keys already encode arbitrary depth, and the
 * reorder helpers + router already resolve nested paths (item reorder is gated on
 * `target.rowPath === dragData.rowPath`, which holds for nested rows), so the
 * recursion just has to EMIT the affordances for the deeper nodes.
 */
const useCanvasDndModel = (rootRef, dashboardName, dashboardConfig) => {
  const [model, setModel] = useState({ handles: [], zones: [] });

  const rows = useMemo(
    () => (Array.isArray(dashboardConfig?.rows) ? dashboardConfig.rows : []),
    [dashboardConfig]
  );

  const rebuild = useCallback(() => {
    const root = rootRef.current;
    if (!root || !rows.length) {
      setModel({ handles: [], zones: [] });
      return;
    }
    const handles = [];
    const zones = [];
    const at = path => {
      const el = root.querySelector(`[data-canvas-path="${path}"]`);
      return el ? measure(el, root) : null;
    };

    // Emit affordances for ONE item at `itemPath` (its grip, its before-gap
    // drop zone, and either its on-item or in-container zone). `prevBox` is the
    // measured box of the previous sibling item (for the before-gap geometry);
    // `labelCtx` is a human-readable position for the grip's aria-label.
    const emitItem = (item, itemPath, rowPath, ii, box, prevBox, labelCtx, rowLeft) => {
      const isContainer = Array.isArray(item.rows) && item.rows.length > 0;
      // An empty slot (no leaf ref, no sub-rows): its on-item zone is a fillable
      // drop target for canvas item drags (VIS-989), not just Library drags.
      const isEmpty =
        !item.chart && !item.table && !item.markdown && !item.input && !isContainer;

      handles.push({
        id: itemPath,
        box,
        kind: 'item',
        label: `Reorder ${labelCtx}`,
        dragData: {
          source: 'canvas',
          kind: 'item',
          rowPath,
          itemIndex: ii,
          refType: itemRefType(item),
          label: itemRefName(item),
        },
      });

      // between-items drop zone in the gap BEFORE this item (index ii). The zone
      // spans from just left of the gap to the item's left edge; its left edge is
      // clamped to the parent row's left (VIS-974) so a NESTED first item's gap
      // can't spill out of its container and overlap the enclosing row's gaps
      // (which would make a nested item drag ambiguous at the container's edge).
      const gapLeft = prevBox ? prevBox.left + prevBox.width : box.left - 12;
      const rightEdge = box.left + 6;
      const rawLeft = gapLeft - 6;
      const zoneLeft = typeof rowLeft === 'number' ? Math.max(rowLeft, rawLeft) : rawLeft;
      zones.push({
        id: `${rowPath}-before-${ii}`,
        intent: 'between-items',
        box: {
          top: box.top,
          left: zoneLeft,
          width: Math.max(12, rightEdge - zoneLeft),
          height: box.height,
        },
        data: {
          kind: 'canvas-drop',
          dashboardName,
          config: dashboardConfig,
          target: { kind: 'between-items', rowPath, index: ii },
        },
      });

      // on-item drop zone over the slot itself (VIS-901 #4). For a FILLED slot
      // this is a Library-only affordance; for an EMPTY slot (`empty: true`) it
      // also accepts a canvas item drag, which fills the slot (VIS-989). Skipped
      // for container items (they get the in-container zone).
      if (!isContainer) {
        zones.push({
          id: `${itemPath}-on-item`,
          intent: 'on-item',
          box,
          data: {
            kind: 'canvas-drop',
            dashboardName,
            config: dashboardConfig,
            target: { kind: 'on-item', rowPath, index: ii, empty: isEmpty },
          },
        });
      }

      // in-container drop zone over container items.
      if (isContainer) {
        zones.push({
          id: `${itemPath}-container`,
          intent: 'in-container',
          box,
          data: {
            kind: 'canvas-drop',
            dashboardName,
            config: dashboardConfig,
            target: { kind: 'in-container', itemPath },
          },
        });
        // Recurse into the container's sub-rows.
        emitRows(item.rows, itemPath, labelCtx);
      }
    };

    // Emit affordances for a list of sibling `rows` living under `parentPath`
    // (`''` for the top-level dashboard rows, else a container item path). Walks
    // each row → its grip, its items (via emitItem, which recurses into nested
    // containers), its end-of-row zone, and the between-rows bands that scope to
    // THESE siblings (so a between-rows drop inserts a new sub-row in the right
    // container, not always at the top level).
    function emitRows(siblingRows, parentPath, parentLabel) {
      const prefix = parentPath ? `${parentPath}.` : '';
      const rowBoxes = siblingRows.map((_, ri) => at(`${prefix}row.${ri}`));

      siblingRows.forEach((row, ri) => {
        const rowPath = `${prefix}row.${ri}`;
        const rowBox = rowBoxes[ri];
        if (!rowBox) return;
        const rowLabel = parentLabel
          ? `row ${ri + 1} in ${parentLabel}`
          : `row ${ri + 1}`;

        // Row drag handle. Top-level rows carry a `rowIndex` (the router uses it
        // for the top-level row reorder); nested rows carry their `rowPath` only
        // (nested-row reorder is handled as a between-rows insert within the
        // container, and nested rows are dragged less often than their items).
        handles.push({
          id: rowPath,
          box: rowBox,
          kind: 'row',
          label: `Reorder ${rowLabel}`,
          dragData: parentPath
            ? { source: 'canvas', kind: 'row', rowPath }
            : { source: 'canvas', kind: 'row', rowIndex: ri, rowPath },
        });

        const items = Array.isArray(row.items) ? row.items : [];
        const itemBoxes = items.map((_, ii) => at(`${rowPath}.item.${ii}`));

        items.forEach((item, ii) => {
          const box = itemBoxes[ii];
          if (!box) return;
          emitItem(
            item,
            `${rowPath}.item.${ii}`,
            rowPath,
            ii,
            box,
            ii > 0 ? itemBoxes[ii - 1] : null,
            `item ${ii + 1} in ${rowLabel}`,
            rowBox.left
          );
        });

        // end-of-row drop zone at the row's trailing edge.
        const lastBox = itemBoxes[itemBoxes.length - 1];
        if (lastBox) {
          zones.push({
            id: `${rowPath}-end`,
            intent: 'end-of-row',
            box: {
              top: lastBox.top,
              left: lastBox.left + lastBox.width - 6,
              width: 18,
              height: lastBox.height,
            },
            data: {
              kind: 'canvas-drop',
              dashboardName,
              config: dashboardConfig,
              target: { kind: 'end-of-row', rowPath },
            },
          });
        }

        // between-rows drop zone in the gap before this row, scoped to this
        // sibling group. The id is prefixed with the parent path so nested bands
        // don't collide with the top-level ones. The hit box is widened to ±11px
        // around the gap centre; the bar is painted at the true gap centre. For
        // nested rows the target carries the `containerPath` so the router
        // inserts the new sub-row into the right container.
        const prevRowBox = ri > 0 ? rowBoxes[ri - 1] : null;
        const gapCenter = prevRowBox
          ? (prevRowBox.top + prevRowBox.height + rowBox.top) / 2
          : rowBox.top - 6;
        const HALF = 11;
        zones.push({
          id: `${prefix}row-before-${ri}`,
          intent: 'between-rows',
          box: {
            top: gapCenter - HALF,
            left: rowBox.left,
            width: rowBox.width,
            height: HALF * 2,
            barTop: HALF - 1.5,
          },
          data: {
            kind: 'canvas-drop',
            dashboardName,
            config: dashboardConfig,
            target: parentPath
              ? { kind: 'between-rows', index: ri, containerPath: parentPath }
              : { kind: 'between-rows', index: ri },
          },
        });
      });

      // between-rows zone AFTER the last sibling row (append). A generous 36px
      // band so the trailing append target is easy to hit below the last row.
      const lastRowBox = rowBoxes[rowBoxes.length - 1];
      if (lastRowBox) {
        zones.push({
          id: `${prefix}row-before-${siblingRows.length}`,
          intent: 'between-rows',
          box: {
            top: lastRowBox.top + lastRowBox.height,
            left: lastRowBox.left,
            width: lastRowBox.width,
            height: 36,
            barTop: 4,
          },
          data: {
            kind: 'canvas-drop',
            dashboardName,
            config: dashboardConfig,
            target: parentPath
              ? { kind: 'between-rows', index: siblingRows.length, containerPath: parentPath }
              : { kind: 'between-rows', index: siblingRows.length },
          },
        });
      }
    }

    emitRows(rows, '', null);

    setModel({ handles, zones });
  }, [rootRef, rows, dashboardName, dashboardConfig]);

  // Initial + on-change measure. A PASSIVE effect (not layout) on purpose:
  // <CanvasDndLayer> is a SIBLING rendered over the canvas-path nodes inside a
  // parent-owned `rootRef`. With a ref OBJECT, the parent's ref is not yet
  // attached when a child's *layout* effect runs (child layout effects fire
  // before the parent ref attaches), so a layout-effect rebuild would measure
  // against a null root on mount. A passive effect runs after the whole tree
  // (incl. parent refs) commits. The layer paints no dashboard layout, so the
  // one-frame-later paint is imperceptible.
  useEffect(() => {
    rebuild();
  }, [rebuild]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      // Root not attached yet (mount race) — retry on the next frame so the
      // ResizeObserver can bind once the parent ref lands.
      const raf =
        typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(rebuild) : null;
      return () => {
        if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      };
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rebuild) : null;
    if (ro) ro.observe(root);
    window.addEventListener('resize', rebuild);
    window.addEventListener('scroll', rebuild, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', rebuild);
      window.removeEventListener('scroll', rebuild, true);
    };
  }, [rootRef, rebuild]);

  return model;
};

// Is `key` the row at `rowPath` itself, or one of its DIRECT item children
// (`rowPath.item.N` with no deeper nesting)? Used to reveal a row's gutter only
// for its OWN level — a deeply nested selection reveals its immediate enclosing
// row's gutter, not every ancestor row's, so the affordances don't stack up.
const isDirectlyInRow = (key, rowPath) => {
  if (!key) return false;
  if (key === rowPath) return true;
  const prefix = `${rowPath}.item.`;
  if (!key.startsWith(prefix)) return false;
  return /^\d+$/.test(key.slice(prefix.length));
};

// Should an ITEM's frame-grab be revealed? VIS-975: drag grips the SELECTED
// item's frame, so it shows only for the EXACT selected item — exactly one item
// frame at a time, and hovering an item paints no item frame (the chart stays
// clean until you select it).
const isItemFrameVisible = (handle, selectedKey) => handle.id === selectedKey;

// Should a ROW's grab gutter be revealed? VIS-990: shown CONSISTENTLY for every
// row (any item count) whenever the row itself, or one of its direct items, is
// hovered OR selected — a single-item row's item-frame is otherwise
// indistinguishable from its row, so the row always carries its own left-gutter
// affordance, discoverable on hover and shown alongside a selected child item.
const isRowGutterVisible = (handle, hoverKey, selectedKey) =>
  isDirectlyInRow(hoverKey, handle.id) || isDirectlyInRow(selectedKey, handle.id);

const CanvasDndLayer = ({ rootRef, dashboardName }) => {
  const dashboards = useStore(s => s.dashboards);
  const hoverKey = useStore(s => s.workspaceCanvasHoverKey);
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  const { handles, zones } = useCanvasDndModel(rootRef, dashboardName, dashboardConfig);

  if (!dashboardConfig) return null;

  return (
    <div
      data-testid="canvas-dnd-layer"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {zones.map(z => (
        <CanvasDropZone key={z.id} id={z.id} box={z.box} intent={z.intent} data={z.data} />
      ))}
      {handles.map(h =>
        h.kind === 'row' ? (
          <CanvasRowGutter
            key={h.id}
            id={h.id}
            box={h.box}
            dragData={h.dragData}
            label={h.label}
            visible={isRowGutterVisible(h, hoverKey, selectedKey)}
          />
        ) : (
          <CanvasFrameGrab
            key={h.id}
            id={h.id}
            box={h.box}
            kind={h.kind}
            dragData={h.dragData}
            label={h.label}
            visible={isItemFrameVisible(h, selectedKey)}
          />
        )
      )}
    </div>
  );
};

export default CanvasDndLayer;
