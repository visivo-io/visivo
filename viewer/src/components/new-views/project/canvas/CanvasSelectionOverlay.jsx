import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import useStore from '../../../../stores/store';
import { emitWorkspaceEvent } from '../../workspace/telemetry';

/**
 * CanvasSelectionOverlay — VIS-D2 / VIS-768.
 *
 * The editing-affordance overlay layer for the Workspace dashboard canvas.
 * <ProjectCanvas> wraps the render-only <DashboardNew>; this component sits
 * ABOVE that render (a sibling absolutely-positioned layer) and:
 *
 *   1. Reads the rendered DashboardNew DOM via event delegation. Rows carry
 *      `data-row-index` (set by DashboardNew); top-level item slots carry
 *      `data-canvas-item-index` (additive marker — inert in View mode). The
 *      overlay never mutates that render — it measures it with
 *      getBoundingClientRect and paints rings on top.
 *
 *   2. Writes the workspace selection to `workspaceOutlineSelectedKey` — the
 *      SAME key the OutlineTreePanel uses. Key scheme (matching the base):
 *        - `dashboard`            → dashboard-chrome (click empty canvas)
 *        - `row.N`                → row N (click a row gutter / row chrome)
 *        - `row.N.item.M`         → item M in row N
 *      This makes the canvas + Outline tree ONE selection source of truth.
 *
 *   3. Paints overlays per the D-1 selection-state design
 *      (design/cofounder-mockups/D-1 Project Canvas.html):
 *        - Hover item/row → subtle mulberry-200 outline + a resize-handle
 *          PLACEHOLDER (no resize gesture — that's D-3).
 *        - Selected item/row → persistent mulberry-500 ring (with offset).
 *        - Dashboard-chrome selected → subtle inset outer border on the canvas.
 *
 * Mulberry / primary (`#713b57`) is the SELECTION colour only — type colours
 * (rainbow) come from objectTypeConfigs.js elsewhere and are never used here.
 *
 * Right-rail mount + the full hover toolbar are out of scope (G-1 / D-4): D-2
 * only SETS selection state and renders the rings + resize-handle placeholder.
 */

// --- Selection key helpers (mirror OutlineTreePanel's scheme) --------------
const dashboardKey = () => 'dashboard';
const rowKey = ri => `row.${ri}`;
const itemKey = (ri, ii) => `row.${ri}.item.${ii}`;

/**
 * Resolve a pointer event's target to a selection target descriptor:
 *   `{ kind: 'item', row, item }` | `{ kind: 'row', row }` | `{ kind: 'chrome' }`
 *
 * Walks up from the event target: the nearest `[data-canvas-item-index]` with
 * a `[data-row-index]` ancestor is an item; a `[data-row-index]` with no item
 * is the row chrome; anything else inside the canvas is dashboard chrome.
 */
const resolveTarget = (eventTarget, rootEl) => {
  if (!eventTarget || !rootEl || !rootEl.contains(eventTarget)) return null;

  const itemEl = eventTarget.closest('[data-canvas-item-index]');
  const rowEl = eventTarget.closest('[data-row-index]');

  if (itemEl && rowEl && rowEl.contains(itemEl)) {
    const ri = Number(rowEl.getAttribute('data-row-index'));
    const ii = Number(itemEl.getAttribute('data-canvas-item-index'));
    if (Number.isInteger(ri) && Number.isInteger(ii)) {
      return { kind: 'item', row: ri, item: ii, el: itemEl };
    }
  }
  if (rowEl) {
    const ri = Number(rowEl.getAttribute('data-row-index'));
    if (Number.isInteger(ri)) return { kind: 'row', row: ri, el: rowEl };
  }
  return { kind: 'chrome', el: rootEl };
};

const keyForTarget = target => {
  if (!target) return null;
  if (target.kind === 'item') return itemKey(target.row, target.item);
  if (target.kind === 'row') return rowKey(target.row);
  return dashboardKey();
};

// Measure a node's box relative to the overlay root (so we can absolutely
// position a ring over it inside the same positioned ancestor).
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

const CanvasSelectionOverlay = ({ rootRef }) => {
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const setSelectedKey = useStore(s => s.setWorkspaceOutlineSelectedKey);

  // Hovered + selected box geometry, measured from the live DashboardNew DOM.
  const [hoverBox, setHoverBox] = useState(null); // { rect, kind }
  const [selectedBox, setSelectedBox] = useState(null); // { rect, kind }
  const hoverTargetRef = useRef(null); // last resolved hover target descriptor

  // --- Selection box: recompute from `selectedKey` against the live DOM -----
  const recomputeSelectedBox = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!selectedKey || selectedKey === 'dashboard') {
      // Chrome selection has no inner box; it's an inset border on the root.
      setSelectedBox(selectedKey === 'dashboard' ? { kind: 'chrome', rect: null } : null);
      return;
    }
    // `row.N` or `row.N.item.M`
    const parts = selectedKey.split('.');
    const ri = Number(parts[1]);
    const rowEl = root.querySelector(`[data-row-index="${ri}"]`);
    if (!rowEl) {
      setSelectedBox(null);
      return;
    }
    if (parts[2] === 'item') {
      const ii = Number(parts[3]);
      const itemEl = rowEl.querySelector(`[data-canvas-item-index="${ii}"]`);
      const rect = measure(itemEl, root);
      setSelectedBox(rect ? { kind: 'item', rect } : null);
      return;
    }
    const rect = measure(rowEl, root);
    setSelectedBox(rect ? { kind: 'row', rect } : null);
  }, [rootRef, selectedKey]);

  // Recompute selection geometry whenever the key changes or the canvas
  // re-lays-out (resize / scroll / DOM mutation as charts finish loading).
  useLayoutEffect(() => {
    recomputeSelectedBox();
  }, [recomputeSelectedBox]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const onReflow = () => {
      recomputeSelectedBox();
      // Drop the hover box on reflow — it re-arms on the next pointer move.
      setHoverBox(null);
      hoverTargetRef.current = null;
    };

    // ResizeObserver on the root catches canvas-width changes (and charts
    // finishing load, which resize their slots). We deliberately do NOT use a
    // MutationObserver here: the overlay paints its own ring <div>s inside the
    // same positioned root, so a subtree MutationObserver would observe its own
    // mutations and self-trigger a reflow loop. Selection geometry recomputes
    // on `selectedKey` change (layout effect) and on resize, which covers the
    // states D-2 owns.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onReflow) : null;
    if (ro) ro.observe(root);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [rootRef, recomputeSelectedBox]);

  // --- Pointer handlers: hover + click selection ----------------------------
  const handleMouseMove = useCallback(
    e => {
      const root = rootRef.current;
      const target = resolveTarget(e.target, root);
      if (!target || target.kind === 'chrome') {
        // No item/row hint over empty canvas — chrome is a click affordance,
        // not a hover one.
        if (hoverTargetRef.current) {
          hoverTargetRef.current = null;
          setHoverBox(null);
        }
        return;
      }
      const nextKey = keyForTarget(target);
      if (hoverTargetRef.current === nextKey) return;
      hoverTargetRef.current = nextKey;
      const rect = measure(target.el, root);
      setHoverBox(rect ? { kind: target.kind, rect } : null);
    },
    [rootRef]
  );

  const handleMouseLeave = useCallback(() => {
    hoverTargetRef.current = null;
    setHoverBox(null);
  }, []);

  const handleClick = useCallback(
    e => {
      const root = rootRef.current;
      const target = resolveTarget(e.target, root);
      if (!target) return;
      const nextKey = keyForTarget(target);
      if (!nextKey) return;
      setSelectedKey(nextKey);
      emitWorkspaceEvent('canvas_selection_changed', {
        key: nextKey,
        kind: target.kind,
      });
    },
    [rootRef, setSelectedKey]
  );

  // Bind pointer handlers to the canvas root (delegation) rather than an
  // overlapping transparent layer, so DashboardNew's own interactive content
  // (Plotly hover, table scroll, links) keeps working. The overlay <div>s we
  // paint are pointer-events-none.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.addEventListener('mousemove', handleMouseMove);
    root.addEventListener('mouseleave', handleMouseLeave);
    root.addEventListener('click', handleClick);
    return () => {
      root.removeEventListener('mousemove', handleMouseMove);
      root.removeEventListener('mouseleave', handleMouseLeave);
      root.removeEventListener('click', handleClick);
    };
  }, [rootRef, handleMouseMove, handleMouseLeave, handleClick]);

  const chromeSelected = selectedKey === 'dashboard';

  return (
    <div
      data-testid="canvas-overlay-layer"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {/* Dashboard-chrome selection: subtle inset mulberry border on the whole
          canvas (D-1 state 07). */}
      {chromeSelected && (
        <div
          data-testid="canvas-overlay-chrome-selected"
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-[#713b57]/60"
        />
      )}

      {/* Hover overlay — subtle mulberry-200 outline + resize-handle
          PLACEHOLDER (no resize gesture; that's D-3). Suppressed when this
          exact node is the persistent selection, so the selection ring reads
          cleanly. */}
      {hoverBox &&
        hoverBox.rect &&
        !(
          selectedBox &&
          selectedBox.rect &&
          selectedBox.kind === hoverBox.kind &&
          selectedBox.rect.top === hoverBox.rect.top &&
          selectedBox.rect.left === hoverBox.rect.left
        ) && (
          <div
            data-testid={`canvas-overlay-hover-${hoverBox.kind}`}
            className={[
              'pointer-events-none absolute rounded-md ring-1 ring-[#c6b0bb]',
              hoverBox.kind === 'row' ? 'bg-[#713b57]/[0.02]' : '',
            ].join(' ')}
            style={{
              top: hoverBox.rect.top,
              left: hoverBox.rect.left,
              width: hoverBox.rect.width,
              height: hoverBox.rect.height,
            }}
          >
            {/* Resize-handle PLACEHOLDER — bottom-right grip, no gesture. */}
            <span
              data-testid="canvas-overlay-resize-handle"
              className="pointer-events-none absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-sm border border-[#c6b0bb] bg-white shadow-sm"
            />
          </div>
        )}

      {/* Selection overlay — persistent mulberry-500 ring with offset
          (D-1 states 05/06). Chrome selection is handled above. */}
      {selectedBox && selectedBox.rect && (
        <div
          data-testid={`canvas-overlay-selected-${selectedBox.kind}`}
          className="pointer-events-none absolute rounded-md ring-2 ring-[#713b57] ring-offset-1 ring-offset-[#f9fafb] bg-[#713b57]/[0.03]"
          style={{
            top: selectedBox.rect.top,
            left: selectedBox.rect.left,
            width: selectedBox.rect.width,
            height: selectedBox.rect.height,
          }}
        />
      )}
    </div>
  );
};

export default CanvasSelectionOverlay;
