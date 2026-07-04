import React, { useCallback, useMemo, useRef } from 'react';
import Dashboard from '../../../project/Dashboard';
import useStore from '../../../../stores/store';
import { useWorkspaceCommit } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { setItemRef, removeItemAtPath } from './canvasReorder';
import BrokenRefCard from './BrokenRefCard';
import CanvasSelectionOverlay from './CanvasSelectionOverlay';
import CanvasDndLayer from './CanvasDndLayer';
import CanvasResizeLayer from './CanvasResizeLayer';
import CanvasAddRow from './CanvasAddRow';
import CanvasContextMenu from './CanvasContextMenu';
import CanvasKeyboardLayer from './CanvasKeyboardLayer';
import CanvasItemFlipLayer from './CanvasItemFlipLayer';

/**
 * ProjectCanvas (VIS-D1 / VIS-767, extended by VIS-D2 / VIS-768) — the
 * Workspace dashboard canvas (a.k.a. the "Canvas"/preview lens).
 *
 * The canvas IS the dashboard: it wraps the render-only <Dashboard> so at
 * rest it stays pixel-identical to View mode (`/project/<name>`). VIS-D2 adds
 * an editing-affordance OVERLAY layer ON TOP of that render — never mutating
 * it. The overlay (<CanvasSelectionOverlay>):
 *
 *   - Writes the workspace selection (`workspaceOutlineSelectedKey`) on click,
 *     using the SAME key scheme as the OutlineTreePanel so the canvas + tree
 *     are one selection source of truth.
 *   - Paints hover outlines (+ a resize-handle PLACEHOLDER) and a persistent
 *     mulberry selection ring per the D-1 design states.
 *
 * VIS-771 / D-3 adds a second sibling overlay, <CanvasDndLayer>, that mounts the
 * drag-and-drop affordances (drag handles on rows/items + drop zones in the
 * gaps). It is wired to the shell's shared <WorkspaceDndContext> (no second
 * DndContext) and persists reorders / Library inserts through the dashboard
 * save path.
 *
 * The right rail is NOT mounted here (that's G-1); D-2 only SETS selection
 * state + renders overlays. This is the *build* surface by construction (only
 * mounted inside the Workspace's dashboard-scoped canvas lens), so there is no
 * build/view-mode flag.
 *
 * `stackBreakpoint={768}` (VIS-829): the canvas loses ~600px to the rails, so
 * it stacks at a lower container width than static View mode (default 1024).
 */
const ProjectCanvas = ({ projectId, dashboardName }) => {
  // The overlay measures + delegates pointer events against this positioned
  // root, so the rings land exactly over Dashboard's rows/items.
  const rootRef = useRef(null);

  // ── Broken-ref repair (VIS-792 / Track L L-1) ──────────────────────────────
  // The Dashboard renderer mounts an interactive <BrokenRefCard> for any leaf
  // whose chart/table/markdown/input ref doesn't resolve; the card's Fix… /
  // Delete this slot actions commit through the shared commitCanvasConfig (the
  // SAME sanitize → optimistic → save path the other canvas mutations use).
  const dashboards = useStore(s => s.dashboards);
  const commitCanvasConfig = useWorkspaceCommit();
  const openCreateChartModal = useStore(s => s.openCreateChartModal);
  const openCreateTableModal = useStore(s => s.openCreateTableModal);
  const openCreateMarkdownModal = useStore(s => s.openCreateMarkdownModal);
  const openCreateInputModal = useStore(s => s.openCreateInputModal);

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  const handleCreateNew = useCallback(
    typeKey => {
      emitWorkspaceEvent('inline_create_used', { source: 'broken_ref', kind: typeKey });
      switch (typeKey) {
        case 'chart':
          if (openCreateChartModal) openCreateChartModal();
          break;
        case 'table':
          if (openCreateTableModal) openCreateTableModal();
          break;
        case 'markdown':
          if (openCreateMarkdownModal) openCreateMarkdownModal();
          break;
        case 'input':
          if (openCreateInputModal) openCreateInputModal();
          break;
        default:
          break;
      }
    },
    [openCreateChartModal, openCreateTableModal, openCreateMarkdownModal, openCreateInputModal]
  );

  const renderBrokenRef = useCallback(
    ({ type, name, itemPath }) => (
      <BrokenRefCard
        type={type}
        name={name}
        onFix={(fixType, fixName) => {
          if (!dashboardConfig || typeof commitCanvasConfig !== 'function') return;
          const next = setItemRef(dashboardConfig, itemPath, fixType, fixName);
          if (next === dashboardConfig) return;
          commitCanvasConfig(dashboardName, next, { kind: 'broken_ref_fix' });
          emitWorkspaceEvent('canvas_action', {
            kind: 'broken_ref_fix',
            dashboardName,
            path: itemPath,
            type: fixType,
            name: fixName,
          });
        }}
        onDelete={() => {
          if (!dashboardConfig || typeof commitCanvasConfig !== 'function') return;
          const next = removeItemAtPath(dashboardConfig, itemPath);
          if (next === dashboardConfig) return;
          commitCanvasConfig(dashboardName, next, { kind: 'broken_ref_delete' });
          emitWorkspaceEvent('canvas_action', {
            kind: 'broken_ref_delete',
            dashboardName,
            path: itemPath,
          });
        }}
        onCreateNew={handleCreateNew}
      />
    ),
    [dashboardConfig, commitCanvasConfig, dashboardName, handleCreateNew]
  );

  return (
    <div
      ref={rootRef}
      data-testid="project-canvas"
      className="relative flex flex-1 min-h-0 w-full max-w-full"
    >
      <Dashboard
        projectId={projectId}
        dashboardName={dashboardName}
        stackBreakpoint={768}
        hideEmptyPlaceholder
        canvasMode
        renderBrokenRef={renderBrokenRef}
      />
      <CanvasSelectionOverlay rootRef={rootRef} />
      {/* VIS-771 / D-3: drag-and-drop affordance layer (drag handles + drop
          zones). A SIBLING over the render, wired to the shell's shared
          <WorkspaceDndContext> — no second DndContext. */}
      <CanvasDndLayer rootRef={rootRef} dashboardName={dashboardName} />
      {/* VIS-777 / D-4: resize-gesture layer (item width / row height /
          container corner). Paints edge handles on the selected node and
          persists width/height through the shared commitCanvasConfig. */}
      <CanvasResizeLayer rootRef={rootRef} dashboardName={dashboardName} />
      {/* VIS-794 / D-7 + D-8: "+ Add Row" template menu (end-of-canvas +
          between-rows) and the empty-canvas CTA. Commits a templated row via the
          shell's shared commitCanvasConfig (sanitize → optimistic → save). */}
      <CanvasAddRow rootRef={rootRef} dashboardName={dashboardName} />
      {/* VIS-781 / D-5: right-click context menu — wrap-in-container, add row
          inside / add item to row, unwrap. Commits via the shared
          commitCanvasConfig (sanitize → optimistic → save). */}
      <CanvasContextMenu rootRef={rootRef} dashboardName={dashboardName} />
      {/* VIS-790 / D-7: canvas-direct keyboard navigation + a11y. A focusable
          application region + ARIA live announcements; routes arrow / Tab /
          ⌘↑↓ / Enter / Esc through the shared breadcrumbNav model. */}
      <CanvasKeyboardLayer rootRef={rootRef} dashboardName={dashboardName} />
      {/* VIS-785 / D-6: per-item flip-to-lineage. A flip toggle on the
          hovered/selected leaf opens its lineage neighbourhood card (the
          delivered C-2 surface), with a live selector + Expand-to-lens.
          Multi-flip; disabled during drag; honors prefers-reduced-motion. */}
      <CanvasItemFlipLayer rootRef={rootRef} dashboardName={dashboardName} />
    </div>
  );
};

export default ProjectCanvas;
