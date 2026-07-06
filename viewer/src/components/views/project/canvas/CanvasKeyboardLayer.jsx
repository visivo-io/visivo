import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore from '../../../../stores/store';
import { useWorkspaceCommit } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import useCanvasKeyboardNav, { announceSelection } from './useCanvasKeyboardNav';

/**
 * CanvasKeyboardLayer — VIS-790 / Track D D-7.
 *
 * Canvas-direct keyboard navigation + a11y surface for the Workspace dashboard
 * canvas. A SIBLING over the render-only <Dashboard> (mounted by ProjectCanvas
 * alongside the selection / DnD / resize / add-row overlays). It:
 *
 *   - Makes the canvas focusable (a single roving `tabindex=0` application
 *     region with `role="application"` + an aria-label + aria-keyshortcuts), so
 *     a keyboard user can Tab INTO the canvas and then drive selection without a
 *     pointer.
 *   - Routes key events through `useCanvasKeyboardNav` (arrow nav, Tab cycling,
 *     ⌘↑/↓ reorder, Enter → right-rail form, Esc → deselect) — all reusing the
 *     pure breadcrumbNav helpers so canvas + breadcrumb + Outline are one model.
 *   - Hosts an `aria-live="polite"` region that announces selection + reorder
 *     changes ("Row 2, item 1 selected").
 *   - Mirrors the selection ring onto the focus region (the visual ring is the
 *     CanvasSelectionOverlay's; here we drive an offscreen focus proxy so the
 *     browser's focus stays on the canvas region while the mulberry ring tracks
 *     the selected node).
 *
 * The region is pointer-events-none EXCEPT it is keyboard-focusable, so it never
 * intercepts the pointer selection / DnD the other overlays own — it is purely
 * the keyboard entry point.
 */

const CanvasKeyboardLayer = ({ rootRef, dashboardName }) => {
  const outlineKey = useStore(s => s.workspaceOutlineSelectedKey);
  const setWorkspaceSelection = useStore(s => s.setWorkspaceSelection);
  // Selection routed through the unified action (VIS-994). No revealEdit:
  // arrow-key navigation moves the selection ring without yanking the rail
  // open on every keypress; an already-open Edit panel tracks the key anyway.
  const setSelectedKey = useCallback(
    key => setWorkspaceSelection(undefined, key),
    [setWorkspaceSelection]
  );
  const dashboards = useStore(s => s.dashboards);
  const commitCanvasConfig = useWorkspaceCommit();

  const [announcement, setAnnouncement] = useState('');

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  const rows = useMemo(
    () => (Array.isArray(dashboardConfig?.rows) ? dashboardConfig.rows : []),
    [dashboardConfig]
  );

  // Reorder commits go through the shared commitCanvasConfig with a telemetry
  // shadow (parity with the pointer reorders). The §3.4 canvas_action kind is
  // derived from the reorder axis (row → move_row, item → move_item) so
  // keyboard moves roll up with their pointer/DnD equivalents; `via` keeps the
  // input modality visible for analytics.
  const commitConfig = useCallback(
    (nextConfig, meta) => {
      if (!dashboardName || typeof commitCanvasConfig !== 'function') return;
      commitCanvasConfig(dashboardName, nextConfig, meta);
      const kind =
        meta?.axis === 'row'
          ? 'move_row'
          : meta?.axis === 'item'
            ? 'move_item'
            : meta?.kind || 'reorder_keyboard';
      emitWorkspaceEvent('canvas_action', { kind, via: 'keyboard', dashboardName });
    },
    [dashboardName, commitCanvasConfig]
  );

  // Focus the right-rail Edit form's first field (Enter). Mirrors
  // RightRailEditPanel.handleFocusForm so the contract is identical.
  const onFocusForm = useCallback(() => {
    if (typeof document === 'undefined') return;
    const panel = document.querySelector('[data-testid="workspace-right-rail-edit"]');
    if (!panel) return;
    const field = panel.querySelector(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
    );
    if (field && typeof field.focus === 'function') field.focus();
  }, []);

  const { handleKeyDown } = useCanvasKeyboardNav({
    outlineKey,
    dashboardName,
    rows,
    setSelectedKey,
    commitConfig,
    config: dashboardConfig,
    onAnnounce: setAnnouncement,
    onFocusForm,
  });

  // When the canvas region gains focus with nothing selected, prime the
  // selection to the dashboard root so the first arrow keypress has an anchor.
  const onFocus = useCallback(() => {
    if (!outlineKey) {
      if (setSelectedKey) setSelectedKey('dashboard');
    }
    // Announce the current position on focus so a SR user knows where they are.
    setAnnouncement(announceSelection(outlineKey || 'dashboard', dashboardName, rows));
  }, [outlineKey, setSelectedKey, dashboardName, rows]);

  // Keep the announcement fresh if the selection changes from another surface
  // (Outline / breadcrumb / pointer) WHILE the canvas region is focused.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = rootRef.current;
    if (!root) return;
    const region = root.querySelector('[data-testid="canvas-keyboard-region"]');
    if (region && document.activeElement === region) {
      setAnnouncement(announceSelection(outlineKey || 'dashboard', dashboardName, rows));
    }
  }, [outlineKey, rootRef, dashboardName, rows]);

  if (!dashboardConfig) return null;

  return (
    <>
      {/* Keyboard focus surface. role=application so arrow keys are delivered to
          our handler rather than the SR's reading cursor. It sits at the canvas
          inset but is pointer-events-none, so it's reachable by Tab + drives
          selection without ever stealing pointer interactions. */}
      <div
        data-testid="canvas-keyboard-region"
        role="application"
        aria-label="Dashboard canvas. Use arrow keys to move the selection, Command with up or down arrow to reorder, Enter to edit."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Tab Enter Escape"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className="pointer-events-none absolute inset-0 z-[5] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#713b57]/50"
      />
      {/* Polite live region for selection / reorder announcements. */}
      <div
        data-testid="canvas-keyboard-announce"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </>
  );
};

export default CanvasKeyboardLayer;
