import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorField } from './ColorField';

describe('ColorField', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    schema: { $ref: '#/$defs/color' },
    label: 'Test Color',
    description: 'Pick a color',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<ColorField {...defaultProps} />);
    expect(screen.getByLabelText('Test Color')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<ColorField {...defaultProps} />);
    expect(screen.getByText('Pick a color')).toBeInTheDocument();
  });

  it('displays current hex value', () => {
    render(<ColorField {...defaultProps} value="#ff0000" />);
    expect(screen.getByLabelText('Test Color')).toHaveValue('#ff0000');
  });

  it('renders color swatch', () => {
    render(<ColorField {...defaultProps} value="#ff0000" />);
    const swatch = screen.getByTestId('color-swatch');
    expect(swatch).toBeInTheDocument();
    expect(swatch).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('calls onChange with valid hex color', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: '#00ff00' },
    });

    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  it('calls onChange with undefined when cleared', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} value="#ff0000" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('does not call onChange for invalid color while typing', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    // Type partial hex (not valid yet)
    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: '#ff' },
    });

    // Should not call onChange since it's not a valid color
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts named colors', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: 'red' },
    });

    expect(onChange).toHaveBeenCalledWith('red');
  });

  it('accepts rgb format', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: 'rgb(255, 0, 0)' },
    });

    expect(onChange).toHaveBeenCalledWith('rgb(255, 0, 0)');
  });

  it('accepts rgba format', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Color'), {
      target: { value: 'rgba(255, 0, 0, 0.5)' },
    });

    expect(onChange).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)');
  });

  it('opens color picker on swatch click', () => {
    render(<ColorField {...defaultProps} value="#ff0000" />);

    fireEvent.click(screen.getByTestId('color-swatch'));

    expect(screen.getByTestId('color-picker')).toBeInTheDocument();
  });

  it('updates from color picker', () => {
    const onChange = jest.fn();
    render(<ColorField {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('color-swatch'));
    fireEvent.change(screen.getByTestId('color-picker'), {
      target: { value: '#0000ff' },
    });

    expect(onChange).toHaveBeenCalledWith('#0000ff');
  });

  it('handles null value gracefully', () => {
    render(<ColorField {...defaultProps} value={null} />);
    expect(screen.getByLabelText('Test Color')).toHaveValue('');
  });

  it('handles undefined value gracefully', () => {
    render(<ColorField {...defaultProps} value={undefined} />);
    expect(screen.getByLabelText('Test Color')).toHaveValue('');
  });

  it('can be disabled', () => {
    render(<ColorField {...defaultProps} disabled={true} />);
    expect(screen.getByLabelText('Test Color')).toBeDisabled();
  });

  it('does not open picker when disabled', () => {
    render(<ColorField {...defaultProps} disabled={true} />);

    const picker = screen.getByTestId('color-picker');
    const initialValue = picker.value;

    // Click the swatch - should not trigger the picker
    fireEvent.click(screen.getByTestId('color-swatch'));

    // The picker value should not have changed (it wasn't activated)
    expect(picker.value).toBe(initialValue);
    // The picker should have pointerEvents: none
    expect(picker).toHaveStyle({ pointerEvents: 'none' });
  });
});
