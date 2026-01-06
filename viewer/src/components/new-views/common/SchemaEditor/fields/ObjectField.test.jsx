import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObjectField } from './ObjectField';

describe('ObjectField', () => {
  const defaultProps = {
    value: {},
    onChange: jest.fn(),
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
        age: { type: 'number', description: 'The age' },
      },
    },
    defs: {},
    label: 'Test Object',
    description: 'An object with properties',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByText('Test Object')).toBeInTheDocument();
  });

  it('renders expand/collapse button', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });

  it('is collapsed by default', () => {
    render(<ObjectField {...defaultProps} />);
    // Should show expand button (not collapse)
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collapse/i })).not.toBeInTheDocument();
  });

  it('expands when header clicked', () => {
    render(<ObjectField {...defaultProps} />);

    // Click to expand
    fireEvent.click(screen.getByText('Test Object'));

    // Now properties should be visible
    expect(screen.getByLabelText('name')).toBeInTheDocument();
    expect(screen.getByLabelText('age')).toBeInTheDocument();
  });

  it('shows collapse button when expanded', () => {
    render(<ObjectField {...defaultProps} defaultExpanded={true} />);
    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
  });

  it('renders with defaultExpanded=true', () => {
    render(<ObjectField {...defaultProps} defaultExpanded={true} />);
    expect(screen.getByLabelText('name')).toBeInTheDocument();
    expect(screen.getByLabelText('age')).toBeInTheDocument();
  });

  it('displays current values', () => {
    render(
      <ObjectField {...defaultProps} value={{ name: 'John', age: 30 }} defaultExpanded={true} />
    );

    expect(screen.getByLabelText('name')).toHaveValue('John');
    expect(screen.getByLabelText('age')).toHaveValue(30);
  });

  it('calls onChange when property changed', () => {
    const onChange = jest.fn();
    render(<ObjectField {...defaultProps} onChange={onChange} defaultExpanded={true} />);

    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Jane' },
    });

    expect(onChange).toHaveBeenCalledWith({ name: 'Jane' });
  });

  it('preserves existing values when changing one', () => {
    const onChange = jest.fn();
    render(
      <ObjectField
        {...defaultProps}
        value={{ name: 'John', age: 30 }}
        onChange={onChange}
        defaultExpanded={true}
      />
    );

    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Jane' },
    });

    expect(onChange).toHaveBeenCalledWith({ name: 'Jane', age: 30 });
  });

  it('removes property when set to undefined', () => {
    const onChange = jest.fn();
    render(
      <ObjectField
        {...defaultProps}
        value={{ name: 'John', age: 30 }}
        onChange={onChange}
        defaultExpanded={true}
      />
    );

    // Clear the name field
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith({ age: 30 });
  });

  it('calls onChange with undefined when object becomes empty', () => {
    const onChange = jest.fn();
    render(
      <ObjectField
        {...defaultProps}
        value={{ name: 'John' }}
        onChange={onChange}
        defaultExpanded={true}
      />
    );

    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('handles null value gracefully', () => {
    render(<ObjectField {...defaultProps} value={null} defaultExpanded={true} />);
    expect(screen.getByLabelText('name')).toHaveValue('');
  });

  it('handles undefined value gracefully', () => {
    render(<ObjectField {...defaultProps} value={undefined} defaultExpanded={true} />);
    expect(screen.getByLabelText('name')).toHaveValue('');
  });

  it('shows message for empty properties', () => {
    render(
      <ObjectField
        {...defaultProps}
        schema={{ type: 'object', properties: {} }}
        defaultExpanded={true}
      />
    );
    expect(screen.getByText(/No properties defined/)).toBeInTheDocument();
  });

  it('renders description as helper text', () => {
    render(<ObjectField {...defaultProps} />);
    expect(screen.getByText('An object with properties')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<ObjectField {...defaultProps} disabled={true} defaultExpanded={true} />);
    expect(screen.getByLabelText('name')).toBeDisabled();
    expect(screen.getByLabelText('age')).toBeDisabled();
  });
});
