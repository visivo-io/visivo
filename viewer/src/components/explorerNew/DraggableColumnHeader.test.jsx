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
});
