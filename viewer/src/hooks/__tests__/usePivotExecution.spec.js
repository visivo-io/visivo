import { renderHook } from '@testing-library/react';
import { usePivotExecution } from '../usePivotExecution';
import createSanitizedValueSql from '../../components/items/table-helpers/create-sanitized-value-sql/createSanitizedValueSql';
import sanitizeColumnName from '../../components/items/table-helpers/sanitizeColumnName';
import { generatePivotQuery } from '../../components/items/table-helpers/generate-pivot-query/generatePivotQuery';

// Mock dependencies
jest.mock('../../components/items/table-helpers/create-sanitized-value-sql/createSanitizedValueSql');
jest.mock('../../components/items/table-helpers/sanitizeColumnName');
jest.mock('../../components/items/table-helpers/generate-pivot-query/generatePivotQuery', () => ({
  generatePivotQuery: jest.fn()
}));

describe('usePivotExecution', () => {
  // Helper to create fresh mocks for each test
  const createMocks = (overrides = {}) => {
    const defaultMockQuery = {
      schema: {
        fields: [{ name: 'category' }, { name: 'region' }]
      },
      toArray: jest.fn().mockResolvedValue([
        { category: 'A', region: 'North' },
        { category: 'A', region: 'South' },
        { category: 'B', region: 'North' },
        { category: 'B', region: 'South' },
      ])
    };

    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce(overrides.schemaQuery || defaultMockQuery)
        .mockResolvedValueOnce(overrides.distinctQuery || {
          toArray: jest.fn().mockResolvedValue([
            { region: 'North' },
            { region: 'South' },
          ])
        }),
      close: jest.fn().mockResolvedValue(undefined)
    };

    const mockDb = {
      connect: jest.fn().mockResolvedValue(mockConn)
    };

    const setPivotLoading = jest.fn();
    const onPivotComplete = jest.fn();

    return {
      mockDb,
      mockConn,
      setPivotLoading,
      onPivotComplete,
      mockQuery: defaultMockQuery
    };
  };

  // Helper function to set up basic mocks
  const setupBasicMocks = () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    createSanitizedValueSql.mockReturnValue('"value_field"');
    sanitizeColumnName.mockImplementation((name) => name.replace(/[^a-zA-Z0-9_]/g, '_'));
    generatePivotQuery.mockResolvedValue({
      data: [
        { category: 'A', region_North: 100, region_South: 200 },
        { category: 'B', region_North: 150, region_South: 250 },
      ],
      columns: [
        { id: 'category', header: 'category', accessorKey: 'category' },
        { id: 'region_North', header: 'region_North', accessorKey: 'region_North' },
        { id: 'region_South', header: 'region_South', accessorKey: 'region_South' },
      ]
    });
  };

  // Keep afterEach for cleanup
  afterEach(() => {
    jest.clearAllMocks();
    console.log.mockRestore?.();
    console.error.mockRestore?.();
  });

  describe('hook initialization', () => {
    it('should return executePivot function', () => {
      const { mockDb } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      expect(result.current).toHaveProperty('executePivot');
      expect(typeof result.current.executePivot).toBe('function');
    });

    it('should memoize executePivot with useCallback', () => {
      const { mockDb } = createMocks();
      const { result, rerender } = renderHook(() => usePivotExecution(mockDb));
      
      const firstExecutePivot = result.current.executePivot;
      rerender();
      const secondExecutePivot = result.current.executePivot;
      
      expect(firstExecutePivot).toBe(secondExecutePivot);
    });

    it('should recreate executePivot when db changes', () => {
      const { mockDb } = createMocks();
      const { result, rerender } = renderHook(
        ({ db }) => usePivotExecution(db),
        { initialProps: { db: mockDb } }
      );
      
      const firstExecutePivot = result.current.executePivot;
      
      const newMockDb = { connect: jest.fn() };
      rerender({ db: newMockDb });
      
      const secondExecutePivot = result.current.executePivot;
      expect(firstExecutePivot).not.toBe(secondExecutePivot);
    });
  });

  describe('executePivot function', () => {
    it('should execute successful pivot operation', async () => {
      setupBasicMocks();
      
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(setPivotLoading).toHaveBeenCalledWith(true);
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockConn.query).toHaveBeenCalledTimes(2); // Schema + distinct queries
      expect(generatePivotQuery).toHaveBeenCalledWith({
        conn: mockConn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });
      expect(onPivotComplete).toHaveBeenCalledWith(
        [
          { category: 'A', region_North: 100, region_South: 200 },
          { category: 'B', region_North: 150, region_South: 250 },
        ],
        [
          { id: 'category', header: 'category', accessorKey: 'category' },
          { id: 'region_North', header: 'region_North', accessorKey: 'region_North' },
          { id: 'region_South', header: 'region_South', accessorKey: 'region_South' },
        ]
      );
      expect(setPivotLoading).toHaveBeenCalledWith(false);
      expect(mockConn.close).toHaveBeenCalled();
    });

    it('should handle early return when db is null', async () => {
      const { setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(null));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(setPivotLoading).not.toHaveBeenCalled();
      expect(onPivotComplete).not.toHaveBeenCalled();
      expect(generatePivotQuery).not.toHaveBeenCalled();
    });

    it('should handle early return when valueField is missing', async () => {
      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: '',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(setPivotLoading).not.toHaveBeenCalled();
      expect(onPivotComplete).not.toHaveBeenCalled();
      expect(generatePivotQuery).not.toHaveBeenCalled();
    });

    it('should handle early return when rowFields is empty', async () => {
      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: [],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(setPivotLoading).not.toHaveBeenCalled();
      expect(onPivotComplete).not.toHaveBeenCalled();
      expect(generatePivotQuery).not.toHaveBeenCalled();
    });

    it('should handle no column fields selected', async () => {
      setupBasicMocks();
      
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: [],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(setPivotLoading).toHaveBeenCalledWith(true);
      expect(console.log).toHaveBeenCalledWith('No column fields selected.');
      expect(onPivotComplete).not.toHaveBeenCalled();
      expect(generatePivotQuery).not.toHaveBeenCalled();
      expect(setPivotLoading).toHaveBeenCalledWith(false);
      expect(mockConn.close).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      setupBasicMocks();
      
      const error = new Error('Database connection failed');
      const mockDb = {
        connect: jest.fn().mockRejectedValue(error)
      };
      const setPivotLoading = jest.fn();
      const onPivotComplete = jest.fn();

      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(console.error).toHaveBeenCalledWith('Error executing pivot query:', error);
      expect(setPivotLoading).toHaveBeenCalledWith(false);
      expect(generatePivotQuery).not.toHaveBeenCalled();
    });

    it('should always close connection in finally block', async () => {
      setupBasicMocks();
      
      const error = new Error('Query failed');
      const mockConn = {
        query: jest.fn().mockRejectedValue(error),
        close: jest.fn().mockResolvedValue(undefined)
      };
      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };
      const setPivotLoading = jest.fn();
      const onPivotComplete = jest.fn();

      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(mockConn.close).toHaveBeenCalled();
      expect(setPivotLoading).toHaveBeenCalledWith(false);
    });

    it('should handle generatePivotQuery errors', async () => {
      setupBasicMocks();
      const error = new Error('Pivot generation failed');
      generatePivotQuery.mockRejectedValue(error);

      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(console.error).toHaveBeenCalledWith('Error executing pivot query:', error);
      expect(setPivotLoading).toHaveBeenCalledWith(false);
      expect(mockConn.close).toHaveBeenCalled();
    });
  });

  describe('column name mapping', () => {
    it('should handle columns with dots in names', async () => {
      setupBasicMocks();
      
      const mockQuery = {
        schema: {
          fields: [
            { name: 'product.name' },
            { name: 'category.type' }
          ]
        }
      };

      const { mockConn, setPivotLoading, onPivotComplete } = createMocks({
        schemaQuery: mockQuery
      });

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['product_name'],
        columnFields: ['category_type'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(mockConn.query).toHaveBeenCalledWith('SELECT * FROM table_data LIMIT 1');
      expect(generatePivotQuery).toHaveBeenCalledWith({
        conn: mockConn,
        safeRowFields: ['product.name'], // Should map to actual DB column
        safeColFields: ['category.type'], // Should map to actual DB column
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      });
    });

    it('should use createSanitizedValueSql for value field', async () => {
      setupBasicMocks();
      
      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales.amount',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(createSanitizedValueSql).toHaveBeenCalledWith('sales.amount');
    });
  });

  describe('data type conversion', () => {
    it('should convert bigint values to numbers', async () => {
      setupBasicMocks();
      generatePivotQuery.mockResolvedValue({
        data: [{ category: 'A', total: BigInt(12345) }],
        columns: [{ id: 'category', header: 'category', accessorKey: 'category' }]
      });

      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(onPivotComplete).toHaveBeenCalledWith(
        [{ category: 'A', total: 12345 }],
        expect.any(Array)
      );
    });

    it('should convert numeric strings to numbers', async () => {
      setupBasicMocks();
      generatePivotQuery.mockResolvedValue({
        data: [{ category: 'A', total: '123.45' }],
        columns: [{ id: 'category', header: 'category', accessorKey: 'category' }]
      });

      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(onPivotComplete).toHaveBeenCalledWith(
        [{ category: 'A', total: 123.45 }],
        expect.any(Array)
      );
    });

    it('should preserve non-numeric strings', async () => {
      setupBasicMocks();
      generatePivotQuery.mockResolvedValue({
        data: [{ category: 'Product A', region: 'North' }],
        columns: [
          { id: 'category', header: 'category', accessorKey: 'category' },
          { id: 'region', header: 'region', accessorKey: 'region' }
        ]
      });

      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(onPivotComplete).toHaveBeenCalledWith(
        [{ category: 'Product A', region: 'North' }],
        expect.any(Array)
      );
    });
  });

  describe('generatePivotQuery integration', () => {
    it('should pass correct parameters to generatePivotQuery', async () => {
      setupBasicMocks();
      
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'COUNT',
        setPivotLoading,
        onPivotComplete
      });

      expect(generatePivotQuery).toHaveBeenCalledWith({
        conn: mockConn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'COUNT'
      });
    });

    it('should handle different aggregate functions', async () => {
      setupBasicMocks();
      
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'AVG',
        setPivotLoading,
        onPivotComplete
      });

      expect(generatePivotQuery).toHaveBeenCalledWith({
        conn: mockConn,
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'AVG'
      });
    });
  });

  describe('column generation', () => {
    it('should sanitize column names for accessorKey and id', async () => {
      setupBasicMocks();
      sanitizeColumnName.mockImplementation((name) => name.replace(/[^a-zA-Z0-9_]/g, '_'));
      
      generatePivotQuery.mockResolvedValue({
        data: [{ 'category name': 'A', 'region-north': 100 }],
        columns: [
          { id: 'category name', header: 'category name', accessorKey: 'category name' },
          { id: 'region-north', header: 'region-north', accessorKey: 'region-north' }
        ]
      });

      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));
      
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(sanitizeColumnName).toHaveBeenCalledWith('category name');
      expect(sanitizeColumnName).toHaveBeenCalledWith('region-north');
    });
  });
});