/**
 * Select — the brand-skinned react-select wrapper that replaced every native
 * `<select>`. These tests pin the wrapper's contract: bare-value onChange,
 * controlled value, placeholder/disabled, isMulti, isSearchable, the
 * children-as-<option> compat shim, and custom renderOption. Interactions use
 * `react-select-event` (a dev dep) since react-select renders its menu/options
 * only when open.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import selectEvent from 'react-select-event';
import Select from './Select';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Select', () => {
  test('renders the selected value from a primitive `value`', () => {
    render(<Select value="b" options={OPTIONS} onChange={() => {}} data-testid="fruit" />);
    expect(screen.getByTestId('fruit')).toHaveTextContent('Banana');
  });

  test('shows the placeholder when no value is selected', () => {
    render(
      <Select value="" options={OPTIONS} onChange={() => {}} placeholder="Pick one…" data-testid="fruit" />
    );
    expect(screen.getByText('Pick one…')).toBeInTheDocument();
  });

  test('onChange receives the BARE value, not an event', async () => {
    const onChange = jest.fn();
    render(
      <Select value="a" options={OPTIONS} onChange={onChange} aria-label="fruit" data-testid="fruit" />
    );
    await selectEvent.select(screen.getByLabelText('fruit'), 'Cherry');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  test('disabled prevents opening the menu', async () => {
    const onChange = jest.fn();
    render(
      <Select
        value="a"
        options={OPTIONS}
        onChange={onChange}
        disabled
        aria-label="fruit"
        data-testid="fruit"
      />
    );
    // A disabled react-select renders the input as disabled.
    const input = screen.getByLabelText('fruit');
    expect(input).toBeDisabled();
  });

  test('isMulti renders an array value and reports an array of bare values', async () => {
    const onChange = jest.fn();
    render(
      <Select
        isMulti
        value={['a']}
        options={OPTIONS}
        onChange={onChange}
        aria-label="fruits"
        data-testid="fruits"
      />
    );
    expect(screen.getByTestId('fruits')).toHaveTextContent('Apple');
    await selectEvent.select(screen.getByLabelText('fruits'), 'Banana');
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  test('isSearchable defaults to false (input is not editable)', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} aria-label="fruit" />);
    // react-select renders a non-searchable combobox as an aria-readonly dummy input.
    expect(screen.getByLabelText('fruit')).toHaveAttribute('aria-readonly', 'true');
  });

  test('isSearchable={true} makes the input editable', () => {
    render(
      <Select value="a" options={OPTIONS} onChange={() => {}} isSearchable aria-label="fruit" />
    );
    const input = screen.getByLabelText('fruit');
    expect(input).not.toHaveAttribute('aria-readonly', 'true');
    expect(input).toHaveAttribute('type', 'text');
  });

  test('children-as-<option> compat shim is parsed into options', async () => {
    const onChange = jest.fn();
    render(
      <Select value="x" onChange={onChange} aria-label="shim" data-testid="shim">
        <option value="x">X-ray</option>
        <option value="y">Yankee</option>
      </Select>
    );
    expect(screen.getByTestId('shim')).toHaveTextContent('X-ray');
    await selectEvent.select(screen.getByLabelText('shim'), 'Yankee');
    expect(onChange).toHaveBeenCalledWith('y');
  });

  test('children <optgroup> compat shim produces grouped options', async () => {
    const onChange = jest.fn();
    render(
      <Select value="" onChange={onChange} aria-label="grouped" data-testid="grouped">
        <option value="">Select…</option>
        <optgroup label="Fruits">
          <option value="apple">Apple</option>
        </optgroup>
        <optgroup label="Veggies">
          <option value="carrot">Carrot</option>
        </optgroup>
      </Select>
    );
    selectEvent.openMenu(screen.getByLabelText('grouped'));
    expect(screen.getByText('Fruits')).toBeInTheDocument();
    expect(screen.getByText('Veggies')).toBeInTheDocument();
    await selectEvent.select(screen.getByLabelText('grouped'), 'Carrot');
    expect(onChange).toHaveBeenCalledWith('carrot');
  });

  test('renderOption customizes the option rendering', () => {
    const renderOption = opt => <span data-testid={`opt-${opt.value}`}>★ {opt.label}</span>;
    render(
      <Select
        value="a"
        options={OPTIONS}
        onChange={() => {}}
        renderOption={renderOption}
        aria-label="fruit"
        data-testid="fruit"
      />
    );
    // The selected value also runs through formatOptionLabel.
    expect(screen.getByTestId('opt-a')).toHaveTextContent('★ Apple');
  });

  test('type-carrying options render a type-colored FieldPill by default', () => {
    const typed = [{ value: 'orders', label: 'orders', type: 'model' }];
    render(<Select value="orders" options={typed} onChange={() => {}} data-testid="typed" />);
    // FieldPill renders the label text; presence confirms the default renderer ran.
    expect(screen.getByTestId('typed')).toHaveTextContent('orders');
  });

  test('the open menu is real, queryable DOM (not a native <select> popup)', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} aria-label="fruit" />);
    selectEvent.openMenu(screen.getByLabelText('fruit'));
    expect(screen.getByText('Cherry')).toBeInTheDocument();
    // No native <select> element exists in the wrapper.
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector('select')).toBeNull();
  });
});
