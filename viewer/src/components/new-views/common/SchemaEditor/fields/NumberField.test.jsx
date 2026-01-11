import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  const defaultProps = {
    value: null,
    onChange: jest.fn(),
    schema: { type: 'number' },
    label: 'Test Number',
    description: 'Enter a number',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<NumberField {...defaultProps} />);
    expect(screen.getByLabelText('Test Number')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<NumberField {...defaultProps} />);
    expect(screen.getByText('Enter a number')).toBeInTheDocument();
  });

  it('displays current value', () => {
    render(<NumberField {...defaultProps} value={42} />);
    expect(screen.getByLabelText('Test Number')).toHaveValue(42);
  });

  it('calls onChange with number when value changes', () => {
    const onChange = jest.fn();
    render(<NumberField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Number'), {
      target: { value: '123' },
    });

    expect(onChange).toHaveBeenCalledWith(123);
  });

  it('calls onChange with undefined when cleared', () => {
    const onChange = jest.fn();
    render(<NumberField {...defaultProps} value={42} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Number'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('handles float values', () => {
    const onChange = jest.fn();
    render(<NumberField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Number'), {
      target: { value: '3.14' },
    });

    expect(onChange).toHaveBeenCalledWith(3.14);
  });

  it('parses integer for integer schema', () => {
    const onChange = jest.fn();
    render(
      <NumberField {...defaultProps} schema={{ type: 'integer' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText('Test Number'), {
      target: { value: '42.9' },
    });

    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('applies min/max constraints', () => {
    render(
      <NumberField
        {...defaultProps}
        schema={{ type: 'number', minimum: 0, maximum: 100 }}
      />
    );

    const input = screen.getByLabelText('Test Number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('applies step from multipleOf', () => {
    render(
      <NumberField {...defaultProps} schema={{ type: 'number', multipleOf: 0.5 }} />
    );

    const input = screen.getByLabelText('Test Number');
    expect(input).toHaveAttribute('step', '0.5');
  });

  it('handles null value gracefully', () => {
    render(<NumberField {...defaultProps} value={null} />);
    expect(screen.getByLabelText('Test Number')).toHaveValue(null);
  });

  it('handles undefined value gracefully', () => {
    render(<NumberField {...defaultProps} value={undefined} />);
    expect(screen.getByLabelText('Test Number')).toHaveValue(null);
  });

  it('can be disabled', () => {
    render(<NumberField {...defaultProps} disabled={true} />);
    expect(screen.getByLabelText('Test Number')).toBeDisabled();
  });
});
