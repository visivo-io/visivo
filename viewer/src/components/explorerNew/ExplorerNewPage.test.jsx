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

jest.mock('./LeftPanel', () => {
  return function MockLeftPanel() {
    return <div data-testid="left-panel">LeftPanel</div>;
  };
});

jest.mock('./CenterPanel', () => {
  return function MockCenterPanel() {
    return <div data-testid="center-panel">CenterPanel</div>;
  };
});

jest.mock('./InsightEditorPanel', () => {
  return function MockInsightEditorPanel() {
    return <div data-testid="insight-editor-panel">InsightEditorPanel</div>;
  };
});

jest.mock('./ExplorationTabBar', () => {
  return function MockExplorationTabBar() {
    return <div data-testid="exploration-tab-bar">ExplorationTabBar</div>;
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
      explorerEditStack: [],
      explorerActiveModelName: null,
      explorerSql: '',
      explorerSourceName: null,
      explorerSavedModelName: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });
  });

  it('renders LeftPanel, CenterPanel, and InsightEditorPanel', () => {
    render(<ExplorerNewPage />);

    expect(screen.getByTestId('explorer-new-page')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('insight-editor-panel')).toBeInTheDocument();
  });

  it('always renders InsightEditorPanel (no conditional)', () => {
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('insight-editor-panel')).toBeInTheDocument();
  });

  it('renders ExplorationTabBar', () => {
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('exploration-tab-bar')).toBeInTheDocument();
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
});
