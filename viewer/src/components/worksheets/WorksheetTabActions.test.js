import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTabActions from './WorksheetTabActions';

describe('WorksheetTabActions', () => {
  const defaultProps = {
    onWorksheetCreate: jest.fn(),
    onWorksheetOpen: jest.fn(),
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders create and open buttons', () => {
    render(<WorksheetTabActions {...defaultProps} />);
    expect(screen.getByTestId('create-worksheet')).toBeInTheDocument();
    expect(screen.getByTestId('open-worksheet')).toBeInTheDocument();
  });

  it('calls onWorksheetCreate when create button is clicked', () => {
    render(<WorksheetTabActions {...defaultProps} />);
    fireEvent.click(screen.getByTestId('create-worksheet'));
    expect(defaultProps.onWorksheetCreate).toHaveBeenCalled();
  });

  it('calls onWorksheetOpen when open button is clicked', () => {
    render(<WorksheetTabActions {...defaultProps} />);
    fireEvent.click(screen.getByTestId('open-worksheet'));
    expect(defaultProps.onWorksheetOpen).toHaveBeenCalled();
  });

  it('disables buttons when isLoading is true', () => {
    render(<WorksheetTabActions {...defaultProps} isLoading={true} />);
    expect(screen.getByTestId('create-worksheet')).toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).toBeDisabled();
  });

  it('enables buttons when isLoading is false', () => {
    render(<WorksheetTabActions {...defaultProps} isLoading={false} />);
    expect(screen.getByTestId('create-worksheet')).not.toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).not.toBeDisabled();
  });

  it('applies correct styles to buttons', () => {
    const { container } = render(<WorksheetTabActions {...defaultProps} />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach(button => {
      expect(button).toHaveClass(
        'p-2',
        'rounded-lg',
        'hover:bg-gray-100',
        'disabled:opacity-50',
        'disabled:cursor-not-allowed'
      );
    });
  });
}); 