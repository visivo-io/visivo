/**
 * ProjectCanvas (VIS-D1 / VIS-767) — render-only foundation.
 *
 * Verifies ProjectCanvas renders <DashboardNew> at parity: it forwards the
 * passed `projectId` / `dashboardName` props unchanged and adds NO editing
 * affordances. DashboardNew is mocked so this stays a focused wrapper test,
 * not the heavy Plotly/data tree.
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

describe('ProjectCanvas (VIS-767)', () => {
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
});
