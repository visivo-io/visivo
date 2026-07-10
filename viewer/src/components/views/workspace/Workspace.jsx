import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import WorkspaceShell from './WorkspaceShell';
import { emitWorkspaceEvent, markBuildModeEntered } from './telemetry';
import { useWorkspaceScope } from './useWorkspaceScope';
import useProjectChangeListener from './useProjectChangeListener';
import { workspaceTabFromUrl } from './workspaceUrl';

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
  const location = useLocation();
  const navigate = useNavigate();
  const project = useStore(s => s.project);
  // `activateWorkspaceTab` is the URL→store write (sets active in the store); UI
  // goes through `openWorkspaceTab`, which routes the selection through the URL.
  const activateWorkspaceTab = useStore(s => s.activateWorkspaceTab);
  const registerWorkspaceUrlNavigate = useStore(s => s.registerWorkspaceUrlNavigate);
  const workspaceActiveTabId = useStore(s => s.workspaceActiveTabId);
  const workspaceTabs = useStore(s => s.workspaceTabs);
  const restoreWorkspaceTabs = useStore(s => s.restoreWorkspaceTabs);
  const setWorkspaceLens = useStore(s => s.setWorkspaceLens);
  const checkCommitStatus = useStore(s => s.checkCommitStatus);
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

  // Register the router's `navigate` so the store's tab actions can route the
  // active selection through the URL (the single clean loop). Unregister on
  // unmount so a stale navigate can't fire once the Workspace is gone.
  useEffect(() => {
    registerWorkspaceUrlNavigate(navigate);
    return () => registerWorkspaceUrlNavigate(null);
  }, [navigate, registerWorkspaceUrlNavigate]);

  // #6: persist the OPEN-TAB SET across refresh (the active tab is restored from
  // the URL). Keyed per project so projects don't share strips.
  const tabsStorageKey = project ? `visivo.workspace.tabs.${projectName}` : null;
  const tabsRestored = useRef(false);
  // Restore once, BEFORE the URL→store sync below, so the URL's tab joins the
  // restored strip instead of replacing it.
  useEffect(() => {
    if (!project || tabsRestored.current || !tabsStorageKey) return;
    tabsRestored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(tabsStorageKey) || 'null');
      if (Array.isArray(saved) && saved.length) restoreWorkspaceTabs(saved);
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, [project, tabsStorageKey, restoreWorkspaceTabs]);

  const projectTabHydrated = useRef(false);
  const syncedTargetRef = useRef(null);
  const hydratedViewParamRef = useRef(null);
  // URL → store: the URL is the source of the ACTIVE tab, so this reads it into
  // the store via `activateWorkspaceTab` (never navigates). The store's
  // `openWorkspaceTab`/`switchWorkspaceTab` WRITE the URL; this closes the loop.
  // Keyed on the URL's target id (via `syncedTargetRef`), so a project refetch
  // (same URL) never re-focuses or resurrects a closed tab.
  useEffect(() => {
    if (!project) return;
    // The project tab is the always-present home; create it once (with its real
    // name after `project` resolves). After that it's user-managed — closing it
    // sticks.
    if (!projectTabHydrated.current) {
      projectTabHydrated.current = true;
      activateWorkspaceTab({ id: `project:${projectName}`, type: 'project', name: projectName });
      syncedTargetRef.current = `project:${projectName}`;
    }

    const target = workspaceTabFromUrl(location.pathname, searchParams) || {
      type: 'project',
      name: projectName,
    };
    const targetId = `${target.type}:${target.name}`;
    if (targetId !== syncedTargetRef.current) {
      if (target.type === 'project') {
        // Focus the project tab — but never resurrect one the user closed.
        const projectTab = useStore.getState().workspaceTabs.find(t => t.type === 'project');
        if (projectTab) activateWorkspaceTab(projectTab);
      } else {
        activateWorkspaceTab(target);
        // `?edit=dashboard:<name>&lens=lineage` → the GLOBAL dashboard lens;
        // per-object types consume `?lens=lineage` locally in ObjectCanvasFrame,
        // so setting the global lens for them would make every dashboard opened
        // later land on lineage.
        if (target.type === 'dashboard' && searchParams.get('lens') === 'lineage') {
          setWorkspaceLens('lineage');
        }
      }
      syncedTargetRef.current = targetId;
    }

    // `/lineage` redirects to `/workspace?view=lineage` (LocalRouter): the
    // global dashboard-pane lineage lens — the same full-project DAG the old
    // /lineage page rendered.
    const viewParam = searchParams.get('view');
    if (viewParam === 'lineage' && hydratedViewParamRef.current !== viewParam) {
      setWorkspaceLens('lineage');
    }
    hydratedViewParamRef.current = viewParam || null;
  }, [
    project,
    projectName,
    location.pathname,
    searchParams,
    activateWorkspaceTab,
    setWorkspaceLens,
  ]);

  // #6: persist the open-tab set on every change — but only AFTER the initial
  // restore, so we never clobber the saved strip with the empty starting one.
  useEffect(() => {
    if (!tabsStorageKey || !tabsRestored.current) return;
    try {
      localStorage.setItem(
        tabsStorageKey,
        JSON.stringify(workspaceTabs.map(t => ({ id: t.id, type: t.type, name: t.name })))
      );
    } catch {
      /* ignore unavailable storage */
    }
  }, [workspaceTabs, tabsStorageKey]);

  // Push the selected tab into the document title so the browser tab is
  // informative (VIS thread: "the open tab in the browser will be more
  // informative"). Project tab → just the project; every other tab →
  // "<tab> · <project>".
  useEffect(() => {
    const base = projectName || 'Visivo';
    const activeTab = workspaceTabs.find(t => t.id === workspaceActiveTabId);
    if (!activeTab || activeTab.type === 'project') {
      document.title = base;
      return;
    }
    const label = activeTab.type === 'semantic-layer' ? 'Semantic Layer' : activeTab.name;
    document.title = `${label} · ${base}`;
  }, [workspaceActiveTabId, workspaceTabs, projectName]);

  // Check publish status so the Publish · N button has accurate count.
  useEffect(() => {
    if (typeof checkCommitStatus === 'function') {
      checkCommitStatus();
    }
  }, [checkCommitStatus]);

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

  // The Workspace renders UNDER Home's shared sticky `<TopNav>` (the same nav
  // every other route uses) rather than as a full-screen overlay — commit /
  // deploy and the tool switcher all live in that nav. We fill exactly the
  // viewport below it (56px desktop nav height) so the rails + canvas own
  // their internal scroll and the page itself never scrolls.
  return (
    <div
      className="flex flex-col bg-white"
      style={{ height: 'calc(100vh - 56px)' }}
      data-testid="workspace-route-root"
    >
      <WorkspaceShell />
    </div>
  );
};

export default Workspace;
