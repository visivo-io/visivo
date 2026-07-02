import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StringField } from './StringField';

describe('StringField', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    schema: { type: 'string' },
    label: 'Test Label',
    description: 'Test description',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<StringField {...defaultProps} />);
    expect(screen.getByLabelText('Test Label')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<StringField {...defaultProps} />);
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('displays current value', () => {
    render(<StringField {...defaultProps} value="hello world" />);
    expect(screen.getByLabelText('Test Label')).toHaveValue('hello world');
  });

  it('calls onChange when value changes', () => {
    const onChange = jest.fn();
    render(<StringField {...defaultProps} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Label'), {
      target: { value: 'new value' },
    });

    expect(onChange).toHaveBeenCalledWith('new value');
  });

  it('calls onChange with undefined when cleared', () => {
    const onChange = jest.fn();
    render(<StringField {...defaultProps} value="existing" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Test Label'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('handles null value gracefully', () => {
    render(<StringField {...defaultProps} value={null} />);
    expect(screen.getByLabelText('Test Label')).toHaveValue('');
  });

  it('handles undefined value gracefully', () => {
    render(<StringField {...defaultProps} value={undefined} />);
    expect(screen.getByLabelText('Test Label')).toHaveValue('');
  });

  it('can be disabled', () => {
    render(<StringField {...defaultProps} disabled={true} />);
    expect(screen.getByLabelText('Test Label')).toBeDisabled();
  });

  it('shows placeholder from schema default', () => {
    render(
      <StringField {...defaultProps} schema={{ type: 'string', default: 'default value' }} />
    );
    expect(screen.getByLabelText('Test Label')).toHaveAttribute('placeholder', 'default value');
  });
});
