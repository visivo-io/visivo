/**
 * ProjectCanvas (VIS-D1 / VIS-767, extended by VIS-D2 / VIS-768).
 *
 * Verifies ProjectCanvas wraps <DashboardNew> at parity (forwards `projectId` /
 * `dashboardName` unchanged) AND mounts the VIS-768 editing-affordance overlay
 * layer on top. DashboardNew is mocked so this stays a focused wrapper test,
 * not the heavy Plotly/data tree; the overlay reads the real workspace store.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ProjectCanvas from './ProjectCanvas';

jest.mock('../DashboardNew', () => {
  const Mock = ({ projectId, dashboardName }) => (
    <div
      data-testid="dashboard-new-mock"
      data-project-id={projectId}
      data-dashboard-name={dashboardName}
    />
  );
  Mock.displayName = 'MockDashboardNew';
  return { __esModule: true, default: Mock };
});

describe('ProjectCanvas (VIS-767 / VIS-768)', () => {
  test('renders DashboardNew', () => {
    render(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-new-mock')).toBeInTheDocument();
  });

  test('forwards projectId and dashboardName to DashboardNew unchanged', () => {
    render(<ProjectCanvas projectId="proj-42" dashboardName="revenue" />);
    const dashboard = screen.getByTestId('dashboard-new-mock');
    expect(dashboard).toHaveAttribute('data-project-id', 'proj-42');
    expect(dashboard).toHaveAttribute('data-dashboard-name', 'revenue');
  });

  test('mounts the editing-affordance overlay layer (VIS-768)', () => {
    render(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    // The overlay is a pointer-events-none sibling layer positioned over the
    // render — it must NOT intercept DashboardNew's own interactivity.
    const overlay = screen.getByTestId('canvas-overlay-layer');
    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toContain('pointer-events-none');
  });

  test('the canvas root is positioned so the overlay can anchor to it', () => {
    render(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas').className).toContain('relative');
  });
});
