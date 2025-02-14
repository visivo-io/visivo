import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTabManager from './WorksheetTabManager';
import { WorksheetProvider } from '../../contexts/WorksheetContext';
import { QueryProvider } from '../../contexts/QueryContext';
import { BrowserRouter } from 'react-router-dom';
import * as worksheetApi from '../../api/worksheet';

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

// Mock API calls
jest.mock('../../api/worksheet', () => ({
  listWorksheets: jest.fn().mockResolvedValue([]),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn().mockResolvedValue([]),
  updateSessionState: jest.fn()
}));

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
  Draggable: ({ children, draggableId }) => children({
    innerRef: jest.fn(),
    draggableProps: {},
    dragHandleProps: {},
    draggableId
  }, {
    isDragging: false
  })
}));

// Test wrapper component
const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <QueryProvider value={{ fetchTracesQuery: jest.fn(), fetchDashboardQuery: jest.fn() }}>
      <WorksheetProvider>
        {children}
      </WorksheetProvider>
    </QueryProvider>
  </BrowserRouter>
);

describe('WorksheetTabManager', () => {
  const mockWorksheets = [
    { id: '1', name: 'Worksheet 1', is_visible: true, tab_order: 0 },
    { id: '2', name: 'Worksheet 2', is_visible: true, tab_order: 1 },
    { id: '3', name: 'Worksheet 3', is_visible: true, tab_order: 2 }
  ];

  const defaultProps = {
    worksheets: mockWorksheets,
    activeWorksheetId: '1',
    onWorksheetSelect: jest.fn(),
    onWorksheetCreate: jest.fn(),
    onWorksheetOpen: jest.fn(),
    onWorksheetClose: jest.fn(),
    onWorksheetRename: jest.fn(),
    onWorksheetReorder: jest.fn(),
    isLoading: false
  };

  const renderComponent = (props = {}) => {
    return render(
      <TestWrapper>
        <WorksheetTabManager {...defaultProps} {...props} />
      </TestWrapper>
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    worksheetApi.listWorksheets.mockResolvedValue(mockWorksheets);
    await act(async () => {
      await worksheetApi.listWorksheets();
    });
  });

  it('renders all worksheets', () => {
    renderComponent();
    mockWorksheets.forEach(worksheet => {
      expect(screen.getByTestId(`worksheet-tab-${worksheet.id}`)).toBeInTheDocument();
    });
  });

  it('renders worksheet actions', () => {
    renderComponent();
    expect(screen.getByTestId('worksheet-actions')).toBeInTheDocument();
  });

  it('calls onWorksheetSelect when a tab is clicked', async () => {
    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId('select-tab-2'));
    });
    expect(defaultProps.onWorksheetSelect).toHaveBeenCalledWith('2');
  });

  it('calls onWorksheetClose when a tab is closed', async () => {
    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId('close-tab-2'));
    });
    expect(defaultProps.onWorksheetClose).toHaveBeenCalledWith('2');
  });

  it('calls onWorksheetCreate when create button is clicked', async () => {
    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId('create-worksheet'));
    });
    expect(defaultProps.onWorksheetCreate).toHaveBeenCalled();
  });

  it('calls onWorksheetOpen when open button is clicked', async () => {
    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-worksheet'));
    });
    expect(defaultProps.onWorksheetOpen).toHaveBeenCalled();
  });
});