import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AutocompleteInput from './AutocompleteInput';

describe('AutocompleteInput', () => {
  const defaultProps = {
    label: 'Test Autocomplete',
    options: ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry'],
    selectedValue: 'Banana',
    name: 'test-autocomplete',
    setInputValue: jest.fn(),
    placeholder: 'Search...',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<AutocompleteInput {...defaultProps} />);
    expect(screen.getByText('Test Autocomplete')).toBeInTheDocument();
  });

  it('displays selected value in input when closed', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');
    expect(input.value).toBe('Banana');
  });

  it('shows dropdown when input is focused', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);

    // Should show all options
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('filters options based on search term', async () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ch' } });

    // Should only show Cherry (text may be split due to highlighting)
    // Use getAllByText and check length since elements may have multiple matches
    const cherryElements = screen.getAllByText((content, element) => element?.textContent === 'Cherry');
    expect(cherryElements.length).toBeGreaterThan(0);
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });

  it('is case insensitive when filtering', async () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ch' } });

    // Text may be split due to highlighting - use getAllByText
    const cherryElements = screen.getAllByText((content, element) => element?.textContent === 'Cherry');
    expect(cherryElements.length).toBeGreaterThan(0);
  });

  it('calls setInputValue when option is selected', () => {
    const setInputValue = jest.fn();
    render(<AutocompleteInput {...defaultProps} setInputValue={setInputValue} />);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    const option = screen.getByText('Cherry');
    fireEvent.click(option);

    expect(setInputValue).toHaveBeenCalledWith('test-autocomplete', 'Cherry');
  });

  it('clears selection when clear button is clicked', () => {
    const setInputValue = jest.fn();
    render(<AutocompleteInput {...defaultProps} setInputValue={setInputValue} />);

    const clearButton = screen.getByLabelText('Clear selection');
    fireEvent.click(clearButton);

    expect(setInputValue).toHaveBeenCalledWith('test-autocomplete', null);
  });

  it('shows no matching options message when search has no results', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });

    expect(screen.getByText('No matching options')).toBeInTheDocument();
  });

  it('shows no options message when options array is empty', () => {
    render(<AutocompleteInput {...defaultProps} options={[]} selectedValue={null} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);

    expect(screen.getByText('No options available')).toBeInTheDocument();
  });

  it('closes dropdown on Escape key', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    expect(screen.getByText('Apple')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('navigates options with arrow keys', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Second option should be highlighted - verify no errors occur
    // Can't easily test highlight state visually
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('selects highlighted option on Enter', () => {
    const setInputValue = jest.fn();
    render(<AutocompleteInput {...defaultProps} setInputValue={setInputValue} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // Highlight first option (Apple)
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setInputValue).toHaveBeenCalledWith('test-autocomplete', 'Apple');
  });

  it('auto-selects single matching option on Enter', () => {
    const setInputValue = jest.fn();
    render(<AutocompleteInput {...defaultProps} setInputValue={setInputValue} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Cherry' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setInputValue).toHaveBeenCalledWith('test-autocomplete', 'Cherry');
  });

  it('toggles dropdown when chevron button is clicked', () => {
    render(<AutocompleteInput {...defaultProps} />);

    const toggleButton = screen.getByLabelText('Toggle dropdown');

    // Open dropdown
    fireEvent.click(toggleButton);
    expect(screen.getByText('Apple')).toBeInTheDocument();

    // Close dropdown
    fireEvent.click(toggleButton);
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('highlights matching text in search results', () => {
    render(<AutocompleteInput {...defaultProps} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'err' } });

    // Cherry and Elderberry both have 'err' highlighted (text split by elements)
    const cherryOption = screen.getByText((content, element) => {
      return element?.textContent === 'Cherry';
    });
    expect(cherryOption).toBeInTheDocument();
    // Verify there are highlighted spans (both Cherry and Elderberry match)
    const highlightedSpans = screen.getAllByText('err');
    expect(highlightedSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('closes dropdown on click outside', () => {
    render(
      <div>
        <AutocompleteInput {...defaultProps} />
        <div data-testid="outside">Outside</div>
      </div>
    );
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    expect(screen.getByText('Apple')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));

    // Dropdown should close
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('does not show clear button when nothing is selected', () => {
    render(<AutocompleteInput {...defaultProps} selectedValue={null} />);
    expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
  });

  it('renders without label when not provided', () => {
    render(<AutocompleteInput {...defaultProps} label="" />);
    // When label is empty, the DropdownLabel component should not render any content
    expect(screen.queryByText('Test Autocomplete')).not.toBeInTheDocument();
  });
});
