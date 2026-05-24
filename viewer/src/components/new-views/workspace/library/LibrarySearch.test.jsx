/**
 * LibrarySearch behaviour (VIS-773 / Track C C2).
 *
 * Verifies the debounced input fires onChange after ~250 ms, exposes a
 * clear button when populated, and stays controlled from the parent.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import LibrarySearch from './LibrarySearch';

describe('LibrarySearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('renders the placeholder and search icon by default', () => {
    render(<LibrarySearch sectionKey="charts" value="" onChange={jest.fn()} />);
    const input = screen.getByTestId('library-search-charts');
    expect(input).toHaveAttribute('placeholder', 'Search this section…');
    // No clear button when empty.
    expect(screen.queryByTestId('library-search-charts-clear')).not.toBeInTheDocument();
  });

  test('debounces onChange after typing', () => {
    const onChange = jest.fn();
    render(<LibrarySearch sectionKey="charts" value="" onChange={onChange} />);
    const input = screen.getByTestId('library-search-charts');
    fireEvent.change(input, { target: { value: 'fib' } });
    // Hasn't fired yet (debounce).
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(260);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('fib');
  });

  test('coalesces fast successive keystrokes into a single onChange', () => {
    const onChange = jest.fn();
    render(<LibrarySearch sectionKey="charts" value="" onChange={onChange} />);
    const input = screen.getByTestId('library-search-charts');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.change(input, { target: { value: 'fi' } });
    fireEvent.change(input, { target: { value: 'fib' } });
    act(() => {
      jest.advanceTimersByTime(260);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('fib');
  });

  test('exposes a clear button once populated and resets the input', () => {
    const onChange = jest.fn();
    render(<LibrarySearch sectionKey="charts" value="" onChange={onChange} />);
    const input = screen.getByTestId('library-search-charts');
    fireEvent.change(input, { target: { value: 'fib' } });
    expect(screen.getByTestId('library-search-charts-clear')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('library-search-charts-clear'));
    // Clear fires immediately (no debounce).
    expect(onChange).toHaveBeenCalledWith('');
    expect(input).toHaveValue('');
  });

  test('syncs the local draft when the controlled value changes externally', () => {
    const { rerender } = render(
      <LibrarySearch sectionKey="charts" value="" onChange={jest.fn()} />
    );
    rerender(<LibrarySearch sectionKey="charts" value="reset" onChange={jest.fn()} />);
    expect(screen.getByTestId('library-search-charts')).toHaveValue('reset');
  });
});
