/**
 * TypeSelector tests (VIS-1020)
 *
 * A thin controlled wrapper over `common/Select.jsx`, populated from CHART_TYPES.
 * The on-brand Select is mocked to a native <select> so we can assert the wiring
 * (value binding, options, bare-value onChange, disabled) deterministically.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TypeSelector from './TypeSelector';
import { CHART_TYPES } from '../../../schemas/schemas';

// Mock the on-brand Select to a native <select> that emits a BARE value (matching
// the real Select's onChange(value) contract).
jest.mock('../../common/Select', () => ({
  __esModule: true,
  default: ({ value, options, onChange, disabled, 'data-testid': dataTestId }) => (
    <select
      data-testid={dataTestId}
      value={value || ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    >
      {(options || []).map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

describe('TypeSelector', () => {
  test('renders the current type as the selected value', () => {
    render(<TypeSelector value="scatter" onChange={() => {}} />);
    const select = screen.getByTestId('type-selector');
    expect(select).toHaveValue('scatter');
  });

  test('lists CHART_TYPES options (and excludes the layout container)', () => {
    render(<TypeSelector value="scatter" onChange={() => {}} />);
    const select = screen.getByTestId('type-selector');
    const optionValues = within(select)
      .getAllByRole('option')
      .map(o => o.value);
    expect(optionValues).toContain('scatter');
    expect(optionValues).toContain('bar');
    expect(optionValues).not.toContain('layout');
    // Every non-layout chart type is offered.
    const expected = CHART_TYPES.filter(t => t.value !== 'layout').map(t => t.value);
    expect(optionValues.sort()).toEqual(expected.sort());
  });

  test('calls onChange with the bare new type on change', () => {
    const onChange = jest.fn();
    render(<TypeSelector value="scatter" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('type-selector'), { target: { value: 'bar' } });
    expect(onChange).toHaveBeenCalledWith('bar');
  });

  test('honors disabled', () => {
    render(<TypeSelector value="scatter" onChange={() => {}} disabled />);
    expect(screen.getByTestId('type-selector')).toBeDisabled();
  });
});
