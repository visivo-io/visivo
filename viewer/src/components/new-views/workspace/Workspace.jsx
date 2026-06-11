import React, { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import WorkspaceShell from './WorkspaceShell';
import { emitWorkspaceEvent, markBuildModeEntered } from './telemetry';
import { useWorkspaceScope } from './useWorkspaceScope';
import useProjectChangeListener from './useProjectChangeListener';

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
  const [searchParams] = useSearchParams();
  const project = useStore(s => s.project);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const setWorkspaceLens = useStore(s => s.setWorkspaceLens);
  const checkPublishStatus = useStore(s => s.checkPublishStatus);
  const scope = useWorkspaceScope();

  // H-2: soft-refresh on backend `project_changed` events (and show the
  // external-edit banner when a hot reload dropped unsaved drafts).
  useProjectChangeListener();

  // Collection loaders — hoisted here from the Library so the rail is a
  // pure consumer and other workspace surfaces (canvas, outline, project
  // editor) can rely on the same fetch on the route container's mount.
  const fetchCharts = useStore(s => s.fetchCharts);
  const fetchTables = useStore(s => s.fetchTables);
  const fetchMarkdowns = useStore(s => s.fetchMarkdowns);
  const fetchInputs = useStore(s => s.fetchInputs);
  const fetchSources = useStore(s => s.fetchSources);
  const fetchModels = useStore(s => s.fetchModels);
  const fetchCsvScriptModels = useStore(s => s.fetchCsvScriptModels);
  const fetchLocalMergeModels = useStore(s => s.fetchLocalMergeModels);
  const fetchDimensions = useStore(s => s.fetchDimensions);
  const fetchMetrics = useStore(s => s.fetchMetrics);
  const fetchRelations = useStore(s => s.fetchRelations);
  const fetchInsights = useStore(s => s.fetchInsights);
  const fetchDashboards = useStore(s => s.fetchDashboards);

  const projectName = project?.project_json?.name || project?.name || 'project';

  // Fire every collection load when the workspace mounts. Per-slice fetches
  // record their own errors; the `.catch` just guards against an unhandled
  // promise rejection.
  useEffect(() => {
    Promise.all([
      fetchCharts(),
      fetchTables(),
      fetchMarkdowns(),
      fetchInputs(),
      fetchSources(),
      fetchModels(),
      fetchCsvScriptModels(),
      fetchLocalMergeModels(),
      fetchDimensions(),
      fetchMetrics(),
      fetchRelations(),
      fetchInsights(),
      fetchDashboards(),
    ]).catch(() => {});
  }, [
    fetchCharts,
    fetchTables,
    fetchMarkdowns,
    fetchInputs,
    fetchSources,
    fetchModels,
    fetchCsvScriptModels,
    fetchLocalMergeModels,
    fetchDimensions,
    fetchMetrics,
    fetchRelations,
    fetchInsights,
    fetchDashboards,
  ]);

  // Auto-hydrate the project tab once, after `project` resolves (so the tab
  // doesn't carry a stale name from the pre-load default). After that, the
  // project tab is user-managed — closing it should stick across navigation.
  const projectTabHydrated = useRef(false);
  useEffect(() => {
    if (project && !projectTabHydrated.current) {
      projectTabHydrated.current = true;
      openWorkspaceTab({
        id: `project:${projectName}`,
        type: 'project',
        name: projectName,
      });
    }
    if (dashboardName) {
      openWorkspaceTab({
        id: `dashboard:${dashboardName}`,
        type: 'dashboard',
        name: dashboardName,
      });
    }
    // Deep-link from the flip card's "Expand / Open full lineage" gesture:
    // `?edit=<type>:<name>` opens a real tab for the subject (so the tab strip
    // gains it and it becomes active), and `?lens=lineage` shows the full
    // lineage in the middle pane. Without opening the tab the Workspace would
    // land on the unscoped Project Editor (only the project tab visible).
    const editParam = searchParams.get('edit');
    if (editParam && editParam.includes(':')) {
      const [type, ...rest] = editParam.split(':');
      const name = rest.join(':');
      if (type && name) {
        openWorkspaceTab({ type, name });
        if (searchParams.get('lens') === 'lineage') {
          setWorkspaceLens('lineage');
        }
      }
    }
  }, [project, projectName, dashboardName, searchParams, openWorkspaceTab, setWorkspaceLens]);

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
    // Arm the time_to_first_publish_in_build_mode metric (H-1 / Q22).
    markBuildModeEntered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardName]);

  // The shell is full-viewport. Home wraps every route in a `pt-12`
  // container to reserve space for its fixed `<TopNav>`. The Workspace
  // shell renders its own TopBar (per the delivered B-1 design), so we
  // anchor the shell to `top-0 bottom-0` to occupy the full viewport
  // height and visually replace the outer nav. The overlay must sit ABOVE
  // TopNav's `z-50` — at the old `z-40` the outer nav covered the shell's
  // TopBar, leaving the Publish cluster visible-but-unclickable (H-1 e2e
  // caught this: every pointer action on the top bar hit TopNav instead).
  return (
    <div
      className="fixed inset-0 z-[60] bg-white"
      data-testid="workspace-route-root"
    >
      <WorkspaceShell />
    </div>
  );
};

export default Workspace;
