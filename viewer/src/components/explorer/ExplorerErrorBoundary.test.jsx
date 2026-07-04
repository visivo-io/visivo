import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerErrorBoundary from './ExplorerErrorBoundary';

const ThrowingComponent = ({ shouldThrow }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div data-testid="child">OK</div>;
};

describe('ExplorerErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ExplorerErrorBoundary>
        <div data-testid="child">Hello</div>
      </ExplorerErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('shows fallback UI when child throws during render', () => {
    render(
      <ExplorerErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ExplorerErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('shows custom fallback message when fallback prop is provided', () => {
    render(
      <ExplorerErrorBoundary fallback="Custom error message">
        <ThrowingComponent shouldThrow={true} />
      </ExplorerErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('retry button re-renders children after error', () => {
    const { rerender } = render(
      <ExplorerErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ExplorerErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();

    // Rerender with non-throwing child so that after retry the child renders successfully
    rerender(
      <ExplorerErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ExplorerErrorBoundary>
    );

    // Click retry to reset error state
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('calls onRetry callback when retry button is clicked', () => {
    const mockOnRetry = jest.fn();

    render(
      <ExplorerErrorBoundary onRetry={mockOnRetry}>
        <ThrowingComponent shouldThrow={true} />
      </ExplorerErrorBoundary>
    );

    fireEvent.click(screen.getByText('Retry'));

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('logs error to console.error via componentDidCatch', () => {
    render(
      <ExplorerErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ExplorerErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
    const calls = console.error.mock.calls;
    const boundaryCall = calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('ExplorerErrorBoundary caught:')
    );
    expect(boundaryCall).toBeTruthy();
  });
});
