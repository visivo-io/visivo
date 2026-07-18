/**
 * ExplorationWorkbench — the legacy Explorer 3-panel bundle re-parented for
 * `ExplorationPane` (Explore 2.0 Phase 2). Same composition as `ExplorerPage`
 * (the standalone route), just re-sized — pinned here as a light structural
 * test; the shared init lifecycle is `useExplorerWorkbenchInit`'s own
 * concern (mirrored, not duplicated, from `ExplorerPage.test.jsx`).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ExplorationWorkbench from './ExplorationWorkbench';
import useStore from '../../../stores/store';

jest.mock('../../explorer/ExplorerDndContext', () => {
  return function MockExplorerDndContext({ children }) {
    return <div data-testid="dnd-context">{children}</div>;
  };
});
jest.mock('../../explorer/ExplorerLeftPanel', () => {
  return function MockExplorerLeftPanel() {
    return <div data-testid="left-panel">ExplorerLeftPanel</div>;
  };
});
jest.mock('../../explorer/CenterPanel', () => {
  return function MockCenterPanel() {
    return <div data-testid="center-panel">CenterPanel</div>;
  };
});
jest.mock('../../explorer/ExplorerRightPanel', () => {
  return function MockExplorerRightPanel() {
    return <div data-testid="right-panel">ExplorerRightPanel</div>;
  };
});
jest.mock('../../common/VerticalDivider', () => {
  return function MockVerticalDivider({ handleMouseDown }) {
    return (
      <div data-testid="vertical-divider" onMouseDown={handleMouseDown}>
        VD
      </div>
    );
  };
});
jest.mock('../../../hooks/usePanelResize', () => ({
  usePanelResize: () => ({ ratio: 0.18, isResizing: false, handleMouseDown: jest.fn() }),
}));

describe('ExplorationWorkbench', () => {
  beforeEach(() => {
    useStore.setState({
      explorerLeftNavCollapsed: false,
      explorerModelTabs: [],
      explorerActiveModelName: null,
      explorerChartInsightNames: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
      explorerChartName: null,
      explorerChartLayout: {},
      explorerSources: [],
    });
  });

  test('renders all three legacy panels under the DnD context', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('exploration-workbench')).toBeInTheDocument();
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  test('hides the vertical divider when the left nav is collapsed', () => {
    useStore.setState({ explorerLeftNavCollapsed: true });
    render(<ExplorationWorkbench />);
    expect(screen.queryByTestId('vertical-divider')).not.toBeInTheDocument();
  });

  test('shows the vertical divider when the left nav is expanded', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('vertical-divider')).toBeInTheDocument();
  });

  test('sizes to fill its container (no fixed viewport height, unlike the standalone route)', () => {
    render(<ExplorationWorkbench />);
    const root = screen.getByTestId('exploration-workbench');
    expect(root.className).toContain('flex-1');
    expect(root.className).not.toContain('100vh');
  });
});
