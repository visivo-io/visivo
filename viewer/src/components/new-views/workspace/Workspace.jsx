import React, { useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import WorkspaceShell from './WorkspaceShell';
import { emitWorkspaceEvent } from './telemetry';
import { useWorkspaceScope } from './useWorkspaceScope';

/**
 * Workspace — smart container for the `/workspace` and
 * `/workspace/dashboard/:dashboardName` routes (VIS-775 / Track B B2).
 *
 * Responsibilities:
 *   1. Hydrate the project tab on mount (project is a first-class tab —
 *      per the delivered B-1 design, opening `/workspace` should always
 *      show a project tab).
 *   2. When the URL is dashboard-scoped (`/workspace/dashboard/<name>`),
 *      open a dashboard tab for that name and focus it.
 *   3. Subscribe to workspace store state and pass it into
 *      `<WorkspaceShell>`.
 *   4. Fire the `workspace_mode_entered` telemetry event on mount (with the
 *      scoped dashboard name, or `null` for unscoped).
 *
 * Most of the visual work lives in `<WorkspaceShell>` (presentational) and
 * its sub-components. Splitting smart/dumb keeps the shell trivially
 * snapshot-testable.
 */
const Workspace = () => {
  const { dashboardName } = useParams();

  // Project data ---------------------------------------------------------
  const project = useStore((s) => s.project);
  const hasUnpublishedChanges = useStore((s) => s.hasUnpublishedChanges);
  const checkPublishStatus = useStore((s) => s.checkPublishStatus);
  const openPublishModal = useStore((s) => s.openPublishModal);

  // Workspace store ------------------------------------------------------
  const tabs = useStore((s) => s.workspaceTabs);
  const activeTabId = useStore((s) => s.workspaceActiveTabId);
  const leftCollapsed = useStore((s) => s.workspaceLeftCollapsed);
  const rightCollapsed = useStore((s) => s.workspaceRightCollapsed);
  const rightTab = useStore((s) => s.workspaceRightTab);
  const lens = useStore((s) => s.workspaceLens);
  const leftWidth = useStore((s) => s.workspaceLeftWidth);
  const rightWidth = useStore((s) => s.workspaceRightWidth);
  const resizing = useStore((s) => s.workspaceResizing);

  const openWorkspaceTab = useStore((s) => s.openWorkspaceTab);
  const switchWorkspaceTab = useStore((s) => s.switchWorkspaceTab);
  const closeWorkspaceTab = useStore((s) => s.closeWorkspaceTab);
  const toggleLeftCollapsed = useStore(
    (s) => s.toggleWorkspaceLeftCollapsed
  );
  const toggleRightCollapsed = useStore(
    (s) => s.toggleWorkspaceRightCollapsed
  );
  const setRightTab = useStore((s) => s.setWorkspaceRightTab);
  const setLens = useStore((s) => s.setWorkspaceLens);

  const scope = useWorkspaceScope();

  // Project display name — fall back to a friendly stub when the project
  // loader hasn't completed (tests don't always hydrate it).
  const projectName = useMemo(() => {
    return (
      project?.project_json?.name ||
      project?.name ||
      'project'
    );
  }, [project]);

  // Hydrate tabs from URL on mount + when route changes ------------------
  useEffect(() => {
    // Always make sure the project tab exists.
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
    // We re-run when projectName / dashboardName change so navigation
    // between scoped/unscoped surfaces keeps tabs in sync. openWorkspaceTab
    // is a stable Zustand action reference.
  }, [projectName, dashboardName, openWorkspaceTab]);

  // Check publish status so the Publish · N button has accurate count.
  useEffect(() => {
    if (typeof checkPublishStatus === 'function') {
      checkPublishStatus();
    }
  }, [checkPublishStatus]);

  // Telemetry ------------------------------------------------------------
  useEffect(() => {
    emitWorkspaceEvent('workspace_mode_entered', {
      dashboardName: dashboardName || null,
      scope: scope.scope,
    });
    // Only fire on mount / scope change — not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardName]);

  // Derive active object from active tab. If the tab is gone but the URL
  // is scoped, fall back to a synthesised dashboard descriptor (avoids a
  // flash of "project" content right before the tab hydrates).
  const activeObject = useMemo(() => {
    const tab = (tabs || []).find((t) => t.id === activeTabId);
    if (tab) return { type: tab.type, name: tab.name };
    if (dashboardName) return { type: 'dashboard', name: dashboardName };
    return { type: 'project', name: projectName };
  }, [tabs, activeTabId, dashboardName, projectName]);

  // Wire actions -------------------------------------------------------
  const handleSelectTab = useCallback(
    (id) => switchWorkspaceTab(id),
    [switchWorkspaceTab]
  );
  const handleCloseTab = useCallback(
    (id) => closeWorkspaceTab(id),
    [closeWorkspaceTab]
  );
  const handleNewTab = useCallback(() => {
    // Defer real "open in new tab" semantics to VIS-O2; the button is a
    // visual affordance for now. Focus the project tab as a sane default.
    openWorkspaceTab({
      id: `project:${projectName}`,
      type: 'project',
      name: projectName,
    });
  }, [openWorkspaceTab, projectName]);

  const dirty = hasUnpublishedChanges ? 1 : 0;

  // The shell is full-viewport. Home wraps every route in a `pt-12`
  // container to reserve space for its fixed `<TopNav>`. The Workspace
  // shell renders its own TopBar (per the delivered B-1 design), so we
  // anchor the shell to `top-0 bottom-0` to occupy the full viewport
  // height and visually replace the outer nav. Subsequent work will lift
  // the conditional out of Home itself; for Phase 0 this overlay is the
  // cleanest path that doesn't touch the existing route container.
  return (
    <div
      className="fixed inset-0 z-40 bg-white"
      data-testid="workspace-route-root"
    >
      <WorkspaceShell
        projectName={projectName}
        canBuild={true}
        dirty={dirty}
        onPublishClick={openPublishModal}
        onDeployClick={() => {
          // Phase 0 stub — full deploy modal lives in Home.jsx today. Track O
          // / Track G will wire the deploy CTA from the Workspace TopBar.
        }}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        activeObject={activeObject}
        lens={lens}
        onLensChange={setLens}
        projectId={project?.id || null}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeftCollapsed={toggleLeftCollapsed}
        onToggleRightCollapsed={toggleRightCollapsed}
        rightTab={rightTab}
        onSelectRightTab={setRightTab}
        leftWidth={leftWidth}
        rightWidth={rightWidth}
        resizing={resizing}
      />
    </div>
  );
};

export default Workspace;
