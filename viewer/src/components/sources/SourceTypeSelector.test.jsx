import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SourceTypeSelector, { SOURCE_TYPES } from './SourceTypeSelector';

const openMenu = () => {
  const combo = within(screen.getByTestId('source-type-select')).getByRole('combobox');
  fireEvent.mouseDown(combo);
  return combo;
};

describe('SourceTypeSelector', () => {
  it('renders the floating "Source Type" label and placeholder', () => {
    render(<SourceTypeSelector value="" onChange={jest.fn()} />);
    expect(screen.getByText('Source Type')).toBeInTheDocument();
    expect(screen.getByText('Select source type...')).toBeInTheDocument();
  });

  it('lists every supported source type when opened', () => {
    render(<SourceTypeSelector value="" onChange={jest.fn()} />);
    openMenu();
    const optionLabels = screen.getAllByRole('option').map(o => o.textContent);
    SOURCE_TYPES.forEach(({ label }) => {
      expect(optionLabels).toContain(label);
    });
  });

  it('calls onChange with the bare type value when an option is picked', () => {
    const onChange = jest.fn();
    render(<SourceTypeSelector value="" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === 'PostgreSQL'));
    expect(onChange).toHaveBeenCalledWith('postgresql');
  });

  it('shows the label of the currently selected value', () => {
    render(<SourceTypeSelector value="snowflake" onChange={jest.fn()} />);
    expect(screen.getByText('Snowflake')).toBeInTheDocument();
  });

  it('disables the underlying combobox when disabled', () => {
    render(<SourceTypeSelector value="duckdb" onChange={jest.fn()} disabled />);
    const combo = within(screen.getByTestId('source-type-select')).getByRole('combobox');
    expect(combo).toBeDisabled();
  });
});
