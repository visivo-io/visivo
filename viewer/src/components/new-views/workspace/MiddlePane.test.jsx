/**
 * MiddlePane dispatcher (VIS-775 + VIS-805 + VIS-E1 / VIS-779).
 *
 * MiddlePane dispatches on `workspaceActiveObject.type` + `workspaceLens`:
 *   - project chrome / unscoped → mounts the real `<ProjectEditor>` (M-1),
 *     replacing the old "coming soon" placeholder.
 *   - dashboard + lineage lens → mounts `<LineageCanvas>` (VIS-E1); the canvas
 *     lens renders `<ProjectCanvas>` (render-only Dashboard wrapper, VIS-767).
 *   - a non-dashboard object WITH a Track-N preview (chart/table/markdown/
 *     input/insight/model) → `<PerObjectPane>` defaulting to the Preview lens,
 *     mounting that type's custom Preview component (from previewRegistry).
 *   - a non-dashboard object WITHOUT a preview (source/dimension/…/unknown) →
 *     `<PerObjectPane>` locked to the universal Lineage lens (VIS-779), Preview
 *     muted.
 *
 * Child surfaces (ProjectEditor, ProjectCanvas, LineageCanvas, the Track-N
 * preview components) are mocked so this stays a focused dispatcher test, not
 * the heavy React Flow / Plotly trees.
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

// Mock the Track-N preview components so the dispatcher test stays focused — it
// only verifies WHICH preview mounts, not the heavy renderers themselves (those
// have their own component tests). The factory is inlined per-mock because
// jest.mock is hoisted above module-scope helpers.
jest.mock('./ChartPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="chart-preview-mock" />,
}));
jest.mock('./TablePreview', () => ({
  __esModule: true,
  default: () => <div data-testid="table-preview-mock" />,
}));
jest.mock('./MarkdownPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="markdown-preview-mock" />,
}));
jest.mock('./InputPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="input-preview-mock" />,
}));
jest.mock('./InsightPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="insight-preview-mock" />,
}));
jest.mock('./ModelPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="model-preview-mock" />,
}));

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

describe('MiddlePane — Track-N custom previews for non-dashboard objects (VIS-784/791/795/796/798/801)', () => {
  test.each([
    ['chart', 'chart-preview-mock'],
    ['table', 'table-preview-mock'],
    ['markdown', 'markdown-preview-mock'],
    ['input', 'input-preview-mock'],
    ['insight', 'insight-preview-mock'],
    ['model', 'model-preview-mock'],
  ])('defaults a selected %s to the Preview lens, mounting its custom preview', (type, previewTestId) => {
    seed({ workspaceActiveObject: { type, name: `my-${type}` }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId(`workspace-middle-${type}-preview`)).toBeInTheDocument();
    expect(screen.getByTestId(previewTestId)).toBeInTheDocument();
    expect(screen.queryByTestId('lineage-canvas-mock')).not.toBeInTheDocument();
  });

  test('a Track-N type can flip from its Preview to the Lineage lens', () => {
    seed({ workspaceActiveObject: { type: 'chart', name: 'revenue' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    // Defaults to its custom preview.
    expect(screen.getByTestId('chart-preview-mock')).toBeInTheDocument();

    // Lineage is selectable — clicking it flips to the universal DAG view.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-lineage'));
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-preview-mock')).not.toBeInTheDocument();
  });
});

describe('MiddlePane — universal Lineage fallback for preview-less objects (VIS-779)', () => {
  test.each(['source', 'dimension', 'metric', 'relation'])(
    'a selected %s (no custom preview) locks onto the Lineage lens',
    (type) => {
      seed({ workspaceActiveObject: { type, name: `my-${type}` }, workspaceLens: 'preview' });
      render(<MiddlePane />);
      expect(screen.getByTestId(`workspace-middle-${type}-lineage`)).toBeInTheDocument();
      expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
      expect(screen.queryByTestId(`workspace-middle-${type}-preview`)).not.toBeInTheDocument();
    }
  );

  test('the Preview option is muted for a preview-less type and cannot flip away from Lineage', () => {
    seed({ workspaceActiveObject: { type: 'source', name: 'db' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();

    // The Preview option is disabled — clicking it does not flip away from Lineage.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-preview'));
    expect(screen.getByTestId('workspace-middle-source-lineage')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-middle-source-preview')).not.toBeInTheDocument();
  });

  test('an unknown object type also defaults to the universal Lineage lens', () => {
    seed({ workspaceActiveObject: { type: 'mystery', name: 'x' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-mystery-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
  });
});
