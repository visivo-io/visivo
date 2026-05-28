/**
 * MiddlePane dispatch behaviour (VIS-775 + VIS-E1 / VIS-779).
 *
 * MiddlePane dispatches on `workspaceActiveObject.type` + `workspaceLens`.
 * These tests pin the VIS-E1 change specifically: the dashboard lineage lens
 * now mounts `<LineageCanvas>` in the middle pane (replacing the Track-E
 * placeholder), while the canvas lens still renders the dashboard renderer.
 *
 * Child surfaces (DashboardNew, LineageCanvas) are mocked so the test exercises
 * the dispatcher, not the heavy React Flow / Plotly trees beneath it.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import MiddlePane from './MiddlePane';
import useStore from '../../../stores/store';

jest.mock('../project/DashboardNew', () => {
  const Mock = () => <div data-testid="dashboard-new-mock" />;
  Mock.displayName = 'MockDashboardNew';
  return { __esModule: true, default: Mock };
});

jest.mock('../lineage/LineageCanvas', () => {
  const Mock = () => <div data-testid="lineage-canvas-mock" />;
  Mock.displayName = 'MockLineageCanvas';
  return { __esModule: true, default: Mock };
});

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceActiveObject: { type: 'dashboard', name: 'sales' },
      workspaceLens: 'preview',
      project: { id: 'proj-1' },
      ...extra,
    });
  });
};

describe('MiddlePane — dashboard lineage lens (VIS-E1)', () => {
  test('mounts LineageCanvas when the dashboard lens is "lineage"', () => {
    seed({ workspaceLens: 'lineage' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-dashboard-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
    // The old placeholder copy must be gone.
    expect(screen.queryByText(/Lineage view coming soon/i)).not.toBeInTheDocument();
  });

  test('renders the dashboard canvas (not lineage) when the lens is "preview"', () => {
    seed({ workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-dashboard-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-new-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('lineage-canvas-mock')).not.toBeInTheDocument();
  });
});
