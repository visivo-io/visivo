import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import WorkspaceShell from './WorkspaceShell';
import { emitWorkspaceEvent, markBuildModeEntered } from './telemetry';
import { useWorkspaceScope } from './useWorkspaceScope';
import useProjectChangeListener from './useProjectChangeListener';
import { workspaceTargetFromUrl, WORKSPACE_BASE } from './workspaceUrl';
import { isWorkspaceView, DEFAULT_WORKSPACE_VIEW } from './higherLevelViews';

/**
 * Workspace — route container for `/workspace` and
 * `/workspace/dashboard/:dashboardName` (VIS-775 / Track B B2).
 *
 * Owns only ROUTE-DRIVEN side effects:
 *   1. Sync the URL to the active surface — a destination's Home (Project /
 *      Semantic Layer / Explorer, `higherLevelViews.js`) or a document tab —
 *      and restore the persisted tab set + active view on mount.
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
  const registerWorkspaceUrlBase = useStore(s => s.registerWorkspaceUrlBase);
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

  // The mount prefix for this Workspace. Studio serves it at the root
  // (`/workspace`); a host that mounts the viewer under a path prefix (the
  // cloud app, at `/:account/:stage/:project/workspace`) needs its tab URLs to
  // carry that prefix, or `navigate` escapes to the root and the route 404s.
  // Derive it from the path up to and including the `workspace` segment so the
  // same component works at either mount.
  const workspaceUrlBase = useMemo(() => {
    const segments = location.pathname.split('/');
    const workspaceIndex = segments.indexOf('workspace');
    return workspaceIndex === -1
      ? WORKSPACE_BASE
      : segments.slice(0, workspaceIndex + 1).join('/');
  }, [location.pathname]);

  // Register the router's `navigate` (and the derived mount base) so the store's
  // tab actions can route the active selection through the URL (the single clean
  // loop). Unregister on unmount so a stale navigate can't fire once the
  // Workspace is gone.
  useEffect(() => {
    registerWorkspaceUrlNavigate(navigate);
    registerWorkspaceUrlBase(workspaceUrlBase);
    return () => registerWorkspaceUrlNavigate(null);
  }, [navigate, workspaceUrlBase, registerWorkspaceUrlNavigate, registerWorkspaceUrlBase]);

  // #6: persist the OPEN-TAB SET (+ the active VIEW, Explore 2.0 Phase 0)
  // across refresh — the active TAB is still restored from the URL. Keyed
  // per project so projects don't share strips.
  const tabsStorageKey = project ? `visivo.workspace.tabs.${projectName}` : null;
  const tabsRestored = useRef(false);
  const activateWorkspaceView = useStore(s => s.activateWorkspaceView);
  const workspaceActiveView = useStore(s => s.workspaceActiveView);
  // Restore once, BEFORE the URL→store sync below, so the URL's target joins
  // the restored strip instead of replacing it.
  useEffect(() => {
    if (!project || tabsRestored.current || !tabsStorageKey) return;
    tabsRestored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(tabsStorageKey) || 'null');
      // Back-compat: a pre-Phase-0 session persisted a bare tab array; the
      // current shape wraps it alongside the active view.
      const savedTabs = Array.isArray(saved) ? saved : Array.isArray(saved?.tabs) ? saved.tabs : null;
      if (savedTabs && savedTabs.length) restoreWorkspaceTabs(savedTabs);
      const savedView = Array.isArray(saved) ? null : saved?.activeView;
      if (savedView && isWorkspaceView(savedView)) {
        activateWorkspaceView(savedView);
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, [project, tabsStorageKey, restoreWorkspaceTabs, activateWorkspaceView]);

  const syncedTargetRef = useRef(null);
  const hydratedViewParamRef = useRef(null);
  const initialUrlSyncRef = useRef(true);
  // URL → store: the URL is the source of the ACTIVE surface (a view's home OR
  // a document tab), so this reads it into the store via `activateWorkspaceTab`
  // / `activateWorkspaceView` (never navigates). The store's
  // `openWorkspaceTab`/`openWorkspaceView`/`switchWorkspaceTab` WRITE the URL;
  // this closes the loop. Keyed on the URL's target (via `syncedTargetRef`), so
  // a project refetch (same URL) never re-focuses or resurrects a closed tab.
  useEffect(() => {
    if (!project) return;
    const target = workspaceTargetFromUrl(location.pathname, searchParams, workspaceUrlBase);
    const targetKey =
      target.kind === 'tab' ? `tab:${target.tab.type}:${target.tab.name}` : `view:${target.view}`;
    if (targetKey !== syncedTargetRef.current) {
      if (target.kind === 'tab') {
        activateWorkspaceTab(target.tab);
        // `?edit=dashboard:<name>&lens=lineage` → the GLOBAL dashboard lens;
        // per-object types consume `?lens=lineage` locally in ObjectCanvasFrame,
        // so setting the global lens for them would make every dashboard opened
        // later land on lineage.
        if (target.tab.type === 'dashboard' && searchParams.get('lens') === 'lineage') {
          setWorkspaceLens('lineage');
        }
      } else {
        // The bare `/workspace` root is BOTH the project view's real home AND
        // the "no specific target" fallback — `workspaceTargetFromUrl` can't
        // tell them apart (see workspaceUrl.js). On the FIRST sync only (page
        // load / reload), prefer whatever the localStorage restore above
        // already put in the store, so a reload while parked on Semantic
        // Layer/Explorer doesn't always bounce back to Project. Any LATER
        // bare-root navigation (e.g. clicking "Project" in the switcher, which
        // navigates here) legitimately means Project and is honored.
        const isBareRootDefault =
          target.view === DEFAULT_WORKSPACE_VIEW && location.pathname === workspaceUrlBase;
        if (!(isBareRootDefault && initialUrlSyncRef.current)) {
          activateWorkspaceView(target.view);
        }
      }
      syncedTargetRef.current = targetKey;
    }
    initialUrlSyncRef.current = false;

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
    location.pathname,
    searchParams,
    workspaceUrlBase,
    activateWorkspaceTab,
    activateWorkspaceView,
    setWorkspaceLens,
  ]);

  // #6: persist the open-tab set (+ active view) on every change — but only
  // AFTER the initial restore, so we never clobber the saved strip with the
  // empty starting one.
  useEffect(() => {
    if (!tabsStorageKey || !tabsRestored.current) return;
    try {
      localStorage.setItem(
        tabsStorageKey,
        JSON.stringify({
          tabs: workspaceTabs.map(t => ({ id: t.id, type: t.type, name: t.name })),
          activeView: workspaceActiveView,
        })
      );
    } catch {
      /* ignore unavailable storage */
    }
  }, [workspaceTabs, workspaceActiveView, tabsStorageKey]);

  // Push the selected tab into the document title so the browser tab is
  // informative (VIS thread: "the open tab in the browser will be more
  // informative"). No active document tab (a destination/view owns the
  // center) → just the project; every open tab → "<tab> · <project>".
  useEffect(() => {
    const base = projectName || 'Visivo';
    const activeTab = workspaceTabs.find(t => t.id === workspaceActiveTabId);
    if (!activeTab) {
      document.title = base;
      return;
    }
    document.title = `${activeTab.name} · ${base}`;
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
