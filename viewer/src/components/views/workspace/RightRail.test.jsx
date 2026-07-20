/**
 * RightRail tests (VIS-793 / Track F F-3).
 *
 * Covers the Outline-tab mount point (the OutlineTreePanel replaces the old
 * "coming soon" placeholder) and the `right_rail_tab_switched` telemetry
 * event that fires on a right-rail tab change.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import RightRail from './RightRail';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from './telemetry';

// SourceOutlineTreePanel (mounted for source scope) hits the source-metadata +
// schema-jobs APIs on mount — stub them so the branch test stays isolated.
jest.mock('../../../api/explorer', () => ({
  fetchSourceMetadata: jest.fn(() => Promise.resolve({ sources: [] })),
}));
jest.mock('../../../api/sourceSchemaJobs', () => ({
  // No cached schema by default → the source outline lands on the cold-source
  // "Generate schema" affordance (the cached-schema feed drives warm vs cold).
  fetchSourceSchemaJobs: jest.fn(() =>
    Promise.resolve([{ source_name: 'analytics_db', has_cached_schema: false }])
  ),
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
  fetchSourceTables: jest.fn(() => Promise.resolve([])),
  fetchTableColumns: jest.fn(() => Promise.resolve([])),
}));
// VIS-996: dimension/metric/relation render through SchemaLeafForm, whose
// FormShell async-loads the project schema. This test asserts the rail's TAB
// SET per object type, not form internals — stub it so the async schema load
// can't fire a post-assert setState (act warning).
jest.mock('./SchemaLeafForm', () => ({
  __esModule: true,
  default: ({ type }) => <div data-testid={`${type}-edit-form-stub`} />,
}));
// 6c-T2 / D6: RightRail's exploration branch mounts ExplorationBuildRail
// directly (no Edit/Outline tab at all). Stub it — its own internals
// (InsightBuildSection/ChartBuildSection/PillMenu/TracePropsEditor) are a
// different track's territory and have their own test coverage
// (ExplorationBuildRail.test.jsx); this file only asserts RightRail's OWN
// job — which tab set an exploration gets, and that the id is threaded.
jest.mock('./ExplorationBuildRail', () => ({
  __esModule: true,
  default: ({ explorationId }) => (
    <div data-testid="exploration-build-rail-stub" data-exploration-id={explorationId || ''}>
      ExplorationBuildRail
    </div>
  ),
}));

const resetStore = (overrides = {}) => {
  act(() => {
    useStore.setState({
      workspaceRightCollapsed: false,
      workspaceRightTab: 'edit',
      workspaceActiveObject: { type: 'dashboard', name: 'simple-dashboard' },
      workspaceOutlineSelectedKey: 'dashboard',
      dashboards: [],
      saveDashboard: jest.fn(),
      ...overrides,
    });
  });
};

const renderRail = (entry = '/workspace/dashboard/simple-dashboard') => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <Route
        path="/workspace/dashboard/:dashboardName"
        element={<RightRail />}
      />
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('RightRail (VIS-793)', () => {
  test('Outline tab mounts the OutlineTreePanel (no placeholder)', () => {
    resetStore({ workspaceRightTab: 'outline' });
    renderRail();
    expect(screen.getByTestId('workspace-right-rail-outline')).toBeInTheDocument();
    // Old placeholder copy is gone.
    expect(
      screen.queryByText(/Outline tree coming soon/i)
    ).not.toBeInTheDocument();
  });

  test('fires right_rail_tab_switched on tab change with the new tab name', () => {
    resetStore({ workspaceRightTab: 'edit' });
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener((evt) => events.push(evt));
    try {
      renderRail();
      fireEvent.click(screen.getByTestId('workspace-right-rail-tab-outline'));
      const switched = events.filter(
        (e) => e.eventName === 'right_rail_tab_switched'
      );
      expect(switched).toHaveLength(1);
      expect(switched[0].payload.tab).toBe('outline');
      expect(useStore.getState().workspaceRightTab).toBe('outline');
    } finally {
      unsubscribe();
    }
  });

  test('does not fire telemetry when re-selecting the active tab', () => {
    resetStore({ workspaceRightTab: 'edit' });
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener((evt) => events.push(evt));
    try {
      renderRail();
      fireEvent.click(screen.getByTestId('workspace-right-rail-tab-edit'));
      expect(
        events.filter((e) => e.eventName === 'right_rail_tab_switched')
      ).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  test('a collapsed-strip tab click expands the rail AND applies the tab selection (dead-affordance regression)', () => {
    resetStore({
      workspaceRightCollapsed: true,
      workspaceRightTab: 'edit',
      workspaceTabs: [],
      workspaceActiveTabId: null,
    });
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-right-rail-collapsed-outline'));
    // The rail expands…
    expect(useStore.getState().workspaceRightCollapsed).toBe(false);
    // …with the clicked tab selected (not just expanded on the old tab).
    expect(useStore.getState().workspaceRightTab).toBe('outline');
    expect(screen.getByTestId('workspace-right-rail-tab-outline')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('workspace-right-rail-outline')).toBeInTheDocument();
  });

  test('a collapsed-strip click on the ALREADY-active tab still expands the rail', () => {
    resetStore({
      workspaceRightCollapsed: true,
      workspaceRightTab: 'edit',
      workspaceTabs: [],
      workspaceActiveTabId: null,
    });
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-right-rail-collapsed-edit'));
    expect(useStore.getState().workspaceRightCollapsed).toBe(false);
    expect(useStore.getState().workspaceRightTab).toBe('edit');
    expect(screen.getByTestId('workspace-right-rail-edit')).toBeInTheDocument();
  });
});

describe('RightRail Outline body branch (VIS-1004)', () => {
  // Drive the active object via a workspace tab so `useWorkspaceScope` yields
  // the desired `selectedItem.type`. A `source` tab takes precedence over the
  // dashboard URL param (see useWorkspaceScope), so the source outline mounts.
  const resetForScope = ({ tabType, tabName, dashboards = [] }) => {
    act(() => {
      useStore.setState({
        workspaceRightCollapsed: false,
        workspaceRightTab: 'outline',
        workspaceTabs: [{ id: 't1', type: tabType, name: tabName }],
        workspaceActiveTabId: 't1',
        workspaceActiveObject: { type: tabType, name: tabName },
        workspaceOutlineSelectedKey: 'dashboard',
        workspaceSourceOutlineSelectedKey: null,
        workspaceSourceOutlineExpanded: {},
        dashboards,
        saveDashboard: jest.fn(),
      });
    });
  };

  const renderAt = (entry) => {
    const router = createMemoryRouter(
      createRoutesFromElements(
        <Route path="/workspace/dashboard/:dashboardName" element={<RightRail />} />
      ),
      { initialEntries: [entry], future: futureFlags }
    );
    return render(<RouterProvider router={router} future={futureFlags} />);
  };

  test('source scope mounts the source outline (not the dashboard outline)', async () => {
    resetForScope({ tabType: 'source', tabName: 'analytics_db' });
    renderAt('/workspace/dashboard/simple-dashboard');

    expect(screen.getByTestId('workspace-source-outline')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-right-rail-outline')).not.toBeInTheDocument();
    // The Outline tab is relabelled "Data" for a source.
    expect(screen.getByTestId('workspace-right-rail-tab-outline')).toHaveTextContent('Data');
    // Let the cached-schema check settle so its state update is wrapped in act
    // (the mock reports no cached schema → the cold-source affordance).
    expect(await screen.findByTestId('source-outline-cold')).toBeInTheDocument();
  });

  test('dashboard scope mounts the dashboard outline (not the source outline)', () => {
    resetForScope({ tabType: 'dashboard', tabName: 'simple-dashboard' });
    renderAt('/workspace/dashboard/simple-dashboard');

    expect(screen.getByTestId('workspace-right-rail-outline')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-source-outline')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-right-rail-tab-outline')).toHaveTextContent('Outline');
  });
});

describe('RightRail tab set per object type (Outline only for dashboards, Data for sources)', () => {
  const resetForType = ({ tabType, tabName, rightTab = 'edit' }) => {
    act(() => {
      useStore.setState({
        workspaceRightCollapsed: false,
        workspaceRightTab: rightTab,
        workspaceTabs: [{ id: 't1', type: tabType, name: tabName }],
        workspaceActiveTabId: 't1',
        workspaceActiveObject: { type: tabType, name: tabName },
        workspaceOutlineSelectedKey: 'dashboard',
        workspaceSourceOutlineSelectedKey: null,
        workspaceSourceOutlineExpanded: {},
        dashboards: [],
        saveDashboard: jest.fn(),
      });
    });
  };

  const renderAt = entry => {
    const router = createMemoryRouter(
      createRoutesFromElements(
        <Route path="/workspace/dashboard/:dashboardName" element={<RightRail />} />
      ),
      { initialEntries: [entry], future: futureFlags }
    );
    return render(<RouterProvider router={router} future={futureFlags} />);
  };

  test('dashboard offers exactly an Outline tab + an Edit tab', () => {
    resetForType({ tabType: 'dashboard', tabName: 'simple-dashboard' });
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('workspace-right-rail-tab-outline')).toHaveTextContent('Outline');
    expect(screen.getByTestId('workspace-right-rail-tab-edit')).toBeInTheDocument();
  });

  test('source offers a Data tab (the schema tree) + an Edit tab', () => {
    resetForType({ tabType: 'source', tabName: 'analytics_db' });
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('workspace-right-rail-tab-outline')).toHaveTextContent('Data');
    expect(screen.getByTestId('workspace-right-rail-tab-edit')).toBeInTheDocument();
  });

  // The edit forms for `insight` / `chart` fire async fetches on mount (act
  // noise unrelated to the tab set), so this matrix uses the synchronous edit
  // types — the tab-set rule is type-agnostic for every non-dashboard/source.
  test.each(['model', 'table', 'metric', 'dimension', 'relation', 'input'])(
    'a %s offers ONLY an Edit tab (no Outline/Data tab)',
    type => {
      resetForType({ tabType: type, tabName: `my_${type}` });
      renderAt('/workspace/dashboard/simple-dashboard');
      expect(screen.getByTestId('workspace-right-rail-tab-edit')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-right-rail-tab-outline')).not.toBeInTheDocument();
    }
  );

  test('a stale `outline` active tab on an Edit-only object falls back to the Edit panel', () => {
    // Active object is a metric (Edit-only) but the store still holds a stale
    // `outline` tab from a previous dashboard selection. The rail must not render
    // a blank/Outline body — it falls back to the Edit panel.
    resetForType({ tabType: 'metric', tabName: 'revenue', rightTab: 'outline' });
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('workspace-right-rail-tab-edit')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.queryByTestId('workspace-right-rail-tab-outline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-right-rail-outline')).not.toBeInTheDocument();
  });
});

describe('RightRail exploration scope mounts ExplorationBuildRail — the D6 two-rails fix (6c-T2)', () => {
  const resetForExploration = ({ id = 'exp_a1b2', rightTab = 'edit' } = {}) => {
    act(() => {
      useStore.setState({
        workspaceRightCollapsed: false,
        workspaceRightTab: rightTab,
        workspaceTabs: [{ id: `exploration:${id}`, type: 'exploration', name: id }],
        workspaceActiveTabId: `exploration:${id}`,
        workspaceActiveObject: { type: 'exploration', name: id },
        workspaceOutlineSelectedKey: 'dashboard',
        dashboards: [],
        saveDashboard: jest.fn(),
      });
    });
  };

  const renderAt = entry => {
    const router = createMemoryRouter(
      createRoutesFromElements(
        <Route path="/workspace/exploration/:id" element={<RightRail />} />
      ),
      { initialEntries: [entry], future: futureFlags }
    );
    return render(<RouterProvider router={router} future={futureFlags} />);
  };

  test('exploration scope offers ONLY a Build tab — no Edit, no Outline', () => {
    resetForExploration();
    renderAt('/workspace/exploration/exp_a1b2');
    expect(screen.getByTestId('workspace-right-rail-tab-build')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-right-rail-tab-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-right-rail-tab-outline')).not.toBeInTheDocument();
  });

  test('mounts ExplorationBuildRail (not the "coming soon" placeholder), threading the exploration id', () => {
    resetForExploration({ id: 'exp_thread_me' });
    renderAt('/workspace/exploration/exp_thread_me');
    const rail = screen.getByTestId('exploration-build-rail-stub');
    expect(rail).toBeInTheDocument();
    expect(rail).toHaveAttribute('data-exploration-id', 'exp_thread_me');
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-rail-edit-unsupported')).not.toBeInTheDocument();
  });

  test('a stale `edit` tab left over from a previous object still resolves to Build (no dead-blank rail)', () => {
    // Regression for the hardcoded 'edit' fallback: an exploration's ONLY
    // tab is 'build', so a stale `workspaceRightTab: 'edit'` (the default,
    // or left over from viewing e.g. a chart) must fall back to the
    // object's OWN first tab, not a tab it doesn't offer.
    resetForExploration({ rightTab: 'edit' });
    renderAt('/workspace/exploration/exp_a1b2');
    expect(screen.getByTestId('workspace-right-rail-tab-build')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('exploration-build-rail-stub')).toBeInTheDocument();
  });

  test('only ONE right rail ever renders for an exploration — a single workspace-right-rail node', () => {
    resetForExploration();
    renderAt('/workspace/exploration/exp_a1b2');
    expect(screen.getAllByTestId('workspace-right-rail')).toHaveLength(1);
  });
});

describe('RightRail offers NO Edit tab for an active DESTINATION (B2 fix, Explore 2.0 Phase 0)', () => {
  // A destination (Project/Semantic Layer/Explorer) owns the center via
  // `workspaceActiveView` with NO active document tab — `selectedItem` is
  // null, so `getTabs(null)` must return no tabs at all (not even Edit),
  // rather than the pre-Phase-0 "No editor for this object yet / coming soon"
  // dead-end that a same-shaped bug (semantic-layer falling to the Edit
  // fallback) used to produce.
  const resetForDestination = (activeView) => {
    act(() => {
      useStore.setState({
        workspaceRightCollapsed: false,
        workspaceRightTab: 'edit',
        workspaceTabs: [],
        workspaceActiveTabId: null,
        workspaceActiveObject: null,
        workspaceActiveView: activeView,
        workspaceOutlineSelectedKey: 'dashboard',
        dashboards: [],
        saveDashboard: jest.fn(),
      });
    });
  };

  const renderAtRoot = () => {
    const router = createMemoryRouter(
      createRoutesFromElements(<Route path="/workspace" element={<RightRail />} />),
      { initialEntries: ['/workspace'], future: futureFlags }
    );
    return render(<RouterProvider router={router} future={futureFlags} />);
  };

  test.each(['project', 'semantic-layer', 'explorer'])(
    'renders NO tabs at all while the %s destination owns the center',
    (view) => {
      resetForDestination(view);
      renderAtRoot();
      expect(screen.queryByTestId('workspace-right-rail-tab-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workspace-right-rail-tab-outline')).not.toBeInTheDocument();
      // No "coming soon" dead-end — the empty state names the real gesture.
      expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('right-rail-edit-empty')).toBeInTheDocument();
    }
  );
});
