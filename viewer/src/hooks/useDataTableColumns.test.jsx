import { renderHook } from '@testing-library/react';
import { useDataTableColumns } from './useDataTableColumns.jsx';
import { calculateColumnWidth } from '../duckdb/schemaUtils';

// Mock the child components to avoid importing their full dependency trees
jest.mock('../components/common/DataTableHeader', () => {
  return function MockDataTableHeader() {
    return null;
  };
});

jest.mock('../components/common/DataTableCell', () => {
  return function MockDataTableCell() {
    return null;
  };
});

const testColumns = [
  { name: 'id', normalizedType: 'number', duckdbType: 'INTEGER', nullPercentage: 0 },
  { name: 'user_name', normalizedType: 'string', duckdbType: 'VARCHAR', nullPercentage: 5 },
  { name: 'created_at', normalizedType: 'timestamp', duckdbType: 'TIMESTAMP', nullPercentage: 0 },
];

describe('useDataTableColumns', () => {
  it('returns correct number of column definitions', () => {
    const { result } = renderHook(() =>
      useDataTableColumns({
        columns: testColumns,
        sorting: null,
        onSortChange: jest.fn(),
        onColumnProfileRequest: jest.fn(),
      })
    );

    expect(result.current).toHaveLength(3);
  });

  it('sets id and accessorKey from column name', () => {
    const { result } = renderHook(() =>
      useDataTableColumns({
        columns: testColumns,
        sorting: null,
        onSortChange: jest.fn(),
        onColumnProfileRequest: jest.fn(),
      })
    );

    expect(result.current[0].id).toBe('id');
    expect(result.current[0].accessorKey).toBe('id');
    expect(result.current[1].id).toBe('user_name');
    expect(result.current[1].accessorKey).toBe('user_name');
  });

  it('sets size from calculateColumnWidth', () => {
    const { result } = renderHook(() =>
      useDataTableColumns({
        columns: testColumns,
        sorting: null,
        onSortChange: jest.fn(),
        onColumnProfileRequest: jest.fn(),
      })
    );

    testColumns.forEach((col, i) => {
      const expectedWidth = calculateColumnWidth(col.name, col.normalizedType);
      expect(result.current[i].size).toBe(expectedWidth);
    });
  });

  it('sets minSize for resize support', () => {
    const { result } = renderHook(() =>
      useDataTableColumns({
        columns: testColumns,
        sorting: null,
        onSortChange: jest.fn(),
        onColumnProfileRequest: jest.fn(),
      })
    );

    result.current.forEach(col => {
      expect(col.minSize).toBe(60);
    });
  });

  it('includes header and cell renderers', () => {
    const { result } = renderHook(() =>
      useDataTableColumns({
        columns: testColumns,
        sorting: null,
        onSortChange: jest.fn(),
        onColumnProfileRequest: jest.fn(),
      })
    );

    result.current.forEach(col => {
      expect(typeof col.header).toBe('function');
      expect(typeof col.cell).toBe('function');
    });
  });
});
