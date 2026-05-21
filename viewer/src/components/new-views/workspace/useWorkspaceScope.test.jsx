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

  test('returns root scope with project selectedItem when project tab is active', () => {
    act(() => {
      useStore.setState({
        workspaceTabs: [
          {
            id: 'project:analytics-platform',
            type: 'project',
            name: 'analytics-platform',
            dirty: false,
          },
        ],
        workspaceActiveTabId: 'project:analytics-platform',
      });
    });
    renderAt('/workspace');
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('root');
    expect(screen.getByTestId('probe-selected-type')).toHaveTextContent(
      'project'
    );
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'analytics-platform'
    );
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

  test('URL dashboard scope takes precedence over an active tab', () => {
    act(() => {
      useStore.setState({
        workspaceTabs: [
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
    renderAt('/workspace/dashboard/simple-dashboard');
    // URL wins.
    expect(screen.getByTestId('probe-scope')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('probe-selected-name')).toHaveTextContent(
      'simple-dashboard'
    );
  });
});
