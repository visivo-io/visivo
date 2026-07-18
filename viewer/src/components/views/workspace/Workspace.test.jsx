/**
 * Workspace shell mount tests (VIS-775 / Track B B2; reworked in Explore 2.0
 * Phase 0 for the destination/view model).
 *
 * Verifies the smart Workspace container renders the shell at both
 * /workspace (unscoped, the Project destination's Home) and
 * /workspace/dashboard/:dashboardName (scoped), opens a dashboard tab when
 * scoped, fires the workspace_mode_entered telemetry event on mount, and
 * dispatches the middle pane based on the active object type / active view.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import Workspace from './Workspace';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from './telemetry';

// Dashboard has heavy dependencies (insights data, plotly, etc.) — stub
// it out so the Workspace shell render stays focused on shell behaviour.
// The route container mounts the H-2 project-change socket listener — stub
// the socket client so jsdom never attempts a real polling connection.
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock('../../project/Dashboard', () => ({
  __esModule: true,
  default: ({ projectId, dashboardName }) => (
    <div data-testid="dashboard-new-stub">
      Dashboard {projectId}:{dashboardName}
    </div>
  ),
}));

// The right rail's Edit tab now renders the real leaf/data-layer edit forms
// inline (VIS-802 GAP-2). Those pull in preview machinery + their own collection
// fetches, which is out of scope for the shell mount tests — stub them so e.g. a
// `chart` active object doesn't mount the full ChartEditForm here.
const stubLeafForm = label => ({ __esModule: true, default: () => <div data-testid={label} /> });
jest.mock('../common/ChartEditForm', () => stubLeafForm('chart-edit-form-stub'));
jest.mock('../common/TableEditForm', () => stubLeafForm('table-edit-form-stub'));
jest.mock('../common/SourceEditForm', () => stubLeafForm('source-edit-form-stub'));
jest.mock('../common/InsightEditForm', () => stubLeafForm('insight-edit-form-stub'));
jest.mock('../common/ModelEditForm', () => stubLeafForm('model-edit-form-stub'));
// VIS-996: dimension/metric/relation render through the shared SchemaLeafForm.
jest.mock('./SchemaLeafForm', () => ({
  __esModule: true,
  default: ({ type }) => <div data-testid={`${type}-edit-form-stub`} />,
}));
// The level/defaults Edit forms (VIS-807 / VIS-809) self-fetch (sources/defaults)
// on mount; stub them so the shell-mount fetch assertions stay route-level.
jest.mock('../common/LevelEditForm', () => stubLeafForm('level-edit-form-stub'));
jest.mock('../common/DefaultsEditForm', () => stubLeafForm('defaults-edit-form-stub'));
// The Semantic Layer / relation canvas bodies (VIS-1006/1014) are React-Flow
// ERDs with their own data-fetch story — stub them so the destination/view
// tests (Explore 2.0 Phase 0) stay focused on shell routing, not ERD internals.
jest.mock('./relations/SemanticLayerCanvas', () => ({
  __esModule: true,
  default: () => <div data-testid="semantic-layer-canvas-stub" />,
}));
jest.mock('./relations/RelationErdCanvas', () => ({
  __esModule: true,
  default: () => <div data-testid="relation-erd-canvas-stub" />,
}));

const resetWorkspaceStore = () => {
  // The open-tab set persists to localStorage (#6); clear it so tabs never bleed
  // across tests via a restore on mount.
  localStorage.clear();
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      workspaceUrlNavigate: null,
      // Reset the active object so tests are isolated: a non-project active
      // object makes MiddlePane mount that type's preview (Track N), whose
      // on-mount data fetch would otherwise leak into the next test's
      // "fetches every collection once" assertion.
      workspaceActiveObject: null,
      // Views left the tab model (Phase 0) — reset the active destination too
      // so a test that switched views doesn't leak into the next one.
      workspaceActiveView: 'project',
      workspaceLeftCollapsed: false,
      workspaceRightCollapsed: false,
      workspaceRightTab: 'edit',
      workspaceLens: 'preview',
      hasUncommittedChanges: false,
      // Publish-cluster state (H-1) — reset so tests are isolated.
      pendingCount: 0,
      saveActivityCount: 0,
      lastSaveFailed: false,
      commitLoading: false,
      commitError: null,
      commitModalOpen: false,
      lastCommittedAt: null,
      // Stub project that the loader normally hydrates.
      project: {
        id: 'p1',
        project_json: { name: 'analytics-platform' },
      },
      // Stub a no-op checkCommitStatus / openCommitModal so the
      // Workspace mount effect doesn't throw.
      checkCommitStatus: jest.fn(),
      openCommitModal: jest.fn(),
      // Stub the 12 collection fetches that the route container fires on
      // mount — keeps the test focused on shell behaviour, not data load.
      fetchCharts: jest.fn(),
      fetchTables: jest.fn(),
      fetchMarkdowns: jest.fn(),
      fetchInputs: jest.fn(),
      fetchSources: jest.fn(),
      fetchModels: jest.fn(),
      fetchCsvScriptModels: jest.fn(),
      fetchLocalMergeModels: jest.fn(),
      fetchDimensions: jest.fn(),
      fetchMetrics: jest.fn(),
      fetchRelations: jest.fn(),
      fetchInsights: jest.fn(),
      fetchDashboards: jest.fn(),
      fetchExplorations: jest.fn(),
      // Right-rail Edit routing (VIS-802) reads the scoped dashboard's draft
      // config from `dashboards` and auto-saves via `saveDashboard`.
      dashboards: [
        { name: 'simple-dashboard', config: { name: 'simple-dashboard', rows: [] } },
      ],
      saveDashboard: jest.fn(() => Promise.resolve({ success: true })),
      // Collections the Edit panel may read for Library-row leaf forms.
      charts: [],
      tables: [],
      markdowns: [],
      inputs: [],
    });
  });
};

const renderAt = (entry) => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/workspace" element={<Workspace />} />
        <Route
          path="/workspace/dashboard/:dashboardName"
          element={<Workspace />}
        />
        {/* The two other destinations' reserved path segments (Explore 2.0
            Phase 0, workspaceUrl.js) — the view switcher navigates here. */}
        <Route path="/workspace/semantic-layer" element={<Workspace />} />
        <Route path="/workspace/exploration" element={<Workspace />} />
      </>
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('VIS-775 Workspace shell', () => {
  beforeEach(() => {
    resetWorkspaceStore();
  });

  test('mounts the shell at /workspace (unscoped) on the Project destination by default', () => {
    renderAt('/workspace');
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    // The Workspace no longer renders its own dark top bar — commit / deploy
    // and the project name live in Home's shared <TopNav>.
    expect(screen.queryByTestId('workspace-top-bar')).not.toBeInTheDocument();
    // No document tab is hydrated — Project left the tab model (Phase 0).
    expect(useStore.getState().workspaceTabs).toHaveLength(0);
    expect(useStore.getState().workspaceActiveTabId).toBeNull();
    // The view switcher shows Project active.
    expect(screen.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'true'
    );
    // Middle pane mounts the Project Editor surface (M-1, VIS-805) via the
    // Project destination's HomePane.
    expect(screen.getByTestId('workspace-middle-project')).toBeInTheDocument();
    expect(screen.getByTestId('project-editor')).toBeInTheDocument();
  });

  test('mounts the shell at /workspace/dashboard/<name> and focuses the dashboard tab', () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    // The dashboard tab opens from the URL — no project tab (views left the
    // tab model, Phase 0).
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toBeInTheDocument();
    expect(useStore.getState().workspaceTabs).toHaveLength(1);
    // Dashboard tab is the active one (URL drives focus).
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toHaveAttribute('data-active', 'true');
    // Middle pane dispatches to the dashboard variant.
    expect(screen.getByTestId('workspace-middle-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-dashboard-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-new-stub')).toHaveTextContent(
      'Dashboard p1:simple-dashboard'
    );
  });

  test('renders all three rails and the drag handles', () => {
    renderAt('/workspace');
    expect(screen.getByTestId('workspace-left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-right-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-drag-handle-left')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-drag-handle-right')).toBeInTheDocument();
    // Library is mounted in the left rail (VIS-769 / Track C C1+) — the flat
    // single-list design: one shared search + the compact filter dropdown.
    expect(screen.getByTestId('library-search')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-toggle')).toBeInTheDocument();
    // Right rail defaults to Edit tab.
    expect(screen.getByTestId('workspace-right-rail-edit')).toBeInTheDocument();
  });

  test('right rail Edit tab routes to a selection-driven form with a chip (VIS-802)', () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    // The Edit tab now mounts the real selection-driven editor (VIS-802 / G-1)
    // rather than the old "coming soon" placeholder. Scoped to a dashboard with
    // the default Outline key ('dashboard'), it shows the dashboard-chrome form
    // fronted by a selection chip carrying the dashboard name.
    expect(screen.getByTestId('workspace-right-rail-edit')).toBeInTheDocument();
    const chip = screen.getByTestId('right-rail-selection-chip');
    expect(chip).toHaveTextContent('simple-dashboard');
    expect(chip).toHaveAttribute('data-object-type', 'dashboard');
  });

  test('does not render its own commit cluster — commit lives in the shared TopNav', () => {
    renderAt('/workspace');
    // The dark-bar CommitCluster (save pill + Discard + Commit·N) is gone; the
    // shared TopNav (mounted by Home, not by the Workspace route) owns commit.
    expect(screen.queryByTestId('workspace-top-bar-commit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-save-pill-clean')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-top-bar-discard')).not.toBeInTheDocument();
  });

  test('fires workspace_mode_entered telemetry on mount with dashboard scope', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener((evt) =>
      events.push(evt)
    );
    try {
      renderAt('/workspace/dashboard/simple-dashboard');
      const entered = events.filter(
        (e) => e.eventName === 'workspace_mode_entered'
      );
      expect(entered).toHaveLength(1);
      expect(entered[0].payload.dashboardName).toBe('simple-dashboard');
      expect(entered[0].payload.scope).toBe('dashboard');
    } finally {
      unsubscribe();
    }
  });

  test('collapsed left-rail highlights the type matching the active object', async () => {
    // Regression: collapsed strip needs an active-section indicator so the
    // user can identify their context at a glance. Render first so the
    // Workspace mount-effect runs (it sets activeObject to project), then
    // override the state to simulate a chart being active + the rail
    // collapsed, and assert the chart TypeBtn carries the mulberry pill.
    renderAt('/workspace');
    act(() => {
      useStore.setState({
        workspaceLeftCollapsed: true,
        workspaceActiveObject: { type: 'chart', name: 'revenue_chart' },
      });
    });
    // waitFor polls (flushing the chart canvas body's lazy Suspense resolution
    // inside act, VIS-1001) while asserting the collapsed-strip highlight.
    await waitFor(() =>
      expect(screen.getByTestId('workspace-left-rail-collapsed-chart')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
    expect(
      screen.getByTestId('workspace-left-rail-collapsed-source')
    ).toHaveAttribute('data-active', 'false');
  });

  test('fetches every collection on mount (was Library; now route-level)', () => {
    const fetchers = {
      fetchCharts: jest.fn(),
      fetchTables: jest.fn(),
      fetchMarkdowns: jest.fn(),
      fetchInputs: jest.fn(),
      fetchSources: jest.fn(),
      fetchModels: jest.fn(),
      fetchCsvScriptModels: jest.fn(),
      fetchLocalMergeModels: jest.fn(),
      fetchDimensions: jest.fn(),
      fetchMetrics: jest.fn(),
      fetchRelations: jest.fn(),
      fetchInsights: jest.fn(),
      fetchExplorations: jest.fn(),
    };
    act(() => { useStore.setState(fetchers); });
    renderAt('/workspace');
    // Route-driven collections fire exactly once.
    [
      fetchers.fetchCharts,
      fetchers.fetchTables,
      fetchers.fetchMarkdowns,
      fetchers.fetchInputs,
      fetchers.fetchSources,
      fetchers.fetchModels,
      fetchers.fetchCsvScriptModels,
      fetchers.fetchLocalMergeModels,
      fetchers.fetchInsights,
      fetchers.fetchExplorations,
    ].forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    // The semantic-layer collections (relations/metrics/dimensions) are also
    // self-fetched by the ProjectEditor governance surface (VIS-1013) when they
    // mount empty, so the route may drive them more than once — assert at-least-
    // once rather than exactly-once.
    expect(fetchers.fetchRelations.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchers.fetchMetrics.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchers.fetchDimensions.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('closing the only open document tab returns to ITS owning destination, not always Project (01-ux-spec.md §1 / §4 "Park")', async () => {
    // Deep-link a relation — its owning destination is Semantic Layer, not
    // Project (higherLevelViews.js `viewForDocumentType`).
    renderAt('/workspace?edit=relation:orders_to_customers');
    expect(useStore.getState().workspaceActiveView).toBe('semantic-layer');
    // Let the relation canvas's lazy chunk (mocked, but still React.lazy)
    // resolve inside act() before proceeding.
    expect(await screen.findByTestId('relation-erd-canvas-stub')).toBeInTheDocument();

    await act(async () => {
      useStore.getState().closeWorkspaceTab('relation:orders_to_customers');
    });
    // No tabs remain, but the view stays where the closed tab left it — the
    // Semantic Layer Home renders, not the Project Home.
    expect(useStore.getState().workspaceTabs).toHaveLength(0);
    expect(useStore.getState().workspaceActiveTabId).toBeNull();
    expect(useStore.getState().workspaceActiveView).toBe('semantic-layer');
    expect(await screen.findByTestId('workspace-middle-semantic-layer')).toBeInTheDocument();

    // An unrelated store update doesn't resurrect anything or change the view.
    act(() => {
      useStore.setState({ workspaceLens: 'lineage' });
    });
    expect(useStore.getState().workspaceActiveView).toBe('semantic-layer');
  });

  test('?edit=<type>:<name> deep link opens a real tab for the subject and focuses it', () => {
    // The flip card's "Expand / Open full lineage" gesture routes here. Without
    // opening a tab the Workspace would land on the unscoped Project Editor
    // Home; the deep link must open + focus a tab.
    renderAt('/workspace?edit=chart:revenue_chart&lens=lineage');
    const chartTab = screen.getByTestId('workspace-tab-chart:revenue_chart');
    expect(chartTab).toBeInTheDocument();
    // The deep-linked tab becomes active.
    expect(chartTab).toHaveAttribute('data-active', 'true');
    // The middle pane dispatches to the chart's PerObjectPane on the lineage lens.
    expect(screen.getByTestId('workspace-middle-chart')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    // Deep-link rule (01-ux-spec.md §1): chart's owning destination is Project.
    expect(useStore.getState().workspaceActiveView).toBe('project');
  });

  test('?edit=<type>:<name> deep link sets the active view to the OWNING DESTINATION, not always Project', () => {
    // relation/metric/dimension are owned by Semantic Layer (viewForDocumentType).
    renderAt('/workspace?edit=relation:orders_to_customers');
    expect(useStore.getState().workspaceActiveView).toBe('semantic-layer');
    expect(
      screen.getByTestId('workspace-tab-relation:orders_to_customers')
    ).toHaveAttribute('data-active', 'true');
  });

  test('?edit=dashboard:<name>&lens=lineage sets the GLOBAL dashboard lens to lineage', () => {
    renderAt('/workspace?edit=dashboard:simple-dashboard&lens=lineage');
    expect(useStore.getState().workspaceLens).toBe('lineage');
  });

  test('?edit=<per-object type>&lens=lineage does NOT set the global dashboard lens', () => {
    // ObjectCanvasFrame consumes the deep link locally for per-object types
    // (asserted above via workspace-middle-chart-lineage); leaking it into the
    // GLOBAL workspaceLens made every dashboard opened later land on lineage.
    renderAt('/workspace?edit=chart:revenue_chart&lens=lineage');
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    expect(useStore.getState().workspaceLens).toBe('preview');
  });

  test('/workspace?view=lineage (the /lineage redirect target) shows the global lineage lens', () => {
    // LocalRouter redirects the legacy /lineage route to /workspace?view=lineage;
    // the Workspace must consume `view` or the deep link is a silent no-op.
    renderAt('/workspace?view=lineage');
    expect(useStore.getState().workspaceLens).toBe('lineage');
  });

  test('a project refetch does not re-focus or resurrect the route dashboard tab (route-hydration is value-keyed)', () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toHaveAttribute('data-active', 'true');

    // User activates the Project view (tab switches / view switches don't
    // navigate the URL sync effect into re-asserting the route dashboard).
    act(() => {
      useStore.getState().openWorkspaceView('project');
    });
    expect(useStore.getState().workspaceActiveTabId).toBeNull();
    expect(useStore.getState().workspaceActiveView).toBe('project');

    // A backend recompile refetches the project (fresh object identity). The
    // URL-sync effect re-runs, but must NOT re-assert the URL dashboard tab
    // (the pathname/search haven't changed, so the synced-target guard holds).
    act(() => {
      useStore.setState({
        project: { id: 'p1', project_json: { name: 'analytics-platform' } },
      });
    });
    expect(useStore.getState().workspaceActiveTabId).toBeNull();
    expect(useStore.getState().workspaceActiveView).toBe('project');

    // Closing the dashboard tab must also stick across a refetch.
    act(() => {
      useStore.getState().closeWorkspaceTab('dashboard:simple-dashboard');
    });
    expect(
      screen.queryByTestId('workspace-tab-dashboard:simple-dashboard')
    ).not.toBeInTheDocument();
    act(() => {
      useStore.setState({
        project: { id: 'p1', project_json: { name: 'analytics-platform' } },
      });
    });
    expect(
      screen.queryByTestId('workspace-tab-dashboard:simple-dashboard')
    ).not.toBeInTheDocument();
  });

  test('routes the active tab through the URL so the Back button walks tab history', async () => {
    const router = createMemoryRouter(
      createRoutesFromElements(
        <>
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/workspace/dashboard/:dashboardName" element={<Workspace />} />
        </>
      ),
      { initialEntries: ['/workspace'], future: futureFlags }
    );
    render(<RouterProvider router={router} future={futureFlags} />);
    const editParam = () => new URLSearchParams(router.state.location.search).get('edit');

    // openWorkspaceTab WRITES the URL; the URL→store sync sets it active.
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'revenue_chart' });
    });
    await waitFor(() => expect(editParam()).toBe('chart:revenue_chart'));
    await waitFor(() =>
      expect(useStore.getState().workspaceActiveTabId).toBe('chart:revenue_chart')
    );

    // Activating the Project view (openWorkspaceView WRITES the URL too)
    // clears the edit param and parks the chart tab.
    act(() => {
      useStore.getState().openWorkspaceView('project');
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(useStore.getState().workspaceActiveTabId).toBeNull());
    expect(editParam()).toBeNull();

    // The browser Back button returns to the chart tab.
    act(() => {
      router.navigate(-1);
    });
    await waitFor(() =>
      expect(useStore.getState().workspaceActiveTabId).toBe('chart:revenue_chart')
    );
  });

  test('persists the open tab set and restores it on reload', async () => {
    // First "page load": open an object tab (routes through the URL → store).
    const { unmount } = renderAt('/workspace');
    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'revenue_chart' });
    });
    expect(await screen.findByTestId('workspace-tab-chart:revenue_chart')).toBeInTheDocument();
    unmount();

    // Simulate a refresh: the store's tabs reset, localStorage survives.
    act(() => {
      useStore.setState({
        workspaceTabs: [],
        workspaceActiveTabId: null,
        workspaceUrlNavigate: null,
      });
    });
    renderAt('/workspace');

    // The chart tab is restored from storage.
    expect(await screen.findByTestId('workspace-tab-chart:revenue_chart')).toBeInTheDocument();
  });

  test('persists the active VIEW alongside the tab set and restores it on a bare-root reload', async () => {
    // Switch to the Semantic Layer view (navigates to /workspace/semantic-layer,
    // parking any tabs) — first "page load".
    const { unmount } = renderAt('/workspace');
    act(() => {
      useStore.getState().openWorkspaceView('semantic-layer');
    });
    await waitFor(() =>
      expect(screen.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
    unmount();

    // Simulate a refresh AT THE BARE ROOT (not /workspace/semantic-layer) —
    // this is the ambiguous case workspaceUrl.js's `workspaceTargetFromUrl`
    // can't itself resolve (bare `/workspace` is both "explicit project" and
    // "no specific target"); the persisted view must win on this first sync.
    act(() => {
      useStore.setState({
        workspaceTabs: [],
        workspaceActiveTabId: null,
        workspaceActiveView: 'project',
        workspaceUrlNavigate: null,
      });
    });
    renderAt('/workspace');

    await waitFor(() => expect(useStore.getState().workspaceActiveView).toBe('semantic-layer'));
    expect(screen.getByTestId('workspace-middle-semantic-layer')).toBeInTheDocument();
  });

  test('reflects the active tab in the document title', async () => {
    renderAt('/workspace');
    await waitFor(() => expect(document.title).toBe('analytics-platform'));

    act(() => {
      useStore.getState().openWorkspaceTab({ type: 'chart', name: 'revenue_chart' });
    });
    await waitFor(() =>
      expect(document.title).toBe('revenue_chart · analytics-platform')
    );

    // Back on the Project view (no active document tab), the title is just
    // the project.
    act(() => {
      useStore.getState().openWorkspaceView('project');
    });
    await waitFor(() => expect(document.title).toBe('analytics-platform'));
  });

  test('fires workspace_mode_entered telemetry with null dashboardName when unscoped', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener((evt) =>
      events.push(evt)
    );
    try {
      renderAt('/workspace');
      const entered = events.filter(
        (e) => e.eventName === 'workspace_mode_entered'
      );
      expect(entered).toHaveLength(1);
      expect(entered[0].payload.dashboardName).toBeNull();
      expect(entered[0].payload.scope).toBe('root');
    } finally {
      unsubscribe();
    }
  });
});
