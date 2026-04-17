import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerNewPage from './ExplorerNewPage';
import useStore from '../../stores/store';

jest.mock('./ExplorerDndContext', () => {
  return function MockExplorerDndContext({ children }) {
    return <div data-testid="dnd-context">{children}</div>;
  };
});

jest.mock('./ExplorerLeftPanel', () => {
  return function MockExplorerLeftPanel() {
    return <div data-testid="left-panel">ExplorerLeftPanel</div>;
  };
});

jest.mock('./CenterPanel', () => {
  return function MockCenterPanel() {
    return <div data-testid="center-panel">CenterPanel</div>;
  };
});

jest.mock('./ExplorerRightPanel', () => {
  return function MockExplorerRightPanel() {
    return <div data-testid="right-panel">ExplorerRightPanel</div>;
  };
});

jest.mock('../explorer/VerticalDivider', () => {
  return function MockVerticalDivider({ handleMouseDown }) {
    return (
      <div data-testid="vertical-divider" onMouseDown={handleMouseDown}>
        VD
      </div>
    );
  };
});

jest.mock('../../hooks/usePanelResize', () => ({
  usePanelResize: () => ({
    ratio: 0.18,
    isResizing: false,
    handleMouseDown: jest.fn(),
  }),
}));

describe('ExplorerNewPage', () => {
  beforeEach(() => {
    useStore.setState({
      explorerLeftNavCollapsed: false,
      explorerActiveModelName: null,
      explorerChartInsightNames: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
      explorerChartName: null,
      explorerChartLayout: {},
    });
  });

  it('renders LeftPanel, CenterPanel, and RightPanel', () => {
    render(<ExplorerNewPage />);

    expect(screen.getByTestId('explorer-new-page')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  it('right panel is always rendered (never conditional)', () => {
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  it('renders VerticalDivider when left nav is expanded', () => {
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('vertical-divider')).toBeInTheDocument();
  });

  it('hides VerticalDivider when left nav is collapsed', () => {
    useStore.setState({ explorerLeftNavCollapsed: true });
    render(<ExplorerNewPage />);
    expect(screen.queryByTestId('vertical-divider')).not.toBeInTheDocument();
  });

  it('does not render EditPanel or edit-panel-empty', () => {
    render(<ExplorerNewPage />);
    expect(screen.queryByTestId('edit-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-panel-empty')).not.toBeInTheDocument();
  });
});
