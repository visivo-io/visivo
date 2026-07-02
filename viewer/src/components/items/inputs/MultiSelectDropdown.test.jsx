import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import MultiSelectDropdown from './MultiSelectDropdown';

const options = ['Option A', 'Option B', 'Option C'];

describe('MultiSelectDropdown Component', () => {
  it('renders with placeholder when nothing is selected', () => {
    render(<MultiSelectDropdown options={options} placeholder="Select options..." />);
    expect(screen.getByText('Select options...')).toBeInTheDocument();
  });

  it('opens the dropdown when clicked', () => {
    render(<MultiSelectDropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search options...')).toBeInTheDocument();
  });

  // VIS-901 #6: the canvas item slot clips with overflow-hidden, so an in-slot
  // absolute menu was cut off. The menu must portal to <body> like the other
  // dropdown widgets (Dropdown / AutocompleteInput).
  it('portals the options menu to document.body (escapes the slot clip)', () => {
    const { container } = render(<MultiSelectDropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));

    const menu = screen.getByTestId('portal-dropdown-menu');
    expect(document.body).toContainElement(menu);
    // NOT a descendant of the widget's subtree — that's what escapes the
    // slot's overflow-hidden clipping.
    expect(container).not.toContainElement(menu);
    expect(menu).toContainElement(screen.getByPlaceholderText('Search options...'));
  });

  it('does not close when clicking inside the portalled menu', () => {
    render(<MultiSelectDropdown options={options} name="test" />);
    fireEvent.click(screen.getByRole('button'));

    // The menu lives outside the anchor's subtree, so the outside-click handler
    // must treat clicks inside it as inside.
    fireEvent.mouseDown(screen.getByPlaceholderText('Search options...'));
    expect(screen.getByTestId('portal-dropdown-menu')).toBeInTheDocument();

    // A genuine outside click still closes it.
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('portal-dropdown-menu')).not.toBeInTheDocument();
  });

  it('toggles selections and calls setInputJobValue with the value array', () => {
    const setInputJobValue = jest.fn();
    render(<MultiSelectDropdown options={options} name="test" setInputJobValue={setInputJobValue} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Option A'));
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option A']);
    // Multi-select stays open after a selection.
    expect(screen.getByTestId('portal-dropdown-menu')).toBeInTheDocument();
  });

  it('filters options based on search input', () => {
    render(<MultiSelectDropdown options={options} />);
    fireEvent.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search options...');
    fireEvent.change(searchInput, { target: { value: 'Option B' } });

    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.queryByText('Option A')).not.toBeInTheDocument();
  });

  it('displays selected values from props', () => {
    render(<MultiSelectDropdown options={options} selectedValues={['Option A']} name="test" />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });
});
