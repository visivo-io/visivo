/**
 * MiddlePane dispatcher (VIS-775 + VIS-805 + VIS-E1 / VIS-779).
 *
 * MiddlePane dispatches on `workspaceActiveObject.type` + `workspaceLens`:
 *   - project chrome / unscoped → mounts the real `<ProjectEditor>` (M-1),
 *     replacing the old "coming soon" placeholder.
 *   - dashboard + lineage lens → mounts `<LineageCanvas>` (VIS-E1); the canvas
 *     lens renders `<ProjectCanvas>` (render-only Dashboard wrapper, VIS-767).
 *   - any non-dashboard object → `<PerObjectPane>`, which defaults to the
 *     universal Lineage lens (VIS-779) and keeps Preview as the Track N
 *     placeholder.
 *
 * Child surfaces (ProjectEditor, ProjectCanvas, LineageCanvas) are mocked so this
 * stays a focused dispatcher test, not the heavy React Flow / Plotly trees.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import MiddlePane from './MiddlePane';
import useStore from '../../../stores/store';

jest.mock('../project/editor/ProjectEditor', () => {
  const Mock = () => <div data-testid="mock-project-editor" />;
  Mock.displayName = 'MockProjectEditor';
  return { __esModule: true, default: Mock };
});

jest.mock('../project/canvas/ProjectCanvas', () => {
  const Mock = () => <div data-testid="project-canvas-mock" />;
  Mock.displayName = 'MockProjectCanvas';
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
      setWorkspaceLens: jest.fn(),
      project: { id: 'proj-1', name: 'proj' },
      ...extra,
    });
  });
};

describe('MiddlePane project variant (VIS-805)', () => {
  test('mounts ProjectEditor when no object is scoped (defaults to project)', () => {
    seed({ workspaceActiveObject: null });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-project')).toBeInTheDocument();
    expect(screen.getByTestId('mock-project-editor')).toBeInTheDocument();
    // The old placeholder is gone.
    expect(screen.queryByTestId('workspace-middle-project-placeholder')).not.toBeInTheDocument();
  });

  test('mounts ProjectEditor when the active object is the project chrome', () => {
    seed({ workspaceActiveObject: { type: 'project', name: 'proj' } });
    render(<MiddlePane />);
    expect(screen.getByTestId('mock-project-editor')).toBeInTheDocument();
  });
});

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
    // The canvas lens now mounts ProjectCanvas (render-only Dashboard
    // wrapper, VIS-767) rather than Dashboard directly.
    expect(screen.getByTestId('project-canvas-mock')).toBeInTheDocument();
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
