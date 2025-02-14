import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTabManager from './WorksheetTabManager';

// Mock the child components
jest.mock('./WorksheetTab', () => {
  return function MockWorksheetTab({ worksheet, isActive, onSelect, onClose }) {
    return (
      <div data-testid={`worksheet-tab-${worksheet.id}`}>
        <button data-testid={`select-tab-${worksheet.id}`} onClick={() => onSelect(worksheet.id)}>
          {worksheet.name}
        </button>
        <button data-testid={`close-tab-${worksheet.id}`} onClick={() => onClose(worksheet.id)}>
          Close
        </button>
      </div>
    );
  };
});

jest.mock('./WorksheetTabActions', () => {
  return function MockWorksheetTabActions({ onWorksheetCreate, onWorksheetOpen }) {
    return (
      <div data-testid="worksheet-actions">
        <button data-testid="create-worksheet" onClick={onWorksheetCreate}>Create</button>
        <button data-testid="open-worksheet" onClick={onWorksheetOpen}>Open</button>
      </div>
    );
  };
});

// Mock react-beautiful-dnd
const mockOnDragEnd = jest.fn();
jest.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children, onDragEnd }) => {
    mockOnDragEnd.mockImplementation(onDragEnd);
    return <div>{children}</div>;
  },
  Droppable: ({ children }) => children({
    innerRef: jest.fn(),
    droppableProps: {},
    placeholder: null
  }),
  Draggable: ({ children }) => children({
    innerRef: jest.fn(),
    draggableProps: {},
    dragHandleProps: {}
  }, {
    isDragging: false,
    draggingOver: null
  })
}));

describe('WorksheetTabManager', () => {
  const defaultProps = {
    worksheets: [
      { id: 1, name: 'Worksheet 1' },
      { id: 2, name: 'Worksheet 2' },
      { id: 3, name: 'Worksheet 3' }
    ],
    activeWorksheetId: 1,
    onWorksheetSelect: jest.fn(),
    onWorksheetClose: jest.fn(),
    onWorksheetCreate: jest.fn(),
    onWorksheetOpen: jest.fn(),
    onWorksheetReorder: jest.fn(),
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all worksheets', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    defaultProps.worksheets.forEach(worksheet => {
      expect(screen.getByTestId(`worksheet-tab-${worksheet.id}`)).toBeInTheDocument();
    });
  });

  it('renders worksheet actions', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    expect(screen.getByTestId('worksheet-actions')).toBeInTheDocument();
  });

  it('calls onWorksheetSelect when a tab is clicked', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('select-tab-2'));
    expect(defaultProps.onWorksheetSelect).toHaveBeenCalledWith(2);
  });

  it('calls onWorksheetClose when a tab is closed', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-tab-2'));
    expect(defaultProps.onWorksheetClose).toHaveBeenCalledWith(2);
  });

  it('calls onWorksheetCreate when create button is clicked', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('create-worksheet'));
    expect(defaultProps.onWorksheetCreate).toHaveBeenCalled();
  });

  it('calls onWorksheetOpen when open button is clicked', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('open-worksheet'));
    expect(defaultProps.onWorksheetOpen).toHaveBeenCalled();
  });

  it('calls onWorksheetReorder with correct order when drag ends', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    mockOnDragEnd({
      destination: { index: 2 },
      source: { index: 0 },
      draggableId: 'worksheet-1'
    });
    expect(defaultProps.onWorksheetReorder).toHaveBeenCalledWith([2, 3, 1]);
  });

  it('does not call onWorksheetReorder when drag destination is null', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    mockOnDragEnd({
      destination: null,
      source: { index: 0 },
      draggableId: 'worksheet-1'
    });
    expect(defaultProps.onWorksheetReorder).not.toHaveBeenCalled();
  });

  it('does not call onWorksheetReorder when source and destination indexes are the same', () => {
    render(<WorksheetTabManager {...defaultProps} />);
    mockOnDragEnd({
      destination: { index: 0 },
      source: { index: 0 },
      draggableId: 'worksheet-1'
    });
    expect(defaultProps.onWorksheetReorder).not.toHaveBeenCalled();
  });
}); 