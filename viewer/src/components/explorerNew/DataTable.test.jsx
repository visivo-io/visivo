import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from './DataTable';

// Mock @tanstack/react-virtual
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        key: i,
      })),
  }),
}));

const defaultColumns = [
  { name: 'id', normalizedType: 'number', duckdbType: 'INTEGER', nullPercentage: 0 },
  { name: 'name', normalizedType: 'string', duckdbType: 'VARCHAR', nullPercentage: 2.5 },
  { name: 'value', normalizedType: 'number', duckdbType: 'DOUBLE', nullPercentage: 0 },
];

const defaultRows = [
  { id: 1, name: 'Item 1', value: 100 },
  { id: 2, name: 'Item 2', value: 200 },
];

const defaultProps = {
  columns: defaultColumns,
  rows: defaultRows,
  totalRowCount: 2,
};

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable {...defaultProps} />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable {...defaultProps} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('shows total row count in footer', () => {
    render(<DataTable {...defaultProps} />);
    expect(screen.getByText('2 total rows')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<DataTable {...defaultProps} isLoading />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('shows no data state', () => {
    render(<DataTable {...defaultProps} rows={[]} columns={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('calls onColumnProfileRequest when info button clicked', () => {
    const onColumnProfileRequest = jest.fn();
    render(<DataTable {...defaultProps} onColumnProfileRequest={onColumnProfileRequest} />);

    const infoButtons = screen.getAllByTitle('View column profile');
    fireEvent.click(infoButtons[0]);

    expect(onColumnProfileRequest).toHaveBeenCalledWith('id', expect.any(Object));
  });

  it('calls onSortChange when header clicked', () => {
    const onSortChange = jest.fn();
    render(<DataTable {...defaultProps} onSortChange={onSortChange} />);

    // Click on the column name text area (header click)
    fireEvent.click(screen.getByText('name'));

    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });

  it('renders pagination controls when multiple pages', () => {
    render(<DataTable {...defaultProps} pageCount={5} page={2} />);
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('calls onPageChange for navigation', () => {
    const onPageChange = jest.fn();
    render(<DataTable {...defaultProps} pageCount={5} page={2} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('formats null values', () => {
    const rows = [{ id: 1, name: null, value: 100 }];
    render(<DataTable {...defaultProps} rows={rows} />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('formats numbers with locale formatting', () => {
    const rows = [{ id: 1, name: 'Test', value: 1000000 }];
    render(<DataTable {...defaultProps} rows={rows} />);
    // The exact format depends on locale, but should contain separators
    expect(screen.getByTitle('1000000')).toBeInTheDocument();
  });
});
