/**
 * Workspace shell mount tests (VIS-775 / Track B B2).
 *
 * Verifies the smart Workspace container renders the shell at both
 * /workspace (unscoped) and /workspace/dashboard/:dashboardName (scoped),
 * hydrates the project tab, opens a dashboard tab when scoped, fires the
 * workspace_mode_entered telemetry event on mount, and dispatches the
 * middle pane based on the active object type.
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
jest.mock('../common/DimensionEditForm', () => stubLeafForm('dimension-edit-form-stub'));
jest.mock('../common/MetricEditForm', () => stubLeafForm('metric-edit-form-stub'));
jest.mock('../common/RelationEditForm', () => stubLeafForm('relation-edit-form-stub'));
// The level/defaults Edit forms (VIS-807 / VIS-809) self-fetch (sources/defaults)
// on mount; stub them so the shell-mount fetch assertions stay route-level.
jest.mock('../common/LevelEditForm', () => stubLeafForm('level-edit-form-stub'));
jest.mock('../common/DefaultsEditForm', () => stubLeafForm('defaults-edit-form-stub'));

const resetWorkspaceStore = () => {
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      // Reset the active object so tests are isolated: a non-project active
      // object makes MiddlePane mount that type's preview (Track N), whose
      // on-mount data fetch would otherwise leak into the next test's
      // "fetches every collection once" assertion.
      workspaceActiveObject: null,
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

  test('mounts the shell at /workspace (unscoped) with the project tab as default', () => {
    renderAt('/workspace');
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    // The Workspace no longer renders its own dark top bar — commit / deploy
    // and the project name live in Home's shared <TopNav>.
    expect(screen.queryByTestId('workspace-top-bar')).not.toBeInTheDocument();
    // Project tab is hydrated on mount.
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toHaveAttribute('data-active', 'true');
    // Middle pane mounts the Project Editor surface (M-1, VIS-805).
    expect(screen.getByTestId('workspace-middle-project')).toBeInTheDocument();
    expect(screen.getByTestId('project-editor')).toBeInTheDocument();
  });

  test('mounts the shell at /workspace/dashboard/<name> and focuses the dashboard tab', () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    // Both tabs exist — project (hydrated) + dashboard (URL-scoped).
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workspace-tab-dashboard:simple-dashboard')
    ).toBeInTheDocument();
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
    // Library is mounted in the left rail (VIS-769 / Track C C1+) — the
    // C-1 two-section design: Layout Items + Data Layer.
    expect(screen.getByTestId('library-section-layout')).toBeInTheDocument();
    expect(screen.getByTestId('library-section-data')).toBeInTheDocument();
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
    ].forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
    // The semantic-layer collections (relations/metrics/dimensions) are also
    // self-fetched by the ProjectEditor governance surface (VIS-1013) when they
    // mount empty, so the route may drive them more than once — assert at-least-
    // once rather than exactly-once.
    expect(fetchers.fetchRelations.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchers.fetchMetrics.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchers.fetchDimensions.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('project tab does not auto-reopen after the user closes it (regression: re-opens on nav)', () => {
    renderAt('/workspace');
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toBeInTheDocument();
    // User closes the project tab.
    act(() => {
      useStore.getState().closeWorkspaceTab('project:analytics-platform');
    });
    expect(
      screen.queryByTestId('workspace-tab-project:analytics-platform')
    ).not.toBeInTheDocument();
    // The hydration ref means subsequent renders don't re-open it. (Full
    // route navigation is exercised by react-router under the hood; we just
    // assert the closed state survives a re-rendered cycle by re-running
    // the active actions.)
    act(() => {
      useStore.setState({ workspaceLens: 'lineage' }); // any unrelated dep flip
    });
    expect(
      screen.queryByTestId('workspace-tab-project:analytics-platform')
    ).not.toBeInTheDocument();
  });

  test('?edit=<type>:<name> deep link opens a real tab for the subject and focuses it', () => {
    // The flip card's "Expand / Open full lineage" gesture routes here. Without
    // opening a tab the Workspace would land on the unscoped Project Editor
    // (only the project tab visible); the deep link must open + focus a tab.
    renderAt('/workspace?edit=chart:revenue_chart&lens=lineage');
    // Project tab is still hydrated, AND a chart tab opened from the deep link.
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toBeInTheDocument();
    const chartTab = screen.getByTestId('workspace-tab-chart:revenue_chart');
    expect(chartTab).toBeInTheDocument();
    // The deep-linked tab becomes active.
    expect(chartTab).toHaveAttribute('data-active', 'true');
    // The middle pane dispatches to the chart's PerObjectPane on the lineage lens.
    expect(screen.getByTestId('workspace-middle-chart')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
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

    // User switches to the project tab (tab switches don't navigate).
    act(() => {
      useStore.getState().switchWorkspaceTab('project:analytics-platform');
    });
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toHaveAttribute('data-active', 'true');

    // A backend recompile refetches the project (fresh object identity). The
    // hydration effect re-runs, but must NOT re-assert the URL dashboard tab.
    act(() => {
      useStore.setState({
        project: { id: 'p1', project_json: { name: 'analytics-platform' } },
      });
    });
    expect(
      screen.getByTestId('workspace-tab-project:analytics-platform')
    ).toHaveAttribute('data-active', 'true');

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
