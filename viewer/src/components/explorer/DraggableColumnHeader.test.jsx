import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DraggableColumnHeader from './DraggableColumnHeader';

// Mock @dnd-kit/core
jest.mock('@dnd-kit/core', () => ({
  useDraggable: ({ id, data }) => ({
    attributes: { 'data-draggable-id': id },
    listeners: {},
    setNodeRef: jest.fn(),
    isDragging: false,
  }),
}));

// Mock DataTableHeader
jest.mock('../common/DataTableHeader', () => {
  return function MockDataTableHeader({ column }) {
    return <div data-testid="data-table-header">{column.name}</div>;
  };
});

describe('DraggableColumnHeader', () => {
  const mockColumn = { name: 'order_id', normalizedType: 'number' };

  it('renders DataTableHeader with draggable wrapper', () => {
    render(<DraggableColumnHeader column={mockColumn} />);

    expect(screen.getByTestId('data-table-header')).toHaveTextContent('order_id');
    expect(screen.getByTestId('draggable-col-order_id')).toBeInTheDocument();
  });

  it('passes draggable id based on column name', () => {
    render(<DraggableColumnHeader column={mockColumn} />);

    const wrapper = screen.getByTestId('draggable-col-order_id');
    expect(wrapper.dataset.draggableId).toBe('column-order_id');
  });

  it('applies metric styling for metric computed columns', () => {
    const metricColumn = { name: 'total_revenue', normalizedType: 'number', computedType: 'metric' };
    render(<DraggableColumnHeader column={metricColumn} />);

    const wrapper = screen.getByTestId('draggable-col-total_revenue');
    expect(wrapper.className).toContain('border-t-cyan-500');
    expect(wrapper.className).toContain('bg-cyan-50/50');
  });

  it('applies dimension styling for dimension computed columns', () => {
    const dimColumn = { name: 'order_month', normalizedType: 'string', computedType: 'dimension' };
    render(<DraggableColumnHeader column={dimColumn} />);

    const wrapper = screen.getByTestId('draggable-col-order_month');
    expect(wrapper.className).toContain('border-t-teal-500');
    expect(wrapper.className).toContain('bg-teal-50/50');
  });

  it('does not apply computed styling for regular columns', () => {
    render(<DraggableColumnHeader column={mockColumn} />);

    const wrapper = screen.getByTestId('draggable-col-order_id');
    expect(wrapper.className).not.toContain('border-t-cyan');
    expect(wrapper.className).not.toContain('border-t-teal');
  });

  it('applies error styling for failed computed columns', () => {
    const failedColumn = {
      name: 'formatted_date',
      normalizedType: 'string',
      computedType: 'dimension',
      computedError: 'Type mismatch error',
    };
    render(<DraggableColumnHeader column={failedColumn} />);

    const wrapper = screen.getByTestId('draggable-col-formatted_date');
    expect(wrapper.className).toContain('border-t-red-500');
    expect(wrapper.className).toContain('bg-red-50/50');
  });

  it('error styling takes precedence over computed type styling', () => {
    const errorMetric = {
      name: 'bad_metric',
      normalizedType: 'number',
      computedType: 'metric',
      computedError: 'Computation failed',
    };
    render(<DraggableColumnHeader column={errorMetric} />);

    const wrapper = screen.getByTestId('draggable-col-bad_metric');
    expect(wrapper.className).toContain('border-t-red-500');
    expect(wrapper.className).not.toContain('border-t-cyan-500');
  });

  it('shows error tooltip via title attribute', () => {
    const failedColumn = {
      name: 'broken_col',
      normalizedType: 'number',
      computedError: 'Cannot cast VARCHAR to INTEGER',
    };
    render(<DraggableColumnHeader column={failedColumn} />);

    const wrapper = screen.getByTestId('draggable-col-broken_col');
    expect(wrapper).toHaveAttribute('title', 'Cannot cast VARCHAR to INTEGER');
  });

  it('does not set title when no error', () => {
    render(<DraggableColumnHeader column={mockColumn} />);

    const wrapper = screen.getByTestId('draggable-col-order_id');
    expect(wrapper).not.toHaveAttribute('title');
  });
});
