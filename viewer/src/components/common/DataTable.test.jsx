import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DataTable from './DataTable';

// Mock @tanstack/react-virtual. The option callbacks (getScrollElement /
// estimateSize) are invoked exactly like the real virtualizer would use them,
// so the row-height estimate drives the mocked layout.
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: options => {
    options.getScrollElement();
    const size = options.estimateSize();
    const { count } = options;
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * size,
          size,
          key: i,
        })),
    };
  },
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

  it('calls onPageSizeChange with a numeric page size from the footer selector', () => {
    const onPageSizeChange = jest.fn();
    render(<DataTable {...defaultProps} onPageSizeChange={onPageSizeChange} />);

    const combo = within(screen.getByTestId('datatable-page-size')).getByRole('combobox');
    fireEvent.mouseDown(combo);
    fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === '500'));

    expect(onPageSizeChange).toHaveBeenCalledWith(500);
  });

  it('clamps page navigation at the first and last page', () => {
    const onPageChange = jest.fn();
    const { unmount } = render(
      <DataTable {...defaultProps} pageCount={3} page={0} onPageChange={onPageChange} />
    );
    // On the first page, Previous is disabled and must not fire.
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).not.toHaveBeenCalled();
    unmount();

    render(<DataTable {...defaultProps} pageCount={3} page={2} onPageChange={onPageChange} />);
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('hides page navigation entirely for a single page', () => {
    render(<DataTable {...defaultProps} pageCount={1} />);
    expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
  });

  it('shows the querying progress bar only while a query is in flight', () => {
    const { container, rerender } = render(<DataTable {...defaultProps} isQuerying />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    rerender(<DataTable {...defaultProps} isQuerying={false} />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('applies getCellStyle results to body cells', () => {
    const getCellStyle = jest.fn((rowIndex, columnId) =>
      columnId === 'name' ? { backgroundColor: 'rgb(1, 2, 3)' } : undefined
    );
    render(<DataTable {...defaultProps} getCellStyle={getCellStyle} />);
    expect(getCellStyle).toHaveBeenCalledWith(0, 'name');
    // eslint-disable-next-line testing-library/no-node-access
    const styledCell = screen.getByText('Item 1').closest('div[style]');
    expect(styledCell).toBeTruthy();
  });

  // Visual row merging: consecutive rows sharing the same value in a merge
  // column render the value once — later duplicates are blanked.
  describe('mergeRowColumns', () => {
    const mergeColumns = [
      { name: 'category', normalizedType: 'string' },
      { name: 'amount', normalizedType: 'number' },
    ];
    const mergeRows = [
      { category: 'Alpha', amount: 1 },
      { category: 'Alpha', amount: 2 },
      { category: 'Beta', amount: 3 },
    ];

    it('renders a repeated merge-column value only once per run', () => {
      render(
        <DataTable
          columns={mergeColumns}
          rows={mergeRows}
          totalRowCount={3}
          mergeRowColumns={['category']}
        />
      );
      // "Alpha" appears in rows 0 and 1 but the row-1 cell is merged away.
      expect(screen.getAllByText('Alpha')).toHaveLength(1);
      // The run breaks at "Beta", which still renders.
      expect(screen.getByText('Beta')).toBeInTheDocument();
      // Non-merged columns keep every value.
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders every value when no merge columns are configured', () => {
      render(<DataTable columns={mergeColumns} rows={mergeRows} totalRowCount={3} />);
      expect(screen.getAllByText('Alpha')).toHaveLength(2);
    });
  });

  // Sticky left columns: pinned columns carry inline sticky positioning on the
  // header cell and every body cell so they survive horizontal scrolling.
  describe('stickyLeftColumns', () => {
    it('pins the configured column with position:sticky and a left offset', () => {
      const { container } = render(<DataTable {...defaultProps} stickyLeftColumns={['id']} />);
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const stickyEls = Array.from(container.querySelectorAll('div')).filter(
        el => el.style.position === 'sticky' && el.style.left === '0px'
      );
      // 1 header cell + 2 body rows' cells.
      expect(stickyEls.length).toBe(3);
    });

    it('adds no inline sticky styles when not configured', () => {
      const { container } = render(<DataTable {...defaultProps} />);
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const stickyEls = Array.from(container.querySelectorAll('div')).filter(
        el => el.style.position === 'sticky'
      );
      expect(stickyEls.length).toBe(0);
    });
  });

  // Multi-level headers: a group definition renders a spanning group header row
  // above its leaf columns, and flat columns get placeholder cells in the leaf row.
  describe('nested group headers', () => {
    const nestedColumns = [
      { id: 'id', accessorKey: 'id', header: 'id' },
      {
        id: 'measures',
        header: 'Measures',
        columns: [
          { id: 'name', accessorKey: 'name', header: 'name' },
          { id: 'value', accessorKey: 'value', header: 'value' },
        ],
      },
    ];

    it('renders the group band plus all leaf headers and data', () => {
      render(<DataTable {...defaultProps} nestedColumns={nestedColumns} />);
      expect(screen.getByText('Measures')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('value')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    it('keeps a sticky flat column pinned across placeholder header rows', () => {
      const { container } = render(
        <DataTable {...defaultProps} nestedColumns={nestedColumns} stickyLeftColumns={['id']} />
      );
      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
      const stickyEls = Array.from(container.querySelectorAll('div')).filter(
        el => el.style.position === 'sticky' && el.style.left === '0px'
      );
      // The id column occupies one header row (real or placeholder, depending on
      // where tanstack places the flat column) + 2 body cells — all pinned.
      expect(stickyEls.length).toBeGreaterThanOrEqual(3);
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
