import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import WorkspaceShell from './WorkspaceShell';
import { emitWorkspaceEvent } from './telemetry';
import { useWorkspaceScope } from './useWorkspaceScope';

/**
 * Workspace — route container for `/workspace` and
 * `/workspace/dashboard/:dashboardName` (VIS-775 / Track B B2).
 *
 * Owns only ROUTE-DRIVEN side effects:
 *   1. Hydrate the project tab on mount (and a dashboard tab when the URL
 *      is scoped) so opening `/workspace` always shows a project tab.
 *   2. Check publish status so the Publish · N button has an accurate count.
 *   3. Fire the `workspace_mode_entered` telemetry event on mount and on
 *      scope changes.
 *
 * Every visual surface — `<WorkspaceShell>` and its children — subscribes
 * to the workspace store directly. No props are threaded through the shell.
 */
const Workspace = () => {
  const { dashboardName } = useParams();
  const project = useStore(s => s.project);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const checkPublishStatus = useStore(s => s.checkPublishStatus);
  const scope = useWorkspaceScope();

  const projectName = project?.project_json?.name || project?.name || 'project';

  // Hydrate tabs from URL on mount + when route changes.
  useEffect(() => {
    openWorkspaceTab({
      id: `project:${projectName}`,
      type: 'project',
      name: projectName,
    });
    if (dashboardName) {
      openWorkspaceTab({
        id: `dashboard:${dashboardName}`,
        type: 'dashboard',
        name: dashboardName,
      });
    }
  }, [projectName, dashboardName, openWorkspaceTab]);

  // Check publish status so the Publish · N button has accurate count.
  useEffect(() => {
    if (typeof checkPublishStatus === 'function') {
      checkPublishStatus();
    }
  }, [checkPublishStatus]);

  // Telemetry — fire on mount and on scope changes only.
  useEffect(() => {
    emitWorkspaceEvent('workspace_mode_entered', {
      dashboardName: dashboardName || null,
      scope: scope.scope,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardName]);

  // The shell is full-viewport. Home wraps every route in a `pt-12`
  // container to reserve space for its fixed `<TopNav>`. The Workspace
  // shell renders its own TopBar (per the delivered B-1 design), so we
  // anchor the shell to `top-0 bottom-0` to occupy the full viewport
  // height and visually replace the outer nav.
  return (
    <div
      className="fixed inset-0 z-40 bg-white"
      data-testid="workspace-route-root"
    >
      <WorkspaceShell />
    </div>
  );
};

export default Workspace;
