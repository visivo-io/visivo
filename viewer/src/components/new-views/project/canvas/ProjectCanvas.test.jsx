/**
 * ProjectCanvas (VIS-D1 / VIS-767, extended by VIS-D2 / VIS-768).
 *
 * Verifies ProjectCanvas wraps <Dashboard> at parity (forwards `projectId` /
 * `dashboardName` unchanged) AND mounts the VIS-768 editing-affordance overlay
 * layer on top. Dashboard is mocked so this stays a focused wrapper test,
 * not the heavy Plotly/data tree; the overlay reads the real workspace store.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectCanvas from './ProjectCanvas';
import useStore from '../../../../stores/store';

// ProjectCanvas mounts the CanvasAddRow overlay, which uses react-router's
// useNavigate for the inline-create route (VIS-794), so renders are wrapped in
// a router.
const renderWithRouter = ui =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  );

jest.mock('../../../project/Dashboard', () => {
  const Mock = ({ projectId, dashboardName }) => (
    <div
      data-testid="dashboard-new-mock"
      data-project-id={projectId}
      data-dashboard-name={dashboardName}
    />
  );
  Mock.displayName = 'MockDashboard';
  return { __esModule: true, default: Mock };
});

describe('ProjectCanvas (VIS-767 / VIS-768)', () => {
  test('renders Dashboard', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-new-mock')).toBeInTheDocument();
  });

  test('forwards projectId and dashboardName to Dashboard unchanged', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-42" dashboardName="revenue" />);
    const dashboard = screen.getByTestId('dashboard-new-mock');
    expect(dashboard).toHaveAttribute('data-project-id', 'proj-42');
    expect(dashboard).toHaveAttribute('data-dashboard-name', 'revenue');
  });

  test('mounts the editing-affordance overlay layer (VIS-768)', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    // The overlay is a pointer-events-none sibling layer positioned over the
    // render — it must NOT intercept Dashboard's own interactivity.
    const overlay = screen.getByTestId('canvas-overlay-layer');
    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toContain('pointer-events-none');
  });

  test('the canvas root is positioned so the overlay can anchor to it', () => {
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    expect(screen.getByTestId('project-canvas').className).toContain('relative');
  });

  test('mounts the DnD affordance layer when the scoped dashboard exists (VIS-771)', () => {
    useStore.setState({
      dashboards: [{ name: 'sales', config: { rows: [{ items: [{ chart: 'ref(a)' }] }] } }],
    });
    renderWithRouter(<ProjectCanvas projectId="proj-1" dashboardName="sales" />);
    // The DnD layer is wired to the shell's shared DndContext (no second
    // context); it mounts as a pointer-events-none sibling over the render.
    const dndLayer = screen.getByTestId('canvas-dnd-layer');
    expect(dndLayer).toBeInTheDocument();
    expect(dndLayer.className).toContain('pointer-events-none');
  });
});
