import React from 'react';
import DashboardNew from '../DashboardNew';

/**
 * ProjectCanvas (VIS-D1 / VIS-767) — render-only foundation for the Workspace
 * dashboard canvas (a.k.a. the "Canvas"/preview lens).
 *
 * At rest it is intentionally indistinguishable from View mode (`/project/<name>`):
 * it simply wraps <DashboardNew> and forwards `projectId` / `dashboardName` with
 * NO editing affordances (no selection, hover, gestures or chrome). Those build-mode
 * overlays arrive in later D-track tickets — D-1 is the parity baseline.
 *
 * This is the *build* surface by construction (it is only mounted inside the
 * Workspace's dashboard-scoped canvas lens). View mode is the separate `/project`
 * route, so there is deliberately no build/view-mode flag here.
 */
const ProjectCanvas = ({ projectId, dashboardName }) => {
  return (
    <div data-testid="project-canvas" className="flex flex-1 min-h-0 w-full max-w-full">
      <DashboardNew projectId={projectId} dashboardName={dashboardName} stackBreakpoint={768} />
    </div>
  );
};

export default ProjectCanvas;
