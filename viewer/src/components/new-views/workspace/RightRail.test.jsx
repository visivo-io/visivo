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
