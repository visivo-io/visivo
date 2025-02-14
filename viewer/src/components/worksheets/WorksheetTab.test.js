import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTab from './WorksheetTab';

const mockDraggable = jest.fn();
jest.mock('react-beautiful-dnd', () => ({
  Draggable: ({ draggableId, index, isDragDisabled, children }) => {
    mockDraggable({ draggableId, index, isDragDisabled });
    return children({
      draggableProps: { style: {} },
      dragHandleProps: {},
      innerRef: () => {},
    }, {
      isDragging: false,
      draggingOver: null
    });
  },
}));

describe('WorksheetTab', () => {
  const defaultProps = {
    worksheet: { id: 1, name: 'Test Worksheet' },
    index: 0,
    isActive: false,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders worksheet name', () => {
    render(<WorksheetTab {...defaultProps} />);
    expect(screen.getByText('Test Worksheet')).toBeInTheDocument();
  });

  it('applies active styles when isActive is true', () => {
    const { container } = render(<WorksheetTab {...defaultProps} isActive={true} />);
    const tabComponent = container.querySelector('.active-tab');
    expect(tabComponent).toBeInTheDocument();
  });

  it('applies inactive styles when isActive is false', () => {
    const { container } = render(<WorksheetTab {...defaultProps} isActive={false} />);
    const tabComponent = container.querySelector('.inactive-tab');
    expect(tabComponent).toBeInTheDocument();
  });

  it('calls onSelect when tab is clicked', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('worksheet-tab-1'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(1);
  });

  it('calls onClose when close button is clicked', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-tab-1'));
    expect(defaultProps.onClose).toHaveBeenCalledWith(1);
  });

  it('disables drag when isLoading is true', () => {
    render(<WorksheetTab {...defaultProps} isLoading={true} />);
    expect(mockDraggable).toHaveBeenCalledWith(
      expect.objectContaining({
        isDragDisabled: true
      })
    );
  });

  it('enables drag when isLoading is false', () => {
    render(<WorksheetTab {...defaultProps} isLoading={false} />);
    expect(mockDraggable).toHaveBeenCalledWith(
      expect.objectContaining({
        isDragDisabled: false
      })
    );
  });

  it('truncates long worksheet names', () => {
    const longName = 'A'.repeat(50);
    render(
      <WorksheetTab
        {...defaultProps}
        worksheet={{ ...defaultProps.worksheet, name: longName }}
      />
    );
    const tabText = screen.getByTestId('tab-text-1');
    expect(tabText).toHaveStyle({ maxWidth: '200px' });
  });
}); 