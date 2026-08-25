import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore from '../../../../stores/store';
import { useWorkspaceCommit } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { buildTemplateRow, insertRowAtIndex } from './canvasReorder';
import RowTemplateMenu from './RowTemplateMenu';

/**
 * CanvasAddRow — VIS-794 / Track D D-7 + D-8.
 *
 * The "+ Add Row" affordance layer for the Workspace dashboard canvas. A SIBLING
 * over the render-only <Dashboard> (mounted by ProjectCanvas alongside the
 * selection + DnD overlays), it provides three surfaces from the D-7/D-8 briefs:
 *
 *   - A dashed "+ Add row" button at the END of the canvas (always present when
 *     the dashboard has ≥1 row), measured to sit just BELOW the last row rather
 *     than pinned to the canvas floor, where it overlapped the last cell.
 *   - A between-rows "+ Add row" pill revealed on hover in each top-level row
 *     gap (measured from the live `data-canvas-path` row boxes, the same scheme
 *     CanvasDndLayer reads).
 *   - The EMPTY-canvas CTA (D-8): a prominent mulberry "Add row" button +
 *     helper copy, shown when the dashboard has zero rows.
 *
 * Each trigger opens <RowTemplateMenu>; selecting a template builds a row of
 * empty slots (canvasReorder.buildTemplateRow) and inserts it at the trigger's
 * target index (insertRowAtIndex), committing through the shell's shared
 * `commitCanvasConfig` — the SAME path the DnD router uses.
 *
 * VIS-1231: the empty state used to advertise dragging from the Library and
 * offer "+ New chart / table / markdown" shortcuts into the Explorer. Neither
 * worked from an empty dashboard — there is no row to drop into — so the copy
 * promised something the canvas could not do. A row is the one thing that has
 * to exist first, so the empty state now says exactly that, and a dashboard
 * created from "+ New" starts with a row (see `inlineCreateStore`).
 *
 * Mulberry (`primary`) is the active/CTA colour (NOT a type colour).
 */

const MULBERRY = 'var(--color-primary-500)';
// Clearance between the last row and the end-of-canvas "Add row" button.
const END_BUTTON_GAP = 12;
const PlusIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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

const CanvasAddRow = ({ rootRef, dashboardName }) => {
  const dashboards = useStore(s => s.dashboards);
  const commitCanvasConfig = useWorkspaceCommit();

  // openMenu: which trigger's menu is open. null | { kind: 'end' } |
  // { kind: 'between', index } | { kind: 'empty' }.
  const [openMenu, setOpenMenu] = useState(null);
  const [hoverGap, setHoverGap] = useState(null);
  const [gapBoxes, setGapBoxes] = useState([]);
  // Where the end-of-canvas button sits: measured from the last row so it
  // never overlaps it. Null until the first measure (or with no rows).
  const [endBox, setEndBox] = useState(null);

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  const rows = useMemo(
    () => (Array.isArray(dashboardConfig?.rows) ? dashboardConfig.rows : []),
    [dashboardConfig]
  );
  const isEmpty = rows.length === 0;

  // Measure the between-rows gap boxes (one before each top-level row) so the
  // hover-reveal "+ Add row" pills land in the inter-row gaps.
  const rebuild = useCallback(() => {
    const root = rootRef.current;
    if (!root || !rows.length) {
      setGapBoxes([]);
      setEndBox(null);
      return;
    }
    const at = path => {
      const el = root.querySelector(`[data-canvas-path="${path}"]`);
      return el ? measure(el, root) : null;
    };
    const boxes = [];
    rows.forEach((row, ri) => {
      if (ri === 0) return; // No gap before the first row (end button covers append).
      const prevBox = at(`row.${ri - 1}`);
      const rowBox = at(`row.${ri}`);
      if (!prevBox || !rowBox) return;
      const gapCenter = (prevBox.top + prevBox.height + rowBox.top) / 2;
      boxes.push({ index: ri, top: gapCenter, left: rowBox.left, width: rowBox.width });
    });
    setGapBoxes(boxes);

    // Park the end button just BELOW the last row rather than pinned to the
    // canvas floor. Pinned to the floor it sat on top of whatever row happened
    // to reach the bottom — the dashed button straddling the last cell.
    const lastBox = at(`row.${rows.length - 1}`);
    setEndBox(
      lastBox
        ? { top: lastBox.top + lastBox.height + END_BUTTON_GAP, left: lastBox.left, width: lastBox.width }
        : null
    );
  }, [rootRef, rows]);

  useEffect(() => {
    rebuild();
  }, [rebuild]);

  // Close the open template menu when a pointer press lands OUTSIDE it (and
  // outside any Add-row trigger, so the trigger's own toggle still works). A
  // chart card can otherwise sit in front of the menu's gap on hover; dismissing
  // on outside-press guarantees the menu never gets stranded behind content
  // (the user's report). Capture phase so it fires before the canvas handlers.
  useEffect(() => {
    if (!openMenu) return undefined;
    const onPointerDown = e => {
      const t = e.target;
      if (
        t &&
        t.closest &&
        (t.closest('[data-testid="row-template-menu"]') ||
          t.closest('button[data-testid*="add-row"]'))
      ) {
        return;
      }
      setOpenMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [openMenu]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
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

  // Resolve the insertion index for the currently-open menu: append (rows.length)
  // for the end / empty triggers, the gap index for a between-rows trigger.
  const targetIndex = useMemo(() => {
    if (!openMenu) return rows.length;
    if (openMenu.kind === 'between') return openMenu.index;
    return rows.length;
  }, [openMenu, rows.length]);

  const handleSelectTemplate = useCallback(
    templateKey => {
      const row = buildTemplateRow(templateKey);
      if (!row || !dashboardName || typeof commitCanvasConfig !== 'function') {
        setOpenMenu(null);
        return;
      }
      const next = insertRowAtIndex(dashboardConfig, targetIndex, row);
      commitCanvasConfig(dashboardName, next, { kind: 'add_row' });
      emitWorkspaceEvent('canvas_action', {
        kind: 'add_row',
        template: templateKey,
        index: targetIndex,
        slots: row.items.length,
      });
      // Let the 220ms mulberry flash play before dismissing the menu.
      setTimeout(() => setOpenMenu(null), 220);
    },
    [dashboardConfig, dashboardName, commitCanvasConfig, targetIndex]
  );

  if (!dashboardConfig) return null;

  // ── Empty-canvas state (D-8) ───────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div
        data-testid="canvas-add-row-empty"
        className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center ${
          openMenu ? 'z-[100]' : 'z-10'
        }`}
      >
        <div className="pointer-events-auto relative flex flex-col items-center">
          <button
            type="button"
            data-testid="canvas-add-row-empty-button"
            onClick={() => setOpenMenu(o => (o?.kind === 'empty' ? null : { kind: 'empty' }))}
            className="inline-flex h-12 items-center gap-2 rounded-lg px-6 text-[14px] font-semibold text-white shadow-md transition-colors"
            style={{ backgroundColor: MULBERRY }}
          >
            <PlusIcon className="h-4 w-4" />
            Add row
          </button>
          {/* VIS-1231: this used to read "Drag a chart from the Library to
              begin", but an empty dashboard has no row to drop INTO — the drag
              silently did nothing. Rows come first; say so. */}
          <p className="mt-3 max-w-[360px] text-center text-[12.5px] leading-relaxed text-gray-500">
            Dashboards are built from rows. Add one to start, then drag charts,
            tables, and markdown from the Library into it.
          </p>
          {openMenu?.kind === 'empty' && (
            <RowTemplateMenu
              anchor="top"
              onSelect={handleSelectTemplate}
              onDismiss={() => setOpenMenu(null)}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Populated canvas: between-rows pills + end-of-canvas button ─────────────
  return (
    <div
      data-testid="canvas-add-row"
      // While a template menu is open the whole layer jumps to a very high z so
      // the menu always sits ABOVE the dashboard cards (a hovered chart could
      // otherwise raise its own stacking context over the menu — the user's
      // report). At rest it stays at z-30.
      className={`pointer-events-none absolute inset-0 ${openMenu ? 'z-[100]' : 'z-30'}`}
    >
      {/* Between-rows hover-reveal pills. */}
      {gapBoxes.map(gap => {
        const isOpen = openMenu?.kind === 'between' && openMenu.index === gap.index;
        const isHover = hoverGap === gap.index || isOpen;
        return (
          <div
            key={`gap-${gap.index}`}
            data-testid={`canvas-add-row-gap-${gap.index}`}
            className="pointer-events-auto absolute flex items-center justify-center"
            style={{ top: gap.top - 14, left: gap.left, width: gap.width, height: 28 }}
            onMouseEnter={() => setHoverGap(gap.index)}
            onMouseLeave={() => setHoverGap(h => (h === gap.index ? null : h))}
          >
            {isHover && (
              <div className="relative flex items-center justify-center">
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 h-px"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 40%, transparent)', width: gap.width }}
                />
                <button
                  type="button"
                  data-testid={`canvas-add-row-gap-button-${gap.index}`}
                  onClick={() =>
                    setOpenMenu(o =>
                      o?.kind === 'between' && o.index === gap.index
                        ? null
                        : { kind: 'between', index: gap.index }
                    )
                  }
                  className="relative z-10 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-medium shadow-sm ring-1"
                  style={{ color: MULBERRY, borderColor: 'var(--color-primary-200)' }}
                >
                  <PlusIcon className="h-3 w-3" />
                  Add row
                </button>
                {isOpen && (
                  <RowTemplateMenu
                    anchor="bottom"
                    onSelect={handleSelectTemplate}
                    onDismiss={() => setOpenMenu(null)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* End-of-canvas "+ Add row" dashed button, parked below the last row.
          It used to be pinned to the canvas floor (`bottom-2`), so on a
          dashboard whose rows reached the bottom it rendered ON TOP of the last
          cell. Falls back to the floor only until the first measurement. */}
      <div
        data-testid="canvas-add-row-end"
        className="pointer-events-auto absolute flex items-center justify-center"
        style={
          endBox
            ? { top: endBox.top, left: endBox.left, width: endBox.width }
            : { left: 0, right: 0, bottom: 8 }
        }
      >
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            data-testid="canvas-add-row-end-button"
            onClick={() => setOpenMenu(o => (o?.kind === 'end' ? null : { kind: 'end' }))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed bg-white px-4 text-[13px] font-medium transition-colors hover:bg-primary-50"
            style={{ borderColor: MULBERRY, color: 'var(--color-primary-600)' }}
          >
            <PlusIcon className="h-4 w-4" />
            Add row
          </button>
          {openMenu?.kind === 'end' && (
            <RowTemplateMenu
              anchor="bottom"
              onSelect={handleSelectTemplate}
              onDismiss={() => setOpenMenu(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CanvasAddRow;
