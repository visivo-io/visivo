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

jest.mock('../new-views/common/EditPanel', () => {
  return function MockEditPanel({ editItem, onClose }) {
    return (
      <div data-testid="edit-panel" onClick={onClose}>
        EditPanel: {editItem?.type} - {editItem?.object?.name}
      </div>
    );
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

jest.mock('../../hooks/useObjectSave', () => ({
  useObjectSave: () => jest.fn(),
}));

describe('ExplorerNewPage', () => {
  beforeEach(() => {
    useStore.setState({
      explorerLeftNavCollapsed: false,
      explorerEditStack: [],
      explorerActiveModelName: null,
      explorerSql: '',
      explorerSourceName: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });
  });

  it('renders LeftPanel and CenterPanel', () => {
    render(<ExplorerNewPage />);

    expect(screen.getByTestId('explorer-new-page')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
  });

  it('shows empty state when no edit item is selected', () => {
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('edit-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-panel')).not.toBeInTheDocument();
  });

  it('shows EditPanel when an edit item is in the stack', () => {
    useStore.setState({
      explorerEditStack: [
        { type: 'model', object: { name: 'test_model', config: { sql: 'SELECT 1' } } },
      ],
    });
    render(<ExplorerNewPage />);
    expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    expect(screen.getByText(/EditPanel: model - test_model/)).toBeInTheDocument();
    expect(screen.queryByTestId('edit-panel-empty')).not.toBeInTheDocument();
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
