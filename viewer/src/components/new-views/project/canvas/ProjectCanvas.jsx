import React, { useRef } from 'react';
import DashboardNew from '../DashboardNew';
import CanvasSelectionOverlay from './CanvasSelectionOverlay';

/**
 * ProjectCanvas (VIS-D1 / VIS-767, extended by VIS-D2 / VIS-768) — the
 * Workspace dashboard canvas (a.k.a. the "Canvas"/preview lens).
 *
 * The canvas IS the dashboard: it wraps the render-only <DashboardNew> so at
 * rest it stays pixel-identical to View mode (`/project/<name>`). VIS-D2 adds
 * an editing-affordance OVERLAY layer ON TOP of that render — never mutating
 * it. The overlay (<CanvasSelectionOverlay>):
 *
 *   - Writes the workspace selection (`workspaceOutlineSelectedKey`) on click,
 *     using the SAME key scheme as the OutlineTreePanel so the canvas + tree
 *     are one selection source of truth.
 *   - Paints hover outlines (+ a resize-handle PLACEHOLDER, no gesture yet —
 *     D-3) and a persistent mulberry selection ring per the D-1 design states.
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
  // root, so the rings land exactly over DashboardNew's rows/items.
  const rootRef = useRef(null);

  return (
    <div
      ref={rootRef}
      data-testid="project-canvas"
      className="relative flex flex-1 min-h-0 w-full max-w-full"
    >
      <DashboardNew projectId={projectId} dashboardName={dashboardName} stackBreakpoint={768} />
      <CanvasSelectionOverlay rootRef={rootRef} />
    </div>
  );
};

export default ProjectCanvas;
