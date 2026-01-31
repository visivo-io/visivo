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

  it('selects single option and calls setInputJobValue', () => {
    const setInputJobValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputJobValue={setInputJobValue} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Option A'));

    // setInputJobValue should be called with the selected option
    expect(setInputJobValue).toHaveBeenCalledWith('test', 'Option A');
  });

  it('displays selectedValue from props (not managing its own default)', () => {
    render(<Dropdown options={options} selectedValue="Option A" name="test" />);

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('can change selection to a different option', () => {
    const setInputJobValue = jest.fn();
    render(
      <Dropdown
        options={options}
        selectedValue="Option A"
        name="test"
        setInputJobValue={setInputJobValue}
      />
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(screen.getByRole('button'));

    // Select Option B
    fireEvent.click(screen.getByText('Option B'));

    // setInputJobValue should be called with the new selection
    expect(setInputJobValue).toHaveBeenCalledWith('test', 'Option B');
  });

  it('supports keyboard navigation (ArrowDown + Enter)', () => {
    const setInputJobValue = jest.fn();
    render(<Dropdown options={options} name="test" setInputJobValue={setInputJobValue} />);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });

    // setInputJobValue should be called after keyboard selection
    expect(setInputJobValue).toHaveBeenCalledWith('test', 'Option A');
  });

  describe('display-only behavior', () => {
    it('does NOT call setInputJobValue on initial render (display only)', () => {
      // Dropdown should NOT set defaults - that's handled by useInputOptions hook
      const setInputJobValue = jest.fn();

      render(
        <Dropdown
          options={options}
          selectedValue="Option A"
          name="test"
          setInputJobValue={setInputJobValue}
        />
      );

      // setInputJobValue should NOT be called on render (no default setting)
      expect(setInputJobValue).not.toHaveBeenCalled();
    });

    it('calls setInputJobValue ONLY on user selection', () => {
      const setInputJobValue = jest.fn();

      render(<Dropdown options={options} name="test" setInputJobValue={setInputJobValue} />);

      // Initial render - setInputJobValue NOT called
      expect(setInputJobValue).not.toHaveBeenCalled();

      // User selects an option
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Option A'));

      // Now setInputJobValue should be called once
      expect(setInputJobValue).toHaveBeenCalledTimes(1);
      expect(setInputJobValue).toHaveBeenCalledWith('test', 'Option A');
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
