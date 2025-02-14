import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTab from './WorksheetTab';
import { Draggable } from 'react-beautiful-dnd';

// Mock react-beautiful-dnd
jest.mock('react-beautiful-dnd', () => ({
  Draggable: ({ children, isDragDisabled }) => {
    return children({
      draggableProps: {},
      dragHandleProps: {},
      innerRef: jest.fn()
    }, {
      isDragging: false
    });
  }
}));

describe('WorksheetTab', () => {
  const defaultProps = {
    worksheet: {
      id: '1',
      name: 'Test Worksheet'
    },
    index: 0,
    isActive: false,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    onRename: jest.fn(),
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders worksheet name', () => {
    render(<WorksheetTab {...defaultProps} />);
    expect(screen.getByText('Test Worksheet')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.click(screen.getByTestId(`tab-text-${defaultProps.worksheet.id}`));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(defaultProps.worksheet.id);
  });

  it('calls onClose when close button is clicked', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.click(screen.getByTestId(`close-tab-${defaultProps.worksheet.id}`));
    expect(defaultProps.onClose).toHaveBeenCalledWith(defaultProps.worksheet.id);
  });

  it('applies correct styles when active', () => {
    render(<WorksheetTab {...defaultProps} isActive={true} />);
    const tab = screen.getByTestId(`worksheet-tab-${defaultProps.worksheet.id}`).firstChild;
    expect(tab.className).toContain('text-gray-900');
    expect(tab.className).toContain('bg-white');
    expect(tab.className).toContain('border-t');
  });

  it('applies correct styles when inactive', () => {
    render(<WorksheetTab {...defaultProps} isActive={false} />);
    const tab = screen.getByTestId(`worksheet-tab-${defaultProps.worksheet.id}`).firstChild;
    expect(tab.className).toContain('text-gray-500');
  });

  it('enters edit mode on double click', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.doubleClick(screen.getByTestId(`tab-text-${defaultProps.worksheet.id}`));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onRename when editing is complete', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.doubleClick(screen.getByTestId(`tab-text-${defaultProps.worksheet.id}`));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.blur(input);
    expect(defaultProps.onRename).toHaveBeenCalledWith(defaultProps.worksheet.id, 'New Name');
  });

  it('cancels editing on escape key', () => {
    render(<WorksheetTab {...defaultProps} />);
    fireEvent.doubleClick(screen.getByTestId(`tab-text-${defaultProps.worksheet.id}`));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });
}); 