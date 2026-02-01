import { renderHook, waitFor, act } from '@testing-library/react';
import { useTableData } from './useTableData';
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

const describeResult = {
  toArray: () => [
    { toJSON: () => ({ column_name: 'id', column_type: 'INTEGER' }) },
    { toJSON: () => ({ column_name: 'name', column_type: 'VARCHAR' }) },
  ],
};

const countResult = {
  toArray: () => [{ toJSON: () => ({ total: 100 }) }],
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
  return Promise.resolve(selectResult);
};

describe('useTableData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DuckDBContext.useDuckDB.mockReturnValue(mockDb);
    queries.runDuckDBQuery.mockImplementation((_db, sql) => mockRunDuckDBQuery(sql));
  });

  it('returns loading state initially when tableName is set', () => {
    const { result } = renderHook(() => useTableData({ tableName: 'test_table' }));
    expect(result.current.isLoading).toBe(true);
  });

  it('discovers schema and loads data', async () => {
    const { result } = renderHook(() => useTableData({ tableName: 'test_table' }));

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.columns).toHaveLength(2);
    expect(result.current.columns[0].name).toBe('id');
    expect(result.current.columns[1].name).toBe('name');
    expect(result.current.totalRowCount).toBe(100);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles errors', async () => {
    queries.runDuckDBQuery.mockRejectedValue(new Error('Query failed'));

    const { result } = renderHook(() => useTableData({ tableName: 'bad_table' }));

    await waitFor(() => {
      expect(result.current.error).toBe('Query failed');
    });
  });

  it('returns empty state when no tableName', () => {
    const { result } = renderHook(() => useTableData({ tableName: null }));
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.columns).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('supports pagination', async () => {
    const { result } = renderHook(() => useTableData({ tableName: 'test_table' }));

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.page).toBe(0);
    expect(result.current.pageSize).toBe(1000);
    expect(result.current.pageCount).toBe(1);

    act(() => {
      result.current.setPage(1);
    });

    expect(result.current.page).toBe(1);
  });

  it('supports sorting', async () => {
    const { result } = renderHook(() => useTableData({ tableName: 'test_table' }));

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.setSorting({ column: 'name', direction: 'asc' });
    });

    await waitFor(() => {
      expect(
        queries.runDuckDBQuery.mock.calls.find(([, sql]) => sql.includes('ORDER BY'))
      ).toBeTruthy();
    });

    const sortCall = queries.runDuckDBQuery.mock.calls.find(
      ([, sql]) => sql.includes('ORDER BY')
    );
    expect(sortCall[1]).toContain('ORDER BY "name" ASC');
  });
});
