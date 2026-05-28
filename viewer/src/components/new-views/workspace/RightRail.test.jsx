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
