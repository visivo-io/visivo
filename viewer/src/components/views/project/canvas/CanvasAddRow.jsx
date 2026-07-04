import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
 *     the dashboard has ≥1 row).
 *   - A between-rows "+ Add row" pill revealed on hover in each top-level row
 *     gap (measured from the live `data-canvas-path` row boxes, the same scheme
 *     CanvasDndLayer reads).
 *   - The EMPTY-canvas CTA (D-8): a prominent mulberry "Add row" button + helper
 *     copy + a one-time directional cue toward the Library, shown when the
 *     dashboard has zero rows.
 *
 * Each trigger opens <RowTemplateMenu>; selecting a template builds a row of
 * empty slots (canvasReorder.buildTemplateRow) and inserts it at the trigger's
 * target index (insertRowAtIndex), committing through the shell's shared
 * `commitCanvasConfig` (sanitize → optimistic → save) — the SAME path the DnD
 * router uses. It also exposes the inline-create entry points (+ New Chart /
 * Table / Markdown) that route to the Explorer (the full round-trip is VIS-J2;
 * here we fire `inline_create_used` + navigate).
 *
 * Mulberry (`#713b57`) is the active/CTA colour (NOT a type colour).
 */

const MULBERRY = '#713b57';
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

// Inline-create object types offered at the empty state / menus (D-7 AC). These
// route to the Explorer to author a new layout item; the round-trip back to the
// canvas is VIS-J2.
const INLINE_CREATE_TYPES = [
  { type: 'chart', label: 'New chart' },
  { type: 'table', label: 'New table' },
  { type: 'markdown', label: 'New markdown' },
];

const CanvasAddRow = ({ rootRef, dashboardName }) => {
  const dashboards = useStore(s => s.dashboards);
  const commitCanvasConfig = useWorkspaceCommit();
  const navigate = useNavigate();

  // openMenu: which trigger's menu is open. null | { kind: 'end' } |
  // { kind: 'between', index } | { kind: 'empty' }.
  const [openMenu, setOpenMenu] = useState(null);
  const [hoverGap, setHoverGap] = useState(null);
  const [gapBoxes, setGapBoxes] = useState([]);

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

  const handleInlineCreate = useCallback(
    type => {
      // §3.4 payload convention: `source` (where the create was initiated) +
      // `kind` (the object type), matching the Library / broken-ref /
      // project-editor inline-create sites.
      emitWorkspaceEvent('inline_create_used', { source: 'canvas', kind: type, dashboardName });
      setOpenMenu(null);
      // The full Explorer round-trip (author → return to canvas slot) is VIS-J2;
      // for now route to the Explorer so the create flow is reachable.
      if (navigate) navigate(`/explorer?create=${type}`);
    },
    [navigate, dashboardName]
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
          <p className="mt-3 max-w-[360px] text-center text-[12.5px] leading-relaxed text-gray-500">
            Drag a chart from the Library to begin, or pick a row template.
          </p>
          <div className="mt-2 flex items-center gap-3 text-[11.5px]">
            {INLINE_CREATE_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                data-testid={`canvas-inline-create-${type}`}
                onClick={() => handleInlineCreate(type)}
                className="font-medium text-[#713b57] hover:underline"
              >
                {label}
              </button>
            ))}
          </div>
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
                  style={{ backgroundColor: 'rgba(113,59,87,0.4)', width: gap.width }}
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
                  style={{ color: MULBERRY, borderColor: '#c6b0bb' }}
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

      {/* End-of-canvas "+ Add row" dashed button. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-2 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            data-testid="canvas-add-row-end-button"
            onClick={() => setOpenMenu(o => (o?.kind === 'end' ? null : { kind: 'end' }))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed bg-white px-4 text-[13px] font-medium transition-colors hover:bg-[#fbf7f9]"
            style={{ borderColor: MULBERRY, color: '#5a2f45' }}
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
