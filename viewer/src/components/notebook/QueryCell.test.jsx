import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  describe('Save as Model functionality', () => {
    it('renders Save as Model menu item', () => {
      render(<QueryCell {...defaultProps} />);

      // Open the menu (find button with MoreVertIcon)
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      expect(screen.getByText('Save as Model')).toBeInTheDocument();
    });

    it('disables Save as Model when query is empty', () => {
      const emptyCell = { ...mockCell, query_text: '' };
      render(<QueryCell {...defaultProps} cell={emptyCell} />);

      // Open the menu
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      const saveMenuItem = screen.getByRole('menuitem', { name: /save as model/i });
      expect(saveMenuItem).toHaveClass('Mui-disabled');
    });

    it('opens CreateObjectModal when Save as Model is clicked', async () => {
      render(<QueryCell {...defaultProps} />);

      // Open the menu
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      // Click Save as Model
      const saveMenuItem = screen.getByText('Save as Model');
      fireEvent.click(saveMenuItem);

      await waitFor(() => {
        expect(screen.getByTestId('create-object-modal')).toBeInTheDocument();
      });
    });

    it('passes models as selected property to modal', async () => {
      render(<QueryCell {...defaultProps} />);

      // Open menu and click Save as Model
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Save as Model'));

      await waitFor(() => {
        expect(screen.getByTestId('modal-property')).toHaveTextContent('models');
      });
    });

    it('passes cell query as initial SQL attribute', async () => {
      render(<QueryCell {...defaultProps} />);

      // Open menu and click Save as Model
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Save as Model'));

      await waitFor(() => {
        expect(screen.getByTestId('modal-initial-sql')).toHaveTextContent(mockCell.query_text);
      });
    });

    it('closes modal when modal close is clicked', async () => {
      render(<QueryCell {...defaultProps} />);

      // Open the modal
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Save as Model'));

      await waitFor(() => {
        expect(screen.getByTestId('create-object-modal')).toBeInTheDocument();
      });

      // Close the modal
      fireEvent.click(screen.getByTestId('modal-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('create-object-modal')).not.toBeInTheDocument();
      });
    });

    it('handles model creation successfully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      render(<QueryCell {...defaultProps} />);

      // Open modal and create model
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Save as Model'));

      await waitFor(() => {
        expect(screen.getByTestId('create-object-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('modal-create'));

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith('Model created:', expect.any(Object));
      });

      consoleLogSpy.mockRestore();
    });

    it('uses current query text when Save as Model is clicked', async () => {
      render(<QueryCell {...defaultProps} />);

      // Change the query
      const editor = screen.getByTestId('mock-sql-editor');
      fireEvent.change(editor, { target: { value: 'SELECT * FROM products' } });

      // Open menu and click Save as Model
      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);
      fireEvent.click(screen.getByText('Save as Model'));

      await waitFor(() => {
        expect(screen.getByTestId('modal-initial-sql')).toHaveTextContent('SELECT * FROM products');
      });
    });
  });

  describe('Cell menu interactions', () => {
    it('renders all menu items', () => {
      render(<QueryCell {...defaultProps} />);

      const menuButton = screen.getByTestId('cell-menu-button');
      fireEvent.click(menuButton);

      expect(screen.getByText('Save as Model')).toBeInTheDocument();
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
