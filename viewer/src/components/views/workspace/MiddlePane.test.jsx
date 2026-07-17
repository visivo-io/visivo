/**
 * MiddlePane dispatcher (VIS-775 + VIS-805 + VIS-E1 / VIS-779; reworked in
 * Explore 2.0 Phase 0 for the destination/view model).
 *
 * MiddlePane dispatches on the active DOCUMENT tab, else the active
 * DESTINATION:
 *   - no active document tab → the active view's HomePane from
 *     `higherLevelViews.js` (Project → real `<ProjectEditor>`, Semantic Layer →
 *     the ERD shell, Explorer → the Phase-0 placeholder).
 *   - dashboard + lineage lens → mounts `<LineageCanvas>` (VIS-E1); the canvas
 *     lens renders `<ProjectCanvas>` (render-only Dashboard wrapper, VIS-767).
 *   - a non-dashboard object WITH a Track-N preview (chart/table/markdown/
 *     input/insight/model) → `<PerObjectPane>` defaulting to the Preview lens,
 *     mounting that type's custom Preview component (from objectCanvasRegistry).
 *   - a non-dashboard object WITHOUT a preview (source/dimension/…/unknown) →
 *     `<PerObjectPane>` locked to the universal Lineage lens (VIS-779), Preview
 *     muted.
 *
 * Child surfaces (ProjectEditor, ProjectCanvas, LineageCanvas, SemanticLayerCanvas,
 * the Track-N preview components) are mocked so this stays a focused dispatcher
 * test, not the heavy React Flow / Plotly trees.
 */
import React from 'react';
import { render as rtlRender, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MiddlePane from './MiddlePane';
import useStore from '../../../stores/store';

// MiddlePane reads the URL (?edit/?lens) for the deep-link lens, so every render
// needs a Router. Wrap render (and the rerender it returns) in a MemoryRouter.
const RouterWrapper = ({ children }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);
const render = (ui, options) => rtlRender(ui, { wrapper: RouterWrapper, ...options });

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
// The Semantic Layer's ERD (VIS-1014) is a React-Flow tree — mock it so the
// destination-dispatch tests stay focused on routing, not the canvas itself.
jest.mock('./relations/SemanticLayerCanvas', () => ({
  __esModule: true,
  default: () => <div data-testid="semantic-layer-canvas-mock" />,
}));

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceActiveObject: { type: 'dashboard', name: 'sales' },
      workspaceActiveView: 'project',
      workspaceLens: 'preview',
      setWorkspaceLens: jest.fn(),
      project: { id: 'proj-1', name: 'proj' },
      ...extra,
    });
  });
};

describe('MiddlePane destination Home panes (VIS-805; Explore 2.0 Phase 0 D1)', () => {
  test('mounts ProjectEditor when no document tab is active (defaults to the Project view)', () => {
    seed({ workspaceActiveObject: null, workspaceActiveView: 'project' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-project')).toBeInTheDocument();
    expect(screen.getByTestId('mock-project-editor')).toBeInTheDocument();
    // The old placeholder is gone.
    expect(screen.queryByTestId('workspace-middle-project-placeholder')).not.toBeInTheDocument();
  });

  test('mounts the Semantic Layer Home when that view is active and no document tab is focused', async () => {
    seed({ workspaceActiveObject: null, workspaceActiveView: 'semantic-layer' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-semantic-layer')).toBeInTheDocument();
    // The canvas body is lazy (React-Flow, code-split) — resolves through Suspense.
    expect(await screen.findByTestId('semantic-layer-canvas-mock')).toBeInTheDocument();
    // The Project Home does NOT also render.
    expect(screen.queryByTestId('workspace-middle-project')).not.toBeInTheDocument();
  });

  test('mounts the Explorer Home placeholder when that view is active and no document tab is focused', () => {
    seed({ workspaceActiveObject: null, workspaceActiveView: 'explorer' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-explorer')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-explorer-empty')).toBeInTheDocument();
    expect(screen.getByText(/Explorer arrives with explorations/i)).toBeInTheDocument();
  });

  test('an active document tab wins over the active view — the view is never a tab in Phase 0', async () => {
    // `activeObject` truthy always dispatches to the dashboard/per-object
    // branches, regardless of `workspaceActiveView` — destinations can only
    // render through the `!activeObject` branch (they left the tab model).
    seed({ workspaceActiveObject: { type: 'chart', name: 'revenue' }, workspaceActiveView: 'semantic-layer' });
    render(<MiddlePane />);
    expect(screen.queryByTestId('workspace-middle-semantic-layer')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-chart')).toBeInTheDocument();
    // Let the chart preview's lazy chunk resolve inside act() before the test ends.
    expect(await screen.findByTestId('chart-preview-mock')).toBeInTheDocument();
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
  ])('defaults a selected %s to the Preview lens, mounting its custom preview', async (type, previewTestId) => {
    seed({ workspaceActiveObject: { type, name: `my-${type}` }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId(`workspace-middle-${type}-preview`)).toBeInTheDocument();
    // The body is lazy (code-split, VIS-1001) — it resolves through Suspense.
    expect(await screen.findByTestId(previewTestId)).toBeInTheDocument();
    expect(screen.queryByTestId('lineage-canvas-mock')).not.toBeInTheDocument();
  });

  test('a Track-N type can flip from its Preview to the Lineage lens', async () => {
    seed({ workspaceActiveObject: { type: 'chart', name: 'revenue' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    // Defaults to its custom preview (lazy → resolves through Suspense).
    expect(await screen.findByTestId('chart-preview-mock')).toBeInTheDocument();

    // Lineage is selectable — clicking it flips to the universal DAG view.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-lineage'));
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-preview-mock')).not.toBeInTheDocument();
  });

  test('flipping one object to Lineage does NOT leak the lens to the next object (resets to Preview)', async () => {
    // Regression: PerObjectPane is a single reused React instance, so a chart
    // flipped to Lineage would leak its lens — selecting a table next opened it
    // on Lineage instead of its Preview default. The lens must reset on switch.
    seed({ workspaceActiveObject: { type: 'chart', name: 'revenue' }, workspaceLens: 'preview' });
    const { rerender } = render(<MiddlePane />);
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-lineage'));
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();

    // Switch to a different previewable object (cross-type).
    act(() => {
      useStore.setState({ workspaceActiveObject: { type: 'table', name: 'orders' } });
    });
    rerender(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-table-preview')).toBeInTheDocument();
    expect(await screen.findByTestId('table-preview-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-middle-table-lineage')).not.toBeInTheDocument();

    // Same-type navigation also re-defaults: flip table → Lineage, pick another table.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-lineage'));
    expect(screen.getByTestId('workspace-middle-table-lineage')).toBeInTheDocument();
    act(() => {
      useStore.setState({ workspaceActiveObject: { type: 'table', name: 'revenue_table' } });
    });
    rerender(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-table-preview')).toBeInTheDocument();
  });

  test('a lineage-click lens intent opens the new object on Lineage, once (VIS-779 Step 4)', () => {
    // A lineage node click sets a one-shot, object-scoped intent so walking
    // the DAG doesn't bounce previewable objects back to their Preview lens.
    seed({
      workspaceActiveObject: { type: 'chart', name: 'revenue' },
      workspaceLens: 'lineage',
      workspaceLensIntent: { objectKey: 'chart:revenue', lens: 'lineage' },
    });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-preview-mock')).not.toBeInTheDocument();
    // Consumed: the intent is cleared so it can't re-apply later.
    expect(useStore.getState().workspaceLensIntent).toBeNull();
  });

  test('a lens intent scoped to a DIFFERENT object does not apply', () => {
    seed({
      workspaceActiveObject: { type: 'chart', name: 'revenue' },
      workspaceLens: 'preview',
      workspaceLensIntent: { objectKey: 'table:orders', lens: 'lineage' },
    });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-chart-preview')).toBeInTheDocument();
    // Not consumed either — it belongs to a selection that hasn't happened.
    expect(useStore.getState().workspaceLensIntent).toEqual({
      objectKey: 'table:orders',
      lens: 'lineage',
    });
  });
});

describe('MiddlePane — universal Lineage fallback for preview-less objects (VIS-779)', () => {
  // Every first-class object type now has a canvas (source ERD VIS-1005,
  // relation ERD VIS-1006, dimension/metric Field Lens VIS-1009, …), so the
  // preview-less fallback is exercised by genuinely unregistered types.
  test.each(['gadget', 'gizmo'])(
    'a selected %s (no canvas descriptor) locks onto the Lineage lens',
    (type) => {
      seed({ workspaceActiveObject: { type, name: `my-${type}` }, workspaceLens: 'preview' });
      render(<MiddlePane />);
      expect(screen.getByTestId(`workspace-middle-${type}-lineage`)).toBeInTheDocument();
      expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
      expect(screen.queryByTestId(`workspace-middle-${type}-preview`)).not.toBeInTheDocument();
    }
  );

  test('the Canvas option is muted for a preview-less type and cannot flip away from Lineage', () => {
    seed({ workspaceActiveObject: { type: 'gadget', name: 'g' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();

    // The Canvas option is disabled — clicking it does not flip away from Lineage.
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-preview'));
    expect(screen.getByTestId('workspace-middle-gadget-lineage')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-middle-gadget-preview')).not.toBeInTheDocument();
  });

  test('an unknown object type also defaults to the universal Lineage lens', () => {
    seed({ workspaceActiveObject: { type: 'mystery', name: 'x' }, workspaceLens: 'preview' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-mystery-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
  });
});
