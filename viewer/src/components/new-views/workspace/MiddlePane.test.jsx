/**
 * MiddlePane dispatch behaviour (VIS-775 + VIS-E1 / VIS-779).
 *
 * MiddlePane dispatches on `workspaceActiveObject.type` + `workspaceLens`.
 * These tests pin two changes:
 *   - VIS-E1: the dashboard lineage lens mounts `<LineageCanvas>` (replacing
 *     the Track-E placeholder), while the canvas lens renders the dashboard.
 *   - VIS-779: the Lineage lens is universal for non-dashboard objects — it is
 *     the per-object default and mounts `<LineageCanvas>`, while the Preview
 *     lens keeps the Track N placeholder.
 *
 * Child surfaces (DashboardNew, LineageCanvas) are mocked so the test exercises
 * the dispatcher, not the heavy React Flow / Plotly trees beneath it.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

describe('MiddlePane — universal Lineage lens for non-dashboard objects (VIS-779)', () => {
  test.each(['chart', 'model', 'insight', 'input', 'table', 'markdown', 'source'])(
    'defaults a selected %s to the Lineage lens, mounting LineageCanvas',
    (type) => {
      // Store lens default is 'preview' (the dashboard canvas default); the
      // per-object pane must still default to lineage regardless.
      seed({ workspaceActiveObject: { type, name: `my-${type}` }, workspaceLens: 'preview' });
      render(<MiddlePane />);
      expect(screen.getByTestId(`workspace-middle-${type}-lineage`)).toBeInTheDocument();
      expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
      expect(
        screen.queryByTestId(`workspace-middle-${type}-placeholder`)
      ).not.toBeInTheDocument();
    }
  );

  test('switching a non-dashboard object to the Preview lens shows the Track N placeholder', () => {
    seed({ workspaceActiveObject: { type: 'chart', name: 'revenue' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    // Defaults to lineage.
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();

    // Preview is selectable — clicking it flips to the Track N placeholder.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-preview'));
    expect(screen.getByTestId('workspace-middle-chart-placeholder')).toBeInTheDocument();
    expect(screen.getByText(/Per-object preview coming soon \(Track N\)/i)).toBeInTheDocument();
    expect(screen.queryByTestId('lineage-canvas-mock')).not.toBeInTheDocument();
  });

  test('an unknown object type also defaults to the universal Lineage lens', () => {
    seed({ workspaceActiveObject: { type: 'mystery', name: 'x' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-mystery-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
  });
});
