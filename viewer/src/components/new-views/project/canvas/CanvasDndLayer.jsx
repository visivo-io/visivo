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

// ── Drag handle ────────────────────────────────────────────────────────────
// A grip positioned at the top-left of a row/item box. Dragging it starts a
// canvas reorder. `rowPath` is the path of the ROW the item lives in (for an
// item) so the router can reorder within it.
const CanvasDragHandle = ({ id, box, kind, dragData, label, visible }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: dragData });
  // Reveal grips only on hover-or-selection (VIS-771 follow-up) — an always-on
  // grip over every row/item reads as clutter. Keep the actively-dragged grip
  // mounted (`isDragging`) so a hover change mid-drag can't unmount it and abort
  // the gesture.
  if (!box || (!visible && !isDragging)) return null;
  const isRow = kind === 'row';
  // Rows: handle sits in the LEFT GUTTER beside the row (clamped to ≥2px so it
  // never escapes the canvas) and is taller — this keeps it clear of the row's
  // first ITEM handle, which sits at the item's top-left corner. Without the
  // gutter offset the row + item-0 handles overlap and the item handle (painted
  // last) swallows every row-drag pointer.
  const top = isRow ? box.top + box.height / 2 - 16 : box.top + 4;
  const left = isRow ? Math.max(2, box.left - 22) : box.left + 4;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      data-testid={`canvas-drag-handle-${id}`}
      data-canvas-handle-kind={kind}
      // Carry the SAME composite path as the row/item the grip belongs to. This
      // (a) keeps the grip revealed while the cursor is on it — the selection
      // overlay resolves hover via `closest('[data-canvas-path]')`, which without
      // this would resolve the grip to dashboard-chrome and clear the hover that
      // revealed it, making the grip vanish as you reach for it — and (b) makes a
      // plain click on the grip select that row/item (handy for selecting a row,
      // whose chrome is otherwise mostly covered by its items). Dashboard's own
      // path node renders earlier in the DOM, so geometry queries (querySelector)
      // still resolve to the real row/item box, not this grip.
      data-canvas-path={id}
      aria-label={label}
      title={label}
      className="pointer-events-auto absolute z-20 inline-flex items-center justify-center rounded-md border border-[#c6b0bb] bg-white/95 text-[#713b57] shadow-sm transition-opacity hover:bg-[#f9f6f8]"
      style={{
        top,
        left,
        width: 18,
        height: isRow ? 32 : 18,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
      }}
    >
      {/* Six-dot grip (matches the Library row grip idiom). */}
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="3.5" cy="3" r="1" />
          <circle cx="8.5" cy="3" r="1" />
          <circle cx="3.5" cy="6" r="1" />
          <circle cx="8.5" cy="6" r="1" />
          <circle cx="3.5" cy="9" r="1" />
          <circle cx="8.5" cy="9" r="1" />
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
 * the config (top-level row count + per-row item counts + which items are
 * containers) from the store, then measure each `data-canvas-path` node. The
 * gaps are derived from adjacent item/row boxes.
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

    rows.forEach((row, ri) => {
      const rowPath = `row.${ri}`;
      const rowBox = at(rowPath);
      if (!rowBox) return;

      // Row drag handle.
      handles.push({
        id: rowPath,
        box: rowBox,
        kind: 'row',
        label: `Reorder row ${ri + 1}`,
        dragData: { source: 'canvas', kind: 'row', rowIndex: ri, rowPath },
      });

      const items = Array.isArray(row.items) ? row.items : [];
      const itemBoxes = items.map((_, ii) => at(`${rowPath}.item.${ii}`));

      items.forEach((item, ii) => {
        const itemPath = `${rowPath}.item.${ii}`;
        const box = itemBoxes[ii];
        if (!box) return;
        const isContainer = Array.isArray(item.rows) && item.rows.length > 0;

        // Item drag handle.
        handles.push({
          id: itemPath,
          box,
          kind: 'item',
          label: `Reorder item ${ii + 1} in row ${ri + 1}`,
          dragData: {
            source: 'canvas',
            kind: 'item',
            rowPath,
            itemIndex: ii,
            refType: itemRefType(item),
            label: itemRefName(item),
          },
        });

        // between-items drop zone in the gap BEFORE this item (index ii).
        const prevBox = ii > 0 ? itemBoxes[ii - 1] : null;
        const gapLeft = prevBox ? prevBox.left + prevBox.width : box.left - 12;
        zones.push({
          id: `${rowPath}-before-${ii}`,
          intent: 'between-items',
          box: { top: box.top, left: gapLeft - 6, width: Math.max(12, box.left - gapLeft + 12), height: box.height },
          data: {
            kind: 'canvas-drop',
            dashboardName,
            config: dashboardConfig,
            target: { kind: 'between-items', rowPath, index: ii },
          },
        });

        // on-item drop zone over the slot itself (VIS-901 #4) — lets a Library
        // object be dropped DIRECTLY onto an existing slot (fill an empty slot,
        // or insert before a filled one). Painted as a tinted region like
        // in-container; only acted on for Library drags by the router. Skipped
        // for container items (they get the in-container zone instead).
        if (!isContainer) {
          zones.push({
            id: `${itemPath}-on-item`,
            intent: 'on-item',
            box,
            data: {
              kind: 'canvas-drop',
              dashboardName,
              config: dashboardConfig,
              target: { kind: 'on-item', rowPath, index: ii },
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
        }
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

      // between-rows drop zone in the gap before this row (top-level only). The
      // hit box is widened to ±18px around the gap centre (a comfortable target
      // for the thin inter-row gap); the bar is painted at the true gap centre.
      const prevRowBox = ri > 0 ? at(`row.${ri - 1}`) : null;
      const gapCenter = prevRowBox
        ? (prevRowBox.top + prevRowBox.height + rowBox.top) / 2
        : rowBox.top - 6;
      // Keep the band inside the inter-row gap so it doesn't overlap (and steal
      // the collision from) the item drop zones at a row's top edge.
      const HALF = 11;
      zones.push({
        id: `row-before-${ri}`,
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
          target: { kind: 'between-rows', index: ri },
        },
      });
    });

    // between-rows zone AFTER the last row (append). A generous 36px band so
    // the trailing append target is easy to hit below the last row.
    const lastRowBox = at(`row.${rows.length - 1}`);
    if (lastRowBox) {
      zones.push({
        id: `row-before-${rows.length}`,
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
          target: { kind: 'between-rows', index: rows.length },
        },
      });
    }

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

// Is `key` the row at `rowPath`, or any descendant item/row within it? Used to
// reveal a row's grip when the cursor is over (or selection is on) any of its
// items, so row-drag is reachable from anywhere in the row.
const keyWithinRow = (key, rowPath) =>
  !!key && (key === rowPath || key.startsWith(`${rowPath}.`));

// Should a handle be revealed given the current hover + selection keys?
const isHandleVisible = (handle, hoverKey, selectedKey) => {
  if (handle.kind === 'row') {
    return keyWithinRow(hoverKey, handle.id) || keyWithinRow(selectedKey, handle.id);
  }
  // Item grips reveal only for that exact item.
  return hoverKey === handle.id || selectedKey === handle.id;
};

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
      {handles.map(h => (
        <CanvasDragHandle
          key={h.id}
          id={h.id}
          box={h.box}
          kind={h.kind}
          dragData={h.dragData}
          label={h.label}
          visible={isHandleVisible(h, hoverKey, selectedKey)}
        />
      ))}
    </div>
  );
};

export default CanvasDndLayer;
