import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Dropdown from './Dropdown';

const options = ['Option A', 'Option B', 'Option C'];

describe('Dropdown Component', () => {
  it('renders with placeholder when no value is selected', () => {
    render(<Dropdown options={options} placeholder="Select..." />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('opens dropdown when clicked', () => {
    render(<Dropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();
  });

  it('filters options based on search input', () => {
    render(<Dropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search options...');
    fireEvent.change(searchInput, { target: { value: 'Option B' } });

    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
  });

  it('selects single option and calls setInputValue', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputValue={setInputValue} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Option A'));

    // setInputValue should be called with the selected option
    expect(setInputValue).toHaveBeenCalledWith('test', 'Option A');
  });

  it('displays selectedValue from props (not managing its own default)', () => {
    render(<Dropdown options={options} selectedValue="Option A" name="test" />);

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('can change selection to a different option', () => {
    const setInputValue = jest.fn();
    render(
      <Dropdown
        options={options}
        selectedValue="Option A"
        name="test"
        setInputValue={setInputValue}
      />
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(screen.getByRole('button'));

    // Select Option B
    fireEvent.click(screen.getByText('Option B'));

    // setInputValue should be called with the new selection
    expect(setInputValue).toHaveBeenCalledWith('test', 'Option B');
  });

  it('supports keyboard navigation (ArrowDown + Enter)', () => {
    const setInputValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputValue={setInputValue} />);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });

    // setInputValue should be called after keyboard selection
    expect(setInputValue).toHaveBeenCalledWith('test', 'Option A');
  });

  describe('display-only behavior', () => {
    it('does NOT call setInputValue on initial render (display only)', () => {
      // Dropdown should NOT set defaults - that's handled by useInputOptions hook
      const setInputValue = jest.fn();

      render(
        <Dropdown
          options={options}
          selectedValue="Option A"
          name="test"
          setInputValue={setInputValue}
        />
      );

      // setInputValue should NOT be called on render (no default setting)
      expect(setInputValue).not.toHaveBeenCalled();
    });

    it('calls setInputValue ONLY on user selection', () => {
      const setInputValue = jest.fn();

      render(<Dropdown options={options} name="test" setInputValue={setInputValue} />);

      // Initial render - setInputValue NOT called
      expect(setInputValue).not.toHaveBeenCalled();

      // User selects an option
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Option A'));

      // Now setInputValue should be called once
      expect(setInputValue).toHaveBeenCalledTimes(1);
      expect(setInputValue).toHaveBeenCalledWith('test', 'Option A');
    });

    it('re-renders correctly when selectedValue prop changes', () => {
      const { rerender } = render(
        <Dropdown options={options} selectedValue="Option A" name="test" />
      );

      expect(screen.getByText('Option A')).toBeInTheDocument();

      // Simulate store update (parent passes new selectedValue)
      rerender(<Dropdown options={options} selectedValue="Option B" name="test" />);

      expect(screen.getByText('Option B')).toBeInTheDocument();
    });
  });
});
