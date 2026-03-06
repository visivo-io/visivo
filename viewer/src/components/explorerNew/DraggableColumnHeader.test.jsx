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
});
