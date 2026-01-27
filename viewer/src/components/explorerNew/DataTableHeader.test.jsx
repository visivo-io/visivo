import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTableHeader from './DataTableHeader';

const defaultColumn = {
  name: 'amount',
  normalizedType: 'number',
  duckdbType: 'DOUBLE',
  nullPercentage: 5.2,
};

describe('DataTableHeader', () => {
  it('renders column name', () => {
    render(<DataTableHeader column={defaultColumn} />);
    expect(screen.getByText('amount')).toBeInTheDocument();
  });

  it('shows sort indicator when sorted ascending', () => {
    render(
      <DataTableHeader column={defaultColumn} sorting={{ column: 'amount', direction: 'asc' }} />
    );
    expect(screen.getByText('amount').closest('[class*="bg-primary"]')).toBeInTheDocument();
  });

  it('cycles sort direction on click', () => {
    const onSortChange = jest.fn();
    const { rerender } = render(
      <DataTableHeader column={defaultColumn} onSortChange={onSortChange} />
    );

    // First click: unsorted -> asc
    fireEvent.click(screen.getByText('amount'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'amount', direction: 'asc' });

    // Re-render with asc sorting, click -> desc
    rerender(
      <DataTableHeader
        column={defaultColumn}
        sorting={{ column: 'amount', direction: 'asc' }}
        onSortChange={onSortChange}
      />
    );
    fireEvent.click(screen.getByText('amount'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'amount', direction: 'desc' });

    // Re-render with desc sorting, click -> unsort
    rerender(
      <DataTableHeader
        column={defaultColumn}
        sorting={{ column: 'amount', direction: 'desc' }}
        onSortChange={onSortChange}
      />
    );
    fireEvent.click(screen.getByText('amount'));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it('fires onInfoClick and stops propagation', () => {
    const onInfoClick = jest.fn();
    const onSortChange = jest.fn();
    render(
      <DataTableHeader
        column={defaultColumn}
        onInfoClick={onInfoClick}
        onSortChange={onSortChange}
      />
    );

    fireEvent.click(screen.getByTitle('View column profile'));

    expect(onInfoClick).toHaveBeenCalledWith('amount', defaultColumn);
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('renders null percentage bar', () => {
    render(<DataTableHeader column={defaultColumn} />);
    expect(screen.getByTitle('5.2% null')).toBeInTheDocument();
  });
});
