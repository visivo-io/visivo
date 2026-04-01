import { render, screen } from '@testing-library/react';
import PivotableTable from './PivotableTable';
import * as DuckDBContext from '../../contexts/DuckDBContext';

jest.mock('../../contexts/DuckDBContext');
jest.mock('../../duckdb/queries');
jest.mock('../../hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    toolTip: 'Copy link',
    copyText: jest.fn(),
    resetToolTip: jest.fn(),
  }),
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

  it('renders export and share buttons in toolbar', () => {
    render(
      <PivotableTable
        table={{ name: 'test-table', rows_per_page: 50 }}
        sourceData={mockInsightData}
        itemWidth={600}
        height={400}
        width={600}
      />
    );

    expect(screen.getByRole('button', { name: 'DownloadCsv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Table' })).toBeInTheDocument();
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

});
