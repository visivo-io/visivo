import { renderHook, waitFor } from '@testing-library/react';
import { useParquetData } from './useParquetData';
import * as queries from '../duckdb/queries';
import * as DuckDBContext from '../contexts/DuckDBContext';

jest.mock('../duckdb/queries');
jest.mock('../contexts/DuckDBContext');
jest.mock('./useDebounce', () => ({
  useDebounce: value => value,
  __esModule: true,
  default: value => value,
}));

const mockDb = {};

// Mock results keyed by SQL pattern
const describeResult = {
  toArray: () => [
    { toJSON: () => ({ column_name: 'id', column_type: 'INTEGER' }) },
    { toJSON: () => ({ column_name: 'name', column_type: 'VARCHAR' }) },
  ],
};

const countResult = {
  toArray: () => [{ toJSON: () => ({ total: 100 }) }],
};

const summarizeResult = {
  toArray: () => [
    {
      toJSON: () => ({
        column_name: 'id',
        column_type: 'INTEGER',
        null_percentage: '0',
        approx_unique: 100,
      }),
    },
    {
      toJSON: () => ({
        column_name: 'name',
        column_type: 'VARCHAR',
        null_percentage: '5.0',
        approx_unique: 50,
      }),
    },
  ],
};

const selectResult = {
  toArray: () => [
    { toJSON: () => ({ id: 1, name: 'Alice' }) },
    { toJSON: () => ({ id: 2, name: 'Bob' }) },
  ],
};

const mockRunDuckDBQuery = sql => {
  if (sql.startsWith('DESCRIBE')) return Promise.resolve(describeResult);
  if (sql.startsWith('SELECT COUNT')) return Promise.resolve(countResult);
  if (sql.startsWith('SUMMARIZE')) return Promise.resolve(summarizeResult);
  return Promise.resolve(selectResult);
};

describe('useParquetData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DuckDBContext.useDuckDB.mockReturnValue(mockDb);
    queries.loadParquetFromURL.mockResolvedValue();
    queries.runDuckDBQuery.mockImplementation((_db, sql) => mockRunDuckDBQuery(sql));
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() =>
      useParquetData({ url: '/api/files/abc/', tableName: 'test_table' })
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('loads parquet and returns data', async () => {
    const { result } = renderHook(() =>
      useParquetData({ url: '/api/files/abc/', tableName: 'test_table' })
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(queries.loadParquetFromURL).toHaveBeenCalledWith(
      mockDb,
      '/api/files/abc/',
      'test_table',
      false
    );
    expect(result.current.columns).toHaveLength(2);
    expect(result.current.columns[0].name).toBe('id');
    expect(result.current.totalRowCount).toBe(100);
    expect(result.current.rows).toHaveLength(2);
  });

  it('returns column stats from SUMMARIZE', async () => {
    const { result } = renderHook(() =>
      useParquetData({ url: '/api/files/abc/', tableName: 'test_table' })
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.columnStats.name.nullPercentage).toBe(5.0);
    expect(result.current.columnStats.id.nullPercentage).toBe(0);
  });

  it('handles errors', async () => {
    queries.loadParquetFromURL.mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() =>
      useParquetData({ url: '/api/files/bad/', tableName: 'fail_table' })
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Fetch failed');
    });
  });

  it('exposes tableName for external queries', () => {
    const { result } = renderHook(() =>
      useParquetData({ url: '/api/files/abc/', tableName: 'my_table' })
    );
    expect(result.current.tableName).toBe('my_table');
  });
});
