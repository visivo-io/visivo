import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrayField } from './ArrayField';

describe('ArrayField', () => {
  const defaultProps = {
    value: [],
    onChange: jest.fn(),
    schema: { type: 'array', items: { type: 'string' } },
    label: 'Test Array',
    description: 'A list of items',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<ArrayField {...defaultProps} />);
    expect(screen.getByText('Test Array')).toBeInTheDocument();
  });

  it('renders with description as helper text', () => {
    render(<ArrayField {...defaultProps} />);
    expect(screen.getByText('A list of items')).toBeInTheDocument();
  });

  it('shows empty state message when no items', () => {
    render(<ArrayField {...defaultProps} />);
    expect(screen.getByText(/No items/)).toBeInTheDocument();
  });

  it('renders Add button', () => {
    render(<ArrayField {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });

  it('adds item when Add clicked', () => {
    const onChange = jest.fn();
    render(<ArrayField {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add/i }));

    expect(onChange).toHaveBeenCalledWith(['']);
  });

  it('renders existing items', () => {
    render(<ArrayField {...defaultProps} value={['item1', 'item2']} />);

    expect(screen.getByLabelText('Item 1')).toHaveValue('item1');
    expect(screen.getByLabelText('Item 2')).toHaveValue('item2');
  });

  it('removes item when delete clicked', () => {
    const onChange = jest.fn();
    render(<ArrayField {...defaultProps} value={['item1', 'item2']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Remove item 1/i }));

    expect(onChange).toHaveBeenCalledWith(['item2']);
  });

  it('calls onChange with undefined when last item removed', () => {
    const onChange = jest.fn();
    render(<ArrayField {...defaultProps} value={['item1']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Remove item 1/i }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('updates item when changed', () => {
    const onChange = jest.fn();
    render(<ArrayField {...defaultProps} value={['old']} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Item 1'), {
      target: { value: 'new' },
    });

    expect(onChange).toHaveBeenCalledWith(['new']);
  });

  it('handles null value gracefully', () => {
    render(<ArrayField {...defaultProps} value={null} />);
    expect(screen.getByText(/No items/)).toBeInTheDocument();
  });

  it('handles undefined value gracefully', () => {
    render(<ArrayField {...defaultProps} value={undefined} />);
    expect(screen.getByText(/No items/)).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<ArrayField {...defaultProps} value={['item1']} disabled={true} />);
    expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove item 1/i })).toBeDisabled();
  });

  it('renders number items for number schema', () => {
    const schema = { type: 'array', items: { type: 'number' } };
    render(<ArrayField {...defaultProps} schema={schema} value={[1, 2, 3]} />);

    expect(screen.getByLabelText('Item 1')).toHaveValue(1);
    expect(screen.getByLabelText('Item 2')).toHaveValue(2);
    expect(screen.getByLabelText('Item 3')).toHaveValue(3);
  });
});
