/**
 * useWorkspaceScope() shape contract (VIS-775 / Track B B2).
 *
 * The hook is the single source of truth for what the Workspace is focused
 * on — every downstream consumer (Library, MiddlePane, right rail,
 * telemetry) reads from it. These tests pin the expected shapes for each
 * entry point so the hook can't silently regress.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';

const Probe = () => {
  const scope = useWorkspaceScope();
  return (
    <div>
      <span data-testid="probe-scope">{scope.scope}</span>
      <span data-testid="probe-selector">{scope.selector}</span>
      <span data-testid="probe-dashboard">
        {scope.dashboardName === null ? 'null' : scope.dashboardName}
      </span>
      <span data-testid="probe-selected-type">
        {scope.selectedItem ? scope.selectedItem.type : 'null'}
      </span>
      <span data-testid="probe-selected-name">
        {scope.selectedItem ? scope.selectedItem.name : 'null'}
      </span>
    </div>
  );
};

const resetWorkspaceStore = () => {
  act(() => {
    useStore.setState({
      workspaceTabs: [],
      workspaceActiveTabId: null,
      workspaceActiveView: 'project',
    });
  });
};

const renderAt = (entry) => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/workspace" element={<Probe />} />
        <Route path="/workspace/dashboard/:dashboardName" element={<Probe />} />
      </>
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('useWorkspaceScope', () => {
  beforeEach(() => {
    resetWorkspaceStore();
  });

  test('returns root scope at /workspace with no tabs', () => {
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('root');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent('*');
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent('null');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('null');
  });

  test('returns the Semantic Layer view scope when that view is active and no tab is open (B3 fix)', () => {
    // Project/Semantic Layer/Explorer left the tab model (Phase 0) — a
    // destination is active via `workspaceActiveView`, never a tab record.
    // Before B3 this fell through to a nonsensical `item` scope with a
    // `+semantic-layer` lineage selector; now it resolves through the view
    // registry (`higherLevelViews.js`).
    act(() => {
      useStore.setState({ workspaceActiveView: 'semantic-layer' });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('semantic-layer');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent('*');
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent('null');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('null');
  });

  test('returns the Explorer view scope when that view is active and no tab is open', () => {
    act(() => {
      useStore.setState({ workspaceActiveView: 'explorer' });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('explorer');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent('*');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('null');
  });

  test('an active document tab always wins over the active view (views can never be tabs)', () => {
    act(() => {
      useStore.setState({
        workspaceTabs: [{ id: 'chart:revenue', type: 'chart', name: 'revenue', dirty: false }],
        workspaceActiveTabId: 'chart:revenue',
        workspaceActiveView: 'semantic-layer',
      });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('item');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('chart');
  });

  test('returns dashboard scope when URL is /workspace/dashboard/<name>', () => {
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent(
      '+simple-dashboard'
    );
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent(
      'simple-dashboard'
    );
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent(
      'dashboard'
    );
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'simple-dashboard'
    );
  });

  test('returns item scope when ?edit=<type>:<name> is present', () => {
    renderAt('/workspace?edit=chart:revenue_chart');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('item');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent(
      '+revenue_chart'
    );
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent('null');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('chart');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'revenue_chart'
    );
  });

  test('reflects the active non-project tab when no URL scope', () => {
    act(() => {
      useStore.setState({
        workspaceTabs: [
          {
            id: 'project:analytics-platform',
            type: 'project',
            name: 'analytics-platform',
            dirty: false,
          },
          {
            id: 'model:monthly_revenue',
            type: 'model',
            name: 'monthly_revenue',
            dirty: false,
          },
        ],
        workspaceActiveTabId: 'model:monthly_revenue',
      });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('item');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent(
      '+monthly_revenue'
    );
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('model');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'monthly_revenue'
    );
  });

  test('an active dashboard tab at /workspace (tile-open, no URL) scopes to that dashboard (VIS-835)', () => {
    // The Project Editor tile-open path calls openWorkspaceTab without changing
    // the route, so a dashboard tab must scope the Outline even with no URL param.
    act(() => {
      useStore.setState({
        workspaceTabs: [
          { id: 'project:p', type: 'project', name: 'p', dirty: false },
          { id: 'dashboard:table-dashboard', type: 'dashboard', name: 'table-dashboard', dirty: false },
        ],
        workspaceActiveTabId: 'dashboard:table-dashboard',
      });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent('table-dashboard');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent('table-dashboard');
  });

  test('a freshly tile-opened dashboard tab wins over a STALE dashboard URL param (VIS-835)', () => {
    // User was on /workspace/dashboard/A, then opened B via a tile (active tab
    // = B) without the route changing. Scope must follow the tab (B) so the
    // Outline + Library agree with the canvas (which reads the active object),
    // instead of sticking to the stale URL dashboard (A).
    act(() => {
      useStore.setState({
        workspaceTabs: [
          { id: 'dashboard:A', type: 'dashboard', name: 'A', dirty: false },
          { id: 'dashboard:B', type: 'dashboard', name: 'B', dirty: false },
        ],
        workspaceActiveTabId: 'dashboard:B',
      });
    });
    renderAt('/workspace/dashboard/A');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent('B');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent('+B');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent('B');
  });

  test('a stale dashboard URL param is still canonical when no tab is active (the view registry is the fallback of LAST resort)', () => {
    // Project left the tab model (Phase 0), so the pre-Phase-0 "project tab
    // wins over a stale dashboard URL" regression no longer applies to a tab —
    // but the URL still wins over a merely-remembered `workspaceActiveView`
    // when there's no tab to override it (5's precedence position).
    act(() => {
      useStore.setState({ workspaceActiveView: 'semantic-layer' });
    });
    renderAt('/workspace/dashboard/A');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent('A');
  });

  test('an active dashboard tab on a dashboard URL keeps dashboard scope', () => {
    // The dashboard route opens a matching dashboard tab; the tab and the URL
    // agree, so the scope is the dashboard either way.
    act(() => {
      useStore.setState({
        workspaceTabs: [
          {
            id: 'dashboard:simple-dashboard',
            type: 'dashboard',
            name: 'simple-dashboard',
            dirty: false,
          },
        ],
        workspaceActiveTabId: 'dashboard:simple-dashboard',
      });
    });
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'simple-dashboard'
    );
  });

  test('an active non-dashboard tab takes precedence over a lingering dashboard URL (VIS-779 universal lineage)', () => {
    // When a user expands a chart/model/etc. (Library flip-popover "Expand" or
    // a Lineage node click) the route param stays put (E-1 requires the route
    // not to change), but the explicitly-focused object must scope the Lineage
    // lens to ITS OWN DAG — not the dashboard's. `dashboardName` is still
    // surfaced so callers know which dashboard the user came from.
    act(() => {
      useStore.setState({
        workspaceTabs: [
          {
            id: 'chart:fibonacci',
            type: 'chart',
            name: 'fibonacci',
            dirty: false,
          },
        ],
        workspaceActiveTabId: 'chart:fibonacci',
      });
    });
    renderAt('/workspace/dashboard/simple-dashboard');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('item');
    expect(screen.getByTestId('probe-selector')).toHaveTextContent('+fibonacci');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent('chart');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'fibonacci'
    );
    // The originating dashboard is still surfaced.
    expect(screen.getByTestId('probe-dashboard')).toHaveTextContent(
      'simple-dashboard'
    );
  });
});
