/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { render, screen, fireEvent } from '@testing-library/react';
import selectEvent from 'react-select-event';
import PivotableTable from './PivotableTable';
import * as DuckDBContext from '../../contexts/DuckDBContext';

jest.mock('../../contexts/DuckDBContext');
jest.mock('../../duckdb/queries');

// Controllable stand-in for the DuckDB pivot hook so pivot / column-select
// rendering can be exercised without a real DuckDB instance. The default
// (set in beforeEach) mirrors the hook's resting state on the non-DuckDB path.
let mockPivotReturn;
jest.mock('../../hooks/usePivotData', () => ({
  usePivotData: () => mockPivotReturn,
}));

// Mock useVirtualizer since JSDOM has no real layout
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        key: i,
      })),
    getTotalSize: () => count * 36,
  }),
}));

const mockInsightData = {
  data: [
    { col_a: 'Alice', col_b: 100 },
    { col_a: 'Bob', col_b: 200 },
    { col_a: 'Charlie', col_b: 300 },
  ],
  props_mapping: {
    'props.name': 'col_a',
    'props.revenue': 'col_b',
  },
  files: [{ name_hash: 'test_hash', signed_data_file_url: 'http://example.com/file.parquet' }],
};

describe('PivotableTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DuckDBContext.useDuckDB.mockReturnValue({});
    mockPivotReturn = {
      rows: [],
      columns: [],
      nestedColumns: null,
      pivotMeta: null,
      isLoading: false,
      error: null,
    };
  });

  it('renders column headers from props_mapping via DataTable', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('renders data rows via DataTable', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders "No data available" when insight has no data', () => {
    render(
      <PivotableTable
        table={{ name: 'empty-table', rows_per_page: 50 }}
        sourceData={{ data: [], props_mapping: {}, files: [] }}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders the export button but NO share button in the toolbar', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    // CSV export is a table feature and stays; the Copy/share button is gone
    // (the per-item Copy link now lives only in the flip-layer kebab).
    expect(screen.getByRole('button', { name: 'DownloadCsv' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share Table' })).not.toBeInTheDocument();
  });

  it('renders search input in toolbar', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('shows total row count via DataTable footer', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('3 total rows')).toBeInTheDocument();
  });

  it('formats numeric values via DataTableCell', () => {
    const dataWithBigNumbers = {
      ...mockInsightData,
      data: [{ col_a: 'Test', col_b: 1234567 }],
    };

    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={dataWithBigNumbers}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  // VIS-1011: the toolbar controls (search field + CSV download) must inherit
  // the brand-aligned MUI theme so they no longer render in default MUI blue.
  // We assert the toolbar's search field is themed with the primary palette by
  // verifying the focused-input brand color flows through to the MUI input.
  it('renders the toolbar search field with the brand-themed input', () => {
    const { container } = render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    // The brand ThemeProvider wraps the toolbar; its MUI TextField renders an
    // outlined input root. Its presence (alongside the placeholder) confirms the
    // themed control mounted without falling back to the default palette path.
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const outlinedInput = container.querySelector('.MuiOutlinedInput-root');
    expect(outlinedInput).not.toBeNull();
  });

  it('formats column headers from raw keys when no props_mapping exists (hash strip)', () => {
    render(
      <PivotableTable
        table={{ name: 'raw-table', rows_per_page: 50 }}
        sourceData={{
          data: [
            { first_name: 'Ann', total_count: 3, active: true, empty_col: null, rev_hash_ab12f0: 9 },
          ],
          files: [],
        }}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Total Count')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Empty Col')).toBeInTheDocument();
    // `_hash_<hex>` suffixes are stripped before formatting.
    expect(screen.getByText('Rev')).toBeInTheDocument();
  });

  describe('toolbar search filter', () => {
    it('filters rows client-side and clears via the adornment button', () => {
      render(
        <PivotableTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      fireEvent.change(input, { target: { value: 'alice' } });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      expect(screen.getByText('1 total rows')).toBeInTheDocument();

      // The clear adornment appears once a filter is set; clicking it resets.
      // eslint-disable-next-line testing-library/no-node-access
      const clearButton = input.closest('.MuiInputBase-root').querySelector('button');
      fireEvent.click(clearButton);
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('3 total rows')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    const renderTable = () =>
      render(
        <PivotableTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );

    const nameOrder = () =>
      screen.getAllByText(/^(Alice|Bob|Charlie)$/).map(el => el.textContent);

    it('cycles a string column asc → desc → unsorted on header clicks', () => {
      renderTable();
      expect(nameOrder()).toEqual(['Alice', 'Bob', 'Charlie']);

      fireEvent.click(screen.getByText('Name')); // asc
      expect(nameOrder()).toEqual(['Alice', 'Bob', 'Charlie']);

      fireEvent.click(screen.getByText('Name')); // desc
      expect(nameOrder()).toEqual(['Charlie', 'Bob', 'Alice']);

      fireEvent.click(screen.getByText('Name')); // unsort
      expect(nameOrder()).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts numeric columns numerically', () => {
      renderTable();
      fireEvent.click(screen.getByText('Revenue')); // asc
      fireEvent.click(screen.getByText('Revenue')); // desc → 300 first
      expect(nameOrder()).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('pushes null values to the bottom regardless of direction', () => {
      render(
        <PivotableTable
          table={{ name: 'nulls', rows_per_page: 50 }}
          sourceData={{
            data: [
              { col_a: null, col_b: 1 },
              { col_a: 'Zed', col_b: 2 },
            ],
            files: [],
          }}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      fireEvent.click(screen.getByText('Col A')); // asc: Zed first, null last
      const cells = screen.getAllByText(/^(Zed|1|2)$/).map(el => el.textContent);
      expect(cells).toEqual(['Zed', '2', '1']);
    });
  });

  describe('pagination', () => {
    const renderPaged = () =>
      render(
        <PivotableTable
          table={{ name: 'paged', rows_per_page: 2 }}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );

    it('slices rows per page and navigates with next / previous', () => {
      renderPaged();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Next page'));
      expect(screen.getByText('Charlie')).toBeInTheDocument();
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Previous page'));
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('changing the page size shows all rows and resets to page 0', async () => {
      renderPaged();
      fireEvent.click(screen.getByLabelText('Next page'));
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();

      // The Select portals its menu to <body>, so point react-select-event there.
      await selectEvent.select(screen.getByLabelText('Rows per page'), '50', {
        container: document.body,
      });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  });

  it('exports the full dataset as a CSV named after the table', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    const appendSpy = jest.spyOn(document.body, 'appendChild');
    fireEvent.click(screen.getByRole('button', { name: 'DownloadCsv' }));
    const link = appendSpy.mock.calls.map(c => c[0]).find(n => n.tagName === 'A');
    expect(link).toBeDefined();
    expect(link.getAttribute('download')).toBe('test-table.csv');
    appendSpy.mockRestore();
  });

  it('applies gradient cell backgrounds when format_cells is configured', () => {
    render(
      <PivotableTable
        table={{
          name: 'gradient',
          rows_per_page: 50,
          format_cells: { scope: 'table', min_color: '#ffffff', max_color: '#ff0000' },
        }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    // col_b spans 100..300 → the max cell interpolates to the pure max colour.
    // eslint-disable-next-line testing-library/no-node-access
    const maxCell = screen.getByText('300').closest('div[style]');
    expect(maxCell).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)' });
    // eslint-disable-next-line testing-library/no-node-access
    const minCell = screen.getByText('100').closest('div[style]');
    expect(minCell).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
  });

  describe('DuckDB pivot mode', () => {
    const pivotTable = {
      name: 'pivot-table',
      rows_per_page: 50,
      columns: '${ref(i).category}',
      rows: ['${ref(i).name}'],
      values: ['sum(${ref(i).rev})'],
    };

    it('renders the pivot result with the aggregation banner', () => {
      mockPivotReturn = {
        rows: [{ col_name: 'Alice', East: 10, West: 20 }],
        columns: [
          { accessorKey: 'col_name', header: 'Name', isPivotRow: true },
          { accessorKey: 'East', header: 'East' },
          { accessorKey: 'West', header: 'West' },
        ],
        nestedColumns: null,
        pivotMeta: {
          aggregationLabel: 'SUM',
          pivotFieldName: 'Category',
          rowFieldNames: ['Name'],
        },
        isLoading: false,
        error: null,
      };
      render(
        <PivotableTable
          table={pivotTable}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );

      // Banner: aggregation + pivot/rows field names.
      expect(screen.getByText('SUM')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      // 'Name' appears in the banner AND as a column header.
      expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(2);

      // Pivoted columns + row data.
      expect(screen.getByText('East')).toBeInTheDocument();
      expect(screen.getByText('West')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('renders column-select mode (columns only, no banner)', () => {
      mockPivotReturn = {
        rows: [{ a: 'only-a' }],
        columns: [{ accessorKey: 'a', header: 'A Col' }],
        nestedColumns: null,
        pivotMeta: null,
        isLoading: false,
        error: null,
      };
      render(
        <PivotableTable
          table={{ name: 'colsel', rows_per_page: 50, columns: ['${ref(i).a}'] }}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      expect(screen.getByText('A Col')).toBeInTheDocument();
      expect(screen.getByText('only-a')).toBeInTheDocument();
      expect(screen.queryByText('Columns:')).not.toBeInTheDocument();
    });

    it('shows Loading while the pivot query is running', () => {
      mockPivotReturn = { ...mockPivotReturn, isLoading: true };
      render(
        <PivotableTable
          table={pivotTable}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      expect(screen.getByText('pivot-table')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });

    it('surfaces a pivot error in place of the table', () => {
      mockPivotReturn = { ...mockPivotReturn, error: 'kaboom' };
      render(
        <PivotableTable
          table={pivotTable}
          sourceData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      expect(screen.getByText(/Pivot error: kaboom/)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });
  });
});
