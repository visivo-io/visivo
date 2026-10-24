/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { render, screen, fireEvent } from '@testing-library/react';
import selectEvent from 'react-select-event';
import PivotableTable, { csvRowsFor } from './PivotableTable';
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

  // Smoke-test bug #16: a columns-only (column-select) table has no pivot, so
  // its render error must not be labeled "Pivot error".
  it('labels a columns-only table error "Table error", not "Pivot error"', () => {
    mockPivotReturn = { ...mockPivotReturn, error: 'Parser Error: zero-length delimited identifier' };
    const { container } = render(
      <PivotableTable
        table={{ name: 'colsel', columns: ['${ref(m).sex}'], rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    expect(container.textContent).toContain('Table error:');
    expect(container.textContent).not.toContain('Pivot error:');
  });

  it('labels a real pivot table error "Pivot error"', () => {
    mockPivotReturn = { ...mockPivotReturn, error: 'Parser Error: something' };
    const { container } = render(
      <PivotableTable
        table={{
          name: 'piv',
          columns: ['${ref(m).a}'],
          rows: ['${ref(m).b}'],
          values: ['${ref(m).c}'],
          rows_per_page: 50,
        }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    expect(container.textContent).toContain('Pivot error:');
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

  describe('date and timestamp columns', () => {
    const renderDates = data =>
      render(
        <PivotableTable
          table={{ name: 'dates', rows_per_page: 50 }}
          sourceData={{ data, files: [] }}
          itemWidth={600}
          height={400}
          width={600}
        />
      );

    it('shows only the date when every value in a column is midnight', () => {
      renderDates([
        { day: '2021-01-01T00:00:00.000Z' },
        { day: '2021-01-02T00:00:00.000Z' },
      ]);
      expect(screen.getByText('2021-01-01')).toBeInTheDocument();
      expect(screen.getByText('2021-01-02')).toBeInTheDocument();
    });

    it('shows date and time when any value in a column has a time part', () => {
      renderDates([
        { event_at: '2021-01-01T00:00:00.000Z' },
        { event_at: '2021-01-01T08:30:15.000Z' },
      ]);
      expect(screen.getByText('2021-01-01 00:00:00.000')).toBeInTheDocument();
      expect(screen.getByText('2021-01-01 08:30:15.000')).toBeInTheDocument();
    });

    it('sorts a date column by its underlying value', () => {
      renderDates([
        { day: '2021-01-10T00:00:00.000Z' },
        { day: '2020-12-31T00:00:00.000Z' },
        { day: '2021-01-02T00:00:00.000Z' },
      ]);
      const dayOrder = () => screen.getAllByText(/^\d{4}-\d{2}-\d{2}$/).map(el => el.textContent);
      fireEvent.click(screen.getByText('Day'));
      expect(dayOrder()).toEqual(['2020-12-31', '2021-01-02', '2021-01-10']);
    });
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

    it('matches the displayed text of a formatted cell, and still its raw value', () => {
      render(
        <PivotableTable
          table={{ name: 'dates', rows_per_page: 50 }}
          sourceData={{
            data: [
              { event_at: '2021-01-01T08:30:15.000Z', amount: 1234567 },
              { event_at: '2021-01-02T09:45:00.000Z', amount: 42 },
            ],
            files: [],
          }}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      const search = value =>
        fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value } });

      search('2021-01-01 08:30');
      expect(screen.getByText('2021-01-01 08:30:15.000')).toBeInTheDocument();
      expect(screen.getByText('1 total rows')).toBeInTheDocument();

      search('1,234,567');
      expect(screen.getByText('1 total rows')).toBeInTheDocument();

      search('1234567');
      expect(screen.getByText('1 total rows')).toBeInTheDocument();
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

  describe('CSV content', () => {
    const exportedCsv = sourceData => {
      const OriginalBlob = global.Blob;
      const parts = [];
      global.Blob = function (blobParts) {
        parts.push(...blobParts);
        return new OriginalBlob(blobParts);
      };
      render(
        <PivotableTable
          table={{ name: 'csv-table', rows_per_page: 50 }}
          sourceData={sourceData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'DownloadCsv' }));
      global.Blob = OriginalBlob;
      return parts.join('');
    };

    it('writes empty cells as empty text, not the word null', () => {
      const csv = exportedCsv({
        data: [
          { name: 'Alice', score: 1 },
          { name: null, score: null },
        ],
        props_mapping: {},
        files: [],
      });
      expect(csv).not.toContain('null');
      expect(csv.split('\r\n')[2]).toBe('"",""');
    });

    it('writes date columns as displayed rather than as raw timestamps', () => {
      const csv = exportedCsv({
        data: [{ day: '2024-03-05T00:00:00.000Z', n: 1234.5 }],
        props_mapping: {},
        files: [],
      });
      expect(csv).toContain('2024-03-05');
      expect(csv).not.toContain('T00:00:00.000Z');
      expect(csv).toContain('1234.5');
    });

    it('keeps the BOM so Excel reads UTF-8', () => {
      const csv = exportedCsv(mockInsightData);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });
  });

  describe('csvRowsFor', () => {
    it('stringifies bigint and object values and leaves other values alone', () => {
      const rows = csvRowsFor(
        [{ big: 12n, obj: { a: 1 }, text: 'x', flag: true, gone: undefined }],
        [
          { name: 'big', normalizedType: 'number' },
          { name: 'obj', normalizedType: 'string' },
          { name: 'text', normalizedType: 'string' },
          { name: 'flag', normalizedType: 'boolean' },
          { name: 'gone', normalizedType: 'string' },
        ]
      );
      expect(rows[0]).toEqual({ big: '12', obj: '{"a":1}', text: 'x', flag: true, gone: '' });
    });
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

    describe('date and timestamp values', () => {
      const rows = [
        { day: '2021-01-01T00:00:00.000Z', at: '2021-01-01T08:30:15.000Z', total: 3 },
        { day: '2021-01-02T00:00:00.000Z', at: '2021-01-02T09:30:15.000Z', total: 4 },
      ];
      const columns = [
        { accessorKey: 'day', header: 'Day', isPivotRow: true },
        { accessorKey: 'at', header: 'At' },
        { accessorKey: 'total', header: 'Total' },
      ];
      const renderResult = (table, nestedColumns) => {
        mockPivotReturn = { ...mockPivotReturn, rows, columns, nestedColumns };
        render(
          <PivotableTable
            table={table}
            sourceData={mockInsightData}
            itemWidth={600}
            height={400}
            width={600}
          />
        );
      };

      it('formats them in a column-select result', () => {
        renderResult({ name: 'colsel', rows_per_page: 50, columns: ['${ref(i).a}'] }, null);
        expect(screen.getByText('2021-01-01')).toBeInTheDocument();
        expect(screen.getByText('2021-01-02 09:30:15.000')).toBeInTheDocument();
      });

      it('sorts them in time order in a column-select result', () => {
        mockPivotReturn = {
          ...mockPivotReturn,
          rows: [
            { at: '2021-01-10T08:00:00.000Z' },
            { at: '1999-12-31T23:59:59.000Z' },
            { at: '2021-01-02T10:00:00.000Z' },
            { at: '2021-01-02T09:30:00.000Z' },
          ],
          columns: [{ accessorKey: 'at', header: 'At' }],
          nestedColumns: null,
        };
        render(
          <PivotableTable
            table={{ name: 'colsel', rows_per_page: 50, columns: ['${ref(i).at}'] }}
            sourceData={mockInsightData}
            itemWidth={600}
            height={400}
            width={600}
          />
        );
        const order = () => screen.getAllByText(/^\d{4}-\d{2}-\d{2} /).map(el => el.textContent);
        fireEvent.click(screen.getByText('At'));
        expect(order()).toEqual([
          '1999-12-31 23:59:59.000',
          '2021-01-02 09:30:00.000',
          '2021-01-02 10:00:00.000',
          '2021-01-10 08:00:00.000',
        ]);
        fireEvent.click(screen.getByText('At'));
        expect(order()[0]).toBe('2021-01-10 08:00:00.000');
      });

      it('formats them in a pivot result with nested headers', () => {
        renderResult(pivotTable, [
          { id: 'day', accessorKey: 'day', header: 'Day' },
          {
            id: 'group-0-East',
            header: 'East',
            columns: [
              { id: 'at', accessorKey: 'at', header: 'At' },
              { id: 'total', accessorKey: 'total', header: 'Total' },
            ],
          },
        ]);
        expect(screen.getByText('2021-01-01')).toBeInTheDocument();
        expect(screen.getByText('2021-01-02 09:30:15.000')).toBeInTheDocument();
      });
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

// ---------------------------------------------------------------------------
// VIS-1463 T4 / T5: whole-table gradients, nulls, measure columns, pager sizes
// ---------------------------------------------------------------------------
// These assertions read the inline `backgroundColor` of sibling cells — there is
// no Testing Library query for "the cell to the right of this one", so direct
// node access is the honest way to measure the gradient.
/* eslint-disable testing-library/no-node-access */
describe('PivotableTable — gradients and paging (VIS-1463)', () => {
  beforeEach(() => {
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

  const cellOf = text => screen.getByText(text).closest('div[style]');

  it('lists every RowsPerPageEnum size in the Rows selector (T5)', async () => {
    render(
      <PivotableTable
        table={{ name: 'sizes', rows_per_page: 10 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    // The configured 10 (previously unselectable) is the current value.
    expect(screen.getByTestId('datatable-page-size')).toHaveTextContent('10');
    selectEvent.openMenu(screen.getByLabelText('Rows per page'));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    expect(options).toEqual(['3', '5', '10', '25', '50', '100', '500', '1,000']);
  });

  it('colours a value identically on page 1 and page 3 (gradient over ALL rows, T4)', () => {
    // 60 rows, 25 per page (pages: 0-24 / 25-49 / 50-59): v = i % 20 so row 11
    // (page 1) and row 51 (page 3) share v=11; w grows so a per-page max would
    // differ between the pages.
    const data = Array.from({ length: 60 }, (_, i) => ({
      key: `k${String(i).padStart(2, '0')}`,
      v: i % 20,
      w: i * 2,
    }));
    render(
      <PivotableTable
        table={{
          name: 'sixty',
          rows_per_page: 25,
          format_cells: { scope: 'table', min_color: '#000000', max_color: '#ffffff' },
        }}
        sourceData={{ data, files: [] }}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    // Page 1: row 11 → v=11. Range over the whole table is 0..118.
    const page1Row = cellOf('k11').parentElement;
    const page1V = page1Row.children[1].style.backgroundColor;
    expect(page1V).toBe('rgb(24, 24, 24)'); // round(255 * 11/118)
    // w=48 (row 24, last on the page) is NOT the per-page maximum colour.
    expect(cellOf('k24').parentElement.children[2].style.backgroundColor).not.toBe(
      'rgb(255, 255, 255)'
    );

    fireEvent.click(screen.getByLabelText('Next page'));
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    const page3Row = cellOf('k51').parentElement;
    expect(page3Row.children[1].style.backgroundColor).toBe(page1V);
    // The whole-table max (w=118, row 59) is the pure max colour.
    expect(cellOf('k59').parentElement.children[2].style.backgroundColor).toBe(
      'rgb(255, 255, 255)'
    );
  });

  it('leaves null cells without a background and keeps them out of the range (T4)', () => {
    render(
      <PivotableTable
        table={{
          name: 'nullish',
          rows_per_page: 50,
          format_cells: { scope: 'column', min_color: '#ff0000', max_color: '#00ff00' },
        }}
        sourceData={{
          data: [
            { label: 'a', amount: 10 },
            { label: 'b', amount: null },
            { label: 'c', amount: 30 },
          ],
          files: [],
        }}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    expect(cellOf('a').parentElement.children[1].style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(cellOf('b').parentElement.children[1].style.backgroundColor).toBe('');
    expect(cellOf('c').parentElement.children[1].style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('does not colour numeric-looking string columns in data mode (T4)', () => {
    render(
      <PivotableTable
        table={{
          name: 'ids',
          rows_per_page: 50,
          format_cells: { scope: 'table', min_color: '#ff0000', max_color: '#00ff00' },
        }}
        sourceData={{
          data: [
            { id: '1001', amount: 1 },
            { id: '1002', amount: 2 },
          ],
          files: [],
        }}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    expect(cellOf('1001').style.backgroundColor).toBe('');
    expect(cellOf('1002').style.backgroundColor).toBe('');
    expect(cellOf('1').style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(cellOf('2').style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('pivot mode colours every value column and never the row columns (T4)', () => {
    mockPivotReturn = {
      rows: [
        { col_name: '7', East: 1, West: null },
        { col_name: '9', East: 3, West: 5 },
      ],
      columns: [
        { accessorKey: 'col_name', header: 'Name', isPivotRow: true },
        { accessorKey: 'East', header: 'East' },
        { accessorKey: 'West', header: 'West' },
      ],
      nestedColumns: null,
      pivotMeta: { aggregationLabel: 'SUM', pivotFieldName: 'Category', rowFieldNames: ['Name'] },
      isLoading: false,
      error: null,
    };
    render(
      <PivotableTable
        table={{
          name: 'pivot-grad',
          rows_per_page: 50,
          columns: ['${ref(i).category}'],
          rows: ['${ref(i).name}'],
          values: ['sum(${ref(i).rev})'],
          format_cells: { scope: 'table', min_color: '#000000', max_color: '#ffffff' },
        }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );
    // Row-key cells look numeric ('7', '9') but are pivot row columns → no gradient.
    expect(cellOf('7').style.backgroundColor).toBe('');
    expect(cellOf('9').style.backgroundColor).toBe('');
    // Range over the value cells is 1..5; the null West cell is untouched.
    expect(cellOf('1').style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(cellOf('5').style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(cellOf('7').parentElement.children[2].style.backgroundColor).toBe('');
  });
});
/* eslint-enable testing-library/no-node-access */
