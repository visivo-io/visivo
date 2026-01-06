import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BooleanField } from './BooleanField';

describe('BooleanField', () => {
  const defaultProps = {
    value: null,
    onChange: jest.fn(),
    schema: { type: 'boolean' },
    label: 'Test Boolean',
    description: 'Toggle this value',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<BooleanField {...defaultProps} />);
    expect(screen.getByText('Test Boolean')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<BooleanField {...defaultProps} />);
    expect(screen.getByText('Toggle this value')).toBeInTheDocument();
  });

  it('renders True and False buttons', () => {
    render(<BooleanField {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'true' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'false' })).toBeInTheDocument();
  });

  it('shows True selected when value is true', () => {
    render(<BooleanField {...defaultProps} value={true} />);
    const trueButton = screen.getByRole('button', { name: 'true' });
    expect(trueButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows False selected when value is false', () => {
    render(<BooleanField {...defaultProps} value={false} />);
    const falseButton = screen.getByRole('button', { name: 'false' });
    expect(falseButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows neither selected when value is undefined', () => {
    render(<BooleanField {...defaultProps} value={undefined} />);
    const trueButton = screen.getByRole('button', { name: 'true' });
    const falseButton = screen.getByRole('button', { name: 'false' });
    expect(trueButton).toHaveAttribute('aria-pressed', 'false');
    expect(falseButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with true when True clicked', () => {
    const onChange = jest.fn();
    render(<BooleanField {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'true' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when False clicked', () => {
    const onChange = jest.fn();
    render(<BooleanField {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'false' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('can be disabled', () => {
    render(<BooleanField {...defaultProps} disabled={true} />);
    expect(screen.getByRole('button', { name: 'true' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'false' })).toBeDisabled();
  });
});
