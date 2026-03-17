import { render, screen, waitFor, act } from '@testing-library/react';
import InsightTable from './InsightTable';
import * as DuckDBContext from '../../contexts/DuckDBContext';
import * as queries from '../../duckdb/queries';

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

describe('InsightTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DuckDBContext.useDuckDB.mockReturnValue({});
  });

  it('renders column headers from props_mapping via DataTable', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    // DataTable renders display names from props_mapping reverse lookup
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('renders data rows via DataTable', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders "No data available" when insight has no data', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'empty-table', rows_per_page: 50 }}
          insightData={{ data: [], props_mapping: {}, files: [] }}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders export and share buttons in toolbar', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByRole('button', { name: 'DownloadCsv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Table' })).toBeInTheDocument();
  });

  it('renders search input in toolbar', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('shows total row count via DataTable footer', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByText('3 total rows')).toBeInTheDocument();
  });

  it('formats numeric values via DataTableCell', async () => {
    const dataWithBigNumbers = {
      ...mockInsightData,
      data: [{ col_a: 'Test', col_b: 1234567 }],
    };

    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'test-table', rows_per_page: 50 }}
          insightData={dataWithBigNumbers}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('wraps content in ItemContainer with slug id', async () => {
    await act(async () => {
      render(
        <InsightTable
          table={{ name: 'my-table', rows_per_page: 50 }}
          insightData={mockInsightData}
          itemWidth={600}
          height={400}
          width={600}
        />
      );
    });

    expect(document.getElementById('my-table')).toBeInTheDocument();
  });
});
