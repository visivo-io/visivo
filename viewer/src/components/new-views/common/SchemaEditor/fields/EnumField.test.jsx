import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EnumField } from './EnumField';

describe('EnumField', () => {
  const defaultProps = {
    value: null,
    onChange: jest.fn(),
    schema: { enum: ['option1', 'option2', 'option3'] },
    label: 'Test Enum',
    description: 'Select an option',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<EnumField {...defaultProps} />);
    expect(screen.getByLabelText('Test Enum')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<EnumField {...defaultProps} />);
    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('displays current value', () => {
    render(<EnumField {...defaultProps} value="option2" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('option2');
  });

  it('shows all enum options when opened', () => {
    render(<EnumField {...defaultProps} />);

    // Open the select dropdown
    fireEvent.mouseDown(screen.getByRole('combobox'));

    // Check options are present
    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByText('option1')).toBeInTheDocument();
    expect(listbox.getByText('option2')).toBeInTheDocument();
    expect(listbox.getByText('option3')).toBeInTheDocument();
  });

  it('shows None option to clear selection', () => {
    render(<EnumField {...defaultProps} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));

    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByText('None')).toBeInTheDocument();
  });

  it('calls onChange when option selected', () => {
    const onChange = jest.fn();
    render(<EnumField {...defaultProps} onChange={onChange} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('option2'));

    expect(onChange).toHaveBeenCalledWith('option2');
  });

  it('calls onChange with undefined when None selected', () => {
    const onChange = jest.fn();
    render(<EnumField {...defaultProps} value="option1" onChange={onChange} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('None'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('handles const schema (single value enum)', () => {
    render(<EnumField {...defaultProps} schema={{ const: 'scatter' }} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));

    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByText('scatter')).toBeInTheDocument();
  });

  it('handles null value gracefully', () => {
    render(<EnumField {...defaultProps} value={null} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('handles undefined value gracefully', () => {
    render(<EnumField {...defaultProps} value={undefined} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<EnumField {...defaultProps} disabled={true} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('works with oneOf containing query-string', () => {
    const schema = {
      oneOf: [{ $ref: '#/$defs/query-string' }, { enum: ['lines', 'markers', 'lines+markers'] }],
    };
    const defs = { 'query-string': { type: 'string' } };

    render(<EnumField {...defaultProps} schema={schema} defs={defs} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));

    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByText('lines')).toBeInTheDocument();
    expect(listbox.getByText('markers')).toBeInTheDocument();
    expect(listbox.getByText('lines+markers')).toBeInTheDocument();
  });
});
