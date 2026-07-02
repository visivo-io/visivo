import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
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

  it('normalizes a non-array selectedValues prop to a single chip', () => {
    render(<MultiSelectDropdown options={options} selectedValues="Option B" name="test" />);
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('deselects an already-selected option on click (toggle off)', () => {
    const setInputJobValue = jest.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selectedValues={['Option A', 'Option B']}
        name="test"
        setInputJobValue={setInputJobValue}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Option A/ }));
    // Click the option row inside the menu (not the chip) to toggle it off.
    const menu = screen.getByTestId('portal-dropdown-menu');
    fireEvent.click(within(menu).getByText('Option A'));
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option B']);
  });

  it('removes a chip via its X control and keeps the rest', () => {
    const setInputJobValue = jest.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selectedValues={['Option A', 'Option B']}
        name="test"
        setInputJobValue={setInputJobValue}
      />
    );
    // Chip removers are the tabIndex=-1 role=button controls, rendered in
    // selection order — the first belongs to Option A.
    const chipRemovers = screen.getAllByRole('button').filter(b => b.tabIndex === -1);
    expect(chipRemovers).toHaveLength(2);
    fireEvent.click(chipRemovers[0]);
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option B']);
  });

  it('removes a chip via keyboard (Enter / Space on the chip remover)', () => {
    const setInputJobValue = jest.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selectedValues={['Option A', 'Option B']}
        name="test"
        setInputJobValue={setInputJobValue}
      />
    );
    // Second chip remover (selection order) belongs to Option B.
    const chipRemove = screen.getAllByRole('button').filter(b => b.tabIndex === -1)[1];
    fireEvent.keyDown(chipRemove, { key: 'Enter' });
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option A']);

    setInputJobValue.mockClear();
    fireEvent.keyDown(chipRemove, { key: ' ' });
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option A']);

    setInputJobValue.mockClear();
    fireEvent.keyDown(chipRemove, { key: 'a' });
    expect(setInputJobValue).not.toHaveBeenCalled();
  });

  it('collapses overflow past three chips into a "+N more" summary', () => {
    render(
      <MultiSelectDropdown
        options={['A', 'B', 'C', 'D', 'E']}
        selectedValues={['A', 'B', 'C', 'D', 'E']}
        name="test"
      />
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  it('Select All selects every option; Clear All empties the selection', () => {
    const setInputJobValue = jest.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selectedValues={['Option A']}
        name="test"
        setInputJobValue={setInputJobValue}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Option A/ }));

    fireEvent.click(screen.getByText('Select All'));
    expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option A', 'Option B', 'Option C']);

    fireEvent.click(screen.getByText('Clear All'));
    expect(setInputJobValue).toHaveBeenCalledWith('test', []);
  });

  it('shows "No options found" when the search matches nothing', () => {
    render(<MultiSelectDropdown options={options} name="test" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search options...'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No options found')).toBeInTheDocument();
  });

  it('shows the selection count footer', () => {
    render(<MultiSelectDropdown options={options} selectedValues={['Option A']} name="test" />);
    fireEvent.click(screen.getByRole('button', { name: /Option A/ }));
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
  });

  describe('keyboard interaction', () => {
    it.each(['Enter', ' ', 'ArrowDown'])('opens the menu with "%s" while closed', key => {
      render(<MultiSelectDropdown options={options} name="test" />);
      fireEvent.keyDown(screen.getByRole('button'), { key });
      expect(screen.getByTestId('portal-dropdown-menu')).toBeInTheDocument();
    });

    it('does not open on unrelated keys while closed', () => {
      render(<MultiSelectDropdown options={options} name="test" />);
      fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });
      expect(screen.queryByTestId('portal-dropdown-menu')).not.toBeInTheDocument();
    });

    it('Escape closes the open menu', () => {
      render(<MultiSelectDropdown options={options} name="test" />);
      fireEvent.click(screen.getByRole('button'));
      fireEvent.keyDown(screen.getByPlaceholderText('Search options...'), { key: 'Escape' });
      expect(screen.queryByTestId('portal-dropdown-menu')).not.toBeInTheDocument();
    });

    it('ArrowDown highlights the next option and Enter toggles it', () => {
      const setInputJobValue = jest.fn();
      render(
        <MultiSelectDropdown options={options} name="test" setInputJobValue={setInputJobValue} />
      );
      fireEvent.click(screen.getByRole('button'));
      const search = screen.getByPlaceholderText('Search options...');
      fireEvent.keyDown(search, { key: 'ArrowDown' });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option A']);
    });

    it('ArrowUp from no highlight wraps to the LAST option', () => {
      const setInputJobValue = jest.fn();
      render(
        <MultiSelectDropdown options={options} name="test" setInputJobValue={setInputJobValue} />
      );
      fireEvent.click(screen.getByRole('button'));
      const search = screen.getByPlaceholderText('Search options...');
      fireEvent.keyDown(search, { key: 'ArrowUp' });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(setInputJobValue).toHaveBeenCalledWith('test', ['Option C']);
    });

    it('Enter with nothing highlighted selects nothing; other keys are ignored', () => {
      const setInputJobValue = jest.fn();
      render(
        <MultiSelectDropdown options={options} name="test" setInputJobValue={setInputJobValue} />
      );
      fireEvent.click(screen.getByRole('button'));
      const search = screen.getByPlaceholderText('Search options...');
      fireEvent.keyDown(search, { key: 'Enter' });
      fireEvent.keyDown(search, { key: 'Home' });
      expect(setInputJobValue).not.toHaveBeenCalled();
      expect(screen.getByTestId('portal-dropdown-menu')).toBeInTheDocument();
    });
  });

  it('handles missing setInputJobValue gracefully (no crash on interactions)', () => {
    render(<MultiSelectDropdown options={options} selectedValues={['Option A']} name="test" />);
    fireEvent.click(screen.getByRole('button', { name: /Option A/ }));
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Clear All'));
    expect(screen.getByTestId('portal-dropdown-menu')).toBeInTheDocument();
  });

  it('handles a non-array options prop by rendering an empty option list', () => {
    render(<MultiSelectDropdown options={undefined} name="test" placeholder="Pick..." />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No options found')).toBeInTheDocument();
    expect(screen.getByText('0 of 0 selected')).toBeInTheDocument();
  });
});
