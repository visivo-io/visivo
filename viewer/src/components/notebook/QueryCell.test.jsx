import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import QueryCell from './QueryCell';
import useStore from '../../stores/store';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockMonacoEditor({ value, onChange }) {
    return (
      <textarea
        data-testid="mock-sql-editor"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  };
});

// Mock CreateObjectModal
jest.mock('../editors/CreateObjectModal', () => {
  return function MockCreateObjectModal({
    isOpen,
    onClose,
    objSelectedProperty,
    initialAttributes,
    onSubmitCallback,
  }) {
    if (!isOpen) return null;

    return (
      <div data-testid="create-object-modal">
        <div data-testid="modal-property">{objSelectedProperty}</div>
        <div data-testid="modal-initial-sql">{initialAttributes?.sql}</div>
        <button onClick={onClose} data-testid="modal-close">
          Close
        </button>
        <button
          onClick={() => {
            onSubmitCallback({
              type: 'SqlModel',
              type_key: 'models',
              config: { name: 'test_model', sql: initialAttributes?.sql },
            });
            onClose();
          }}
          data-testid="modal-create"
        >
          Create
        </button>
      </div>
    );
  };
});

// Mock CellResultView
jest.mock('./CellResultView', () => {
  return function MockCellResultView() {
    return <div data-testid="cell-result-view">Results</div>;
  };
});

// Mock the store
jest.mock('../../stores/store');

describe('QueryCell', () => {
  const mockCell = {
    id: 'cell-1',
    query_text: 'SELECT * FROM users',
    cell_order: 0,
  };

  const defaultProps = {
    worksheetId: 'ws-1',
    cell: mockCell,
    result: null,
    error: null,
    isExecuting: false,
    onExecute: jest.fn(),
    onDelete: jest.fn(),
    onAddBelow: jest.fn(),
    onQueryChange: jest.fn(),
    isFirst: false,
    isLast: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useStore.mockReturnValue({
      project: { id: 'test-project' },
    });
  });

  describe('Cell menu interactions', () => {
    it('renders all menu items', () => {
      render(<QueryCell {...defaultProps} />);

      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      expect(screen.getByText('Add Cell Below')).toBeInTheDocument();
      expect(screen.getByText('Delete Cell')).toBeInTheDocument();
    });

    it('calls onAddBelow when Add Cell Below is clicked', () => {
      render(<QueryCell {...defaultProps} />);

      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Add Cell Below'));

      expect(defaultProps.onAddBelow).toHaveBeenCalledTimes(1);
    });

    it('calls onDelete when Delete Cell is clicked', () => {
      render(<QueryCell {...defaultProps} />);

      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Delete Cell'));

      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
    });

    it('disables delete when cell is first and last', () => {
      render(<QueryCell {...defaultProps} isFirst={true} isLast={true} />);

      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      const deleteMenuItem = screen.getByRole('menuitem', { name: /delete cell/i });
      expect(deleteMenuItem).toHaveClass('Mui-disabled');
    });
  });
});
