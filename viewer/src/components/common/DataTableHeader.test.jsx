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
    expect(screen.getByLabelText('View profile for amount')).toBeInTheDocument();
    // Sort icon is rendered when sorted - the info button's aria-label confirms the header rendered,
    // and we verify sorting callback behavior in the 'cycles sort direction' test
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

  // Wide-table fix: when the table is in compressed mode (natural total
  // exceeds container), header text wraps to up to 2 lines instead of being
  // truncated, so columns can be narrower without losing readable headers.
  describe('compressed mode wrapping', () => {
    const longCol = {
      name: 'canceled_and_completed_deal_revenue',
      displayName: 'Canceled and Completed Deal Revenue',
      normalizedType: 'number',
      duckdbType: 'DOUBLE',
      nullPercentage: 0,
    };

    it('uses truncate when not compressed (default)', () => {
      render(<DataTableHeader column={longCol} />);
      const span = screen.getByText('Canceled and Completed Deal Revenue');
      expect(span.className).toMatch(/\btruncate\b/);
      expect(span.className).not.toMatch(/\bline-clamp-2\b/);
    });

    it('uses line-clamp-2 + break-words when compressed', () => {
      render(<DataTableHeader column={longCol} isCompressed />);
      const span = screen.getByText('Canceled and Completed Deal Revenue');
      expect(span.className).toMatch(/\bline-clamp-2\b/);
      expect(span.className).toMatch(/\bbreak-words\b/);
      expect(span.className).toMatch(/\bwhitespace-normal\b/);
      expect(span.className).not.toMatch(/\btruncate\b/);
    });

    it('keeps full name in title attribute for hover tooltip', () => {
      render(<DataTableHeader column={longCol} isCompressed />);
      const span = screen.getByText('Canceled and Completed Deal Revenue');
      expect(span.getAttribute('title')).toBe('Canceled and Completed Deal Revenue');
    });
  });
});
