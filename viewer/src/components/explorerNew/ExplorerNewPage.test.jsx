import React from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ExplorerNewPage from './ExplorerNewPage';
import useStore from '../../stores/store';
import { futureFlags } from '../../router-config';

// Renders through a Router (J-3: ExplorerNewPage now reads search params).
let currentEntry = '/explorer';
const render = (ui) =>
  rtlRender(
    <MemoryRouter initialEntries={[currentEntry]} future={futureFlags}>
      {ui}
    </MemoryRouter>
  );

jest.mock('./ExplorerReturnChip', () => {
  return function MockExplorerReturnChip() {
    return <div data-testid="return-chip">ReturnChip</div>;
  };
});

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

jest.mock('../common/VerticalDivider', () => {
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
    currentEntry = '/explorer';
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

  // J-3 / VIS-782 — return bar visibility.
  it('does not render the return bar on a normal Explorer entry', () => {
    render(<ExplorerNewPage />);
    expect(screen.queryByTestId('explorer-return-bar')).not.toBeInTheDocument();
  });

  it('renders the return bar when entered from Workspace', () => {
    currentEntry = '/explorer?return_to=workspace&dashboard=sales';
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('explorer-return-bar')).toBeInTheDocument();
    expect(screen.getByTestId('return-chip')).toBeInTheDocument();
  });

  it('does not render the return bar without a dashboard param', () => {
    currentEntry = '/explorer?return_to=workspace';
    render(<ExplorerNewPage />);
    expect(screen.queryByTestId('explorer-return-bar')).not.toBeInTheDocument();
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
