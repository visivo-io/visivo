import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../../router-config';
import DataTablePreview from './DataTablePreview';

// Mock DuckDB context
const mockDb = {};
jest.mock('../../contexts/DuckDBContext', () => ({
  useDuckDB: () => mockDb,
}));

// Mock DuckDB queries
jest.mock('../../duckdb/queries', () => ({
  loadParquetFromURL: jest.fn().mockResolvedValue(undefined),
  runDuckDBQuery: jest.fn().mockImplementation((db, sql) => {
    if (sql.startsWith('DESCRIBE')) {
      return Promise.resolve({
        toArray: () => [
          { toJSON: () => ({ column_name: 'id', column_type: 'INTEGER' }) },
          { toJSON: () => ({ column_name: 'name', column_type: 'VARCHAR' }) },
        ],
      });
    }
    if (sql.includes('COUNT(*)')) {
      return Promise.resolve({
        toArray: () => [{ toJSON: () => ({ total: 100 }) }],
      });
    }
    // Data query
    return Promise.resolve({
      toArray: () => [
        { toJSON: () => ({ id: 1, name: 'Row 1' }) },
        { toJSON: () => ({ id: 2, name: 'Row 2' }) },
      ],
    });
  }),
}));

const profileResponse = {
  columns: [
    {
      name: 'id',
      type: 'INTEGER',
      null_percentage: 0,
      null_count: 0,
      distinct: 100,
      min: 1,
      max: 100,
      avg: 50.5,
      median: 50,
      std_dev: 29,
      q25: 25,
      q75: 75,
    },
    {
      name: 'name',
      type: 'VARCHAR',
      null_percentage: 5.0,
      null_count: 5,
      distinct: 95,
      min: 'A',
      max: 'Z',
      avg: null,
      median: null,
      std_dev: null,
      q25: null,
      q75: null,
    },
  ],
  row_count: 100,
};

// Mock DuckDB profiling
jest.mock('../../duckdb/profiling', () => ({
  profileTableLocally: jest.fn().mockResolvedValue(profileResponse),
  histogramTableLocally: jest.fn().mockResolvedValue({
    buckets: [{ range: '[0, 50)', count: 50 }, { range: '[50, 100)', count: 50 }],
    total_count: 100,
    column_type: 'INTEGER',
  }),
}));

const { profileTableLocally } = require('../../duckdb/profiling');

// Mock store
const mockStore = {
  insights: [],
  insightsLoading: false,
  fetchInsights: jest.fn(),
  models: [{ name: 'test_model' }],
  modelsLoading: false,
  fetchModels: jest.fn(),
};

jest.mock('../../stores/store', () => ({
  __esModule: true,
  default: selector => selector(mockStore),
}));

// Mock alphaHash
jest.mock('../../utils/alphaHash', () => ({
  alphaHash: jest.fn(() => 'abc123'),
}));

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

const renderComponent = () =>
  render(
    <MemoryRouter future={futureFlags}>
      <DataTablePreview />
    </MemoryRouter>
  );

describe('DataTablePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    profileTableLocally.mockResolvedValue(profileResponse);
  });

  it('renders the data source selector', () => {
    renderComponent();
    expect(screen.getByText('Data Source:')).toBeInTheDocument();
    expect(screen.getByText('-- Select an insight or model --')).toBeInTheDocument();
  });

  it('shows models in the dropdown', () => {
    renderComponent();
    expect(screen.getByText('test_model')).toBeInTheDocument();
  });

  it('profiles data via DuckDB after parquet loads', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test_model' } });

    await waitFor(() => {
      expect(profileTableLocally).toHaveBeenCalledWith(mockDb, 'abc123');
    });
  });

  it('enriches columns with nullPercentage from profile data', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test_model' } });

    // Wait for profile to load and columns to be enriched
    await waitFor(() => {
      // The name column should have the 5.0% null title from the DataTableHeader null bar
      expect(screen.getByTitle('5.0% null')).toBeInTheDocument();
    });
  });

  it('opens profile panel when column info button clicked', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test_model' } });

    // Wait for data and profile to load
    await waitFor(() => {
      expect(screen.getAllByTitle('View column profile').length).toBeGreaterThan(0);
    });

    // Click the first column's info button
    fireEvent.click(screen.getAllByTitle('View column profile')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close profile panel')).toBeInTheDocument();
    });
  });

  it('closes profile panel when close button clicked', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test_model' } });

    await waitFor(() => {
      expect(screen.getAllByTitle('View column profile').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByTitle('View column profile')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close profile panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close profile panel'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Close profile panel')).not.toBeInTheDocument();
    });
  });

  it('handles profile failure gracefully', async () => {
    profileTableLocally.mockRejectedValue(new Error('DuckDB error'));

    renderComponent();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test_model' } });

    // Table should still render even though profile failed
    await waitFor(() => {
      expect(screen.getByText('Row 1')).toBeInTheDocument();
    });
  });
});
