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

  it('renders resize handles in header cells', () => {
    render(<DataTable {...defaultProps} />);
    const resizeHandles = screen.getAllByRole('separator');
    expect(resizeHandles).toHaveLength(defaultColumns.length);
  });

  it('renders column visibility toggle button with correct count', () => {
    render(<DataTable {...defaultProps} />);
    expect(screen.getByText('Columns (3/3)')).toBeInTheDocument();
  });

  it('renders headerBanner when provided', () => {
    const banner = <div>SUM of Revenue | Columns: Region</div>;
    render(<DataTable {...defaultProps} headerBanner={banner} />);
    expect(screen.getByText('SUM of Revenue | Columns: Region')).toBeInTheDocument();
  });

  it('does not render headerBanner when not provided', () => {
    render(<DataTable {...defaultProps} />);
    expect(screen.queryByText('SUM of Revenue | Columns: Region')).not.toBeInTheDocument();
  });

  it('opens column visibility dropdown on click', () => {
    render(<DataTable {...defaultProps} />);
    const columnsButton = screen.getByText('Columns (3/3)');
    fireEvent.click(columnsButton);

    // Should show checkboxes for each column
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    // All should be checked by default
    checkboxes.forEach(cb => {
      expect(cb).toBeChecked();
    });
  });

  // B15: the root must fill its parent item div in both directions and not
  // exceed it. Combined with the inner overflow-auto this gives wide tables
  // a horizontal scrollbar inside the card and prevents narrow-content
  // tables from shrinking to less than the slot width.
  describe('B15 sizing', () => {
    it('root has w-full and max-w-full classes (data state)', () => {
      const { container } = render(<DataTable {...defaultProps} />);
      // eslint-disable-next-line testing-library/no-node-access
      const root = container.firstChild;
      expect(root.className).toMatch(/\bw-full\b/);
      expect(root.className).toMatch(/\bmax-w-full\b/);
    });

    it('root has w-full and max-w-full classes (loading state)', () => {
      const { container } = render(<DataTable {...defaultProps} isLoading={true} />);
      // eslint-disable-next-line testing-library/no-node-access
      const root = container.firstChild;
      expect(root.className).toMatch(/\bw-full\b/);
      expect(root.className).toMatch(/\bmax-w-full\b/);
    });

    it('root has w-full and max-w-full classes (empty state)', () => {
      const { container } = render(<DataTable {...defaultProps} rows={[]} />);
      // eslint-disable-next-line testing-library/no-node-access
      const root = container.firstChild;
      expect(root.className).toMatch(/\bw-full\b/);
      expect(root.className).toMatch(/\bmax-w-full\b/);
    });

    // Wide-table fix: the inner scroll surface must have min-w-0 so it can
    // be narrower than its content (which sets style.minWidth = totalWidth)
    // and present a horizontal scrollbar instead of leaking min-content up
    // to the dashboard grid track.
    it('inner scroll container has min-w-0 and overflow-auto', () => {
      const { container } = render(<DataTable {...defaultProps} />);
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const scroller = container.querySelector('.overflow-auto');
      expect(scroller).not.toBeNull();
      expect(scroller.className).toMatch(/\bmin-w-0\b/);
      expect(scroller.className).toMatch(/\bflex-1\b/);
    });
  });

  // VIS-1011: brand beautification — the rendered table/pivot surface must use
  // the Visivo design-system palette (mauve primary / gray secondary) and read
  // like a polished card, not default grid chrome. These assertions lock in the
  // brand styling so a future refactor can't silently regress it to off-brand.
  describe('VIS-1011 brand styling', () => {
    it('root is a rounded-lg card with a shadow (data state)', () => {
      const { container } = render(<DataTable {...defaultProps} />);
      // eslint-disable-next-line testing-library/no-node-access
      const root = container.firstChild;
      expect(root.className).toMatch(/\brounded-lg\b/);
      expect(root.className).toMatch(/\bshadow-sm\b/);
    });

    it('root is a rounded-lg card with a shadow (loading state)', () => {
      const { container } = render(<DataTable {...defaultProps} isLoading />);
      // eslint-disable-next-line testing-library/no-node-access
      const root = container.firstChild;
      expect(root.className).toMatch(/\brounded-lg\b/);
      expect(root.className).toMatch(/\bshadow-sm\b/);
    });

    it('renders zebra-striped rows with a brand mauve hover', () => {
      const { container } = render(<DataTable {...defaultProps} />);
      // The virtualized body rows are absolutely-positioned flex rows. The
      // first (even) row is white, the second (odd) row is the light gray
      // stripe, and every row gets the mauve hover tint.
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const bodyRows = Array.from(container.querySelectorAll('div.flex')).filter(el =>
        el.className.includes('hover:bg-primary-50')
      );
      expect(bodyRows.length).toBeGreaterThanOrEqual(2);
      expect(bodyRows[0].className).toMatch(/\bbg-white\b/);
      expect(bodyRows[1].className).toMatch(/\bbg-secondary-50\b/);
      bodyRows.forEach(row => {
        expect(row.className).toMatch(/hover:bg-primary-50/);
      });
    });

    it('styles the pivot row band with the brand mauve tint', () => {
      const nestedColumns = [
        {
          id: 'region',
          accessorKey: 'region',
          header: 'Region',
          meta: { isPivotRow: true },
        },
        { id: 'east', accessorKey: 'east', header: 'East' },
      ];
      const rows = [
        { region: 'North', east: 10 },
        { region: 'South', east: 20 },
      ];
      const columns = [
        { name: 'region', normalizedType: 'string', isPivotRow: true },
        { name: 'east', normalizedType: 'number' },
      ];
      const { container } = render(
        <DataTable
          columns={columns}
          rows={rows}
          totalRowCount={2}
          nestedColumns={nestedColumns}
        />
      );
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const pivotBand = container.querySelector('.bg-primary-50');
      expect(pivotBand).not.toBeNull();
    });
  });
});
