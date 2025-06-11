import generatePivotQuery from "../components/items/table-helpers/generatePivotQuery";
import { renderHook } from "@testing-library/react";
import { usePivotExecution } from "./usePivotExecution";

jest.mock('../components/items/table-helpers/generatePivotQuery', () =>
  jest.fn().mockResolvedValue({
    data: [{ result: 'data' }],
    columns: [{ id: 'column' }]
  })
);
// Helper to create fresh mocks for each test
const createMocks = () => {
  const mockSchemaQuery = {
    schema: {
      fields: [
        { name: 'category' },
        { name: 'region' },
        { name: 'product.name' } // Column with dot
      ]
    }
  };

  const mockConn = {
    query: jest.fn().mockResolvedValue(mockSchemaQuery),
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
    onPivotComplete
  };
};

describe('usePivotExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Reset the mock for generatePivotQuery

  });
  // Test hook initialization
  describe('hook initialization', () => {
    it('should return executePivot function', () => {
      const { result } = renderHook(() => usePivotExecution(null));
      expect(result.current.executePivot).toBeInstanceOf(Function);
    });
  });

  // Test early returns
  describe('early returns', () => {
    it('should return early when db is null', async () => {
      const { result } = renderHook(() => usePivotExecution(null));
      const returnValue = await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading: jest.fn(),
        onPivotComplete: jest.fn()
      });


      expect(returnValue).toBeUndefined();
    });

    it('should return early when valueField is empty', async () => {
      const { result } = renderHook(() => usePivotExecution({}));
      const returnValue = await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: '',
        aggregateFunc: 'SUM',
        setPivotLoading: jest.fn(),
        onPivotComplete: jest.fn()
      });

      expect(returnValue).toBeUndefined();
    });

    it('should return early when rowFields is empty', async () => {
      const { result } = renderHook(() => usePivotExecution({}));
      const returnValue = await result.current.executePivot({
        rowFields: [],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading: jest.fn(),
        onPivotComplete: jest.fn()
      });

      expect(returnValue).toBeUndefined();
    });
  });

  // Test database connection handling
  describe('database connection', () => {
    it('should connect to database and close connection when done', async () => {
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

      expect(mockDb.connect).toHaveBeenCalledTimes(1);
      expect(mockDb.connect).toHaveBeenCalledWith();
      expect(generatePivotQuery).toHaveBeenCalledTimes(1);
      expect(generatePivotQuery).toHaveBeenCalledWith(expect.objectContaining({
        conn: expect.anything(),
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales',
        aggregateFunc: 'SUM'
      }));

      expect(onPivotComplete).toHaveBeenCalledWith([{ result: 'data' }], [{ id: 'column' }]);
      expect(mockConn.close).toHaveBeenCalledTimes(1);
    });
    it('should handle connection errors', async () => {
      // Mock console.error to check it's called
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      const setPivotLoading = jest.fn();
      const { mockDb } = createMocks();
      mockDb.connect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => usePivotExecution(mockDb));

      // Call the hook function and await it properly
      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete: jest.fn()
      });

      // Verify the connection was attempted
      expect(mockDb.connect).toHaveBeenCalledTimes(1);

      // Verify error was logged to console
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error executing pivot query:",
        expect.objectContaining({ message: "Connection failed" })
      );

      // Verify loading state was reset
      expect(setPivotLoading).toHaveBeenCalledWith(false);

      // Restore console
      consoleSpy.mockRestore();
    });

    it('should always close connection even after errors', async () => {
      jest
        .spyOn(console, 'error')
        .mockImplementation(() => { });
      const { mockDb, mockConn } = createMocks();
      mockDb.connect.mockResolvedValue(mockConn);
      mockConn.query.mockRejectedValue(new Error('Query failed'));

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

      expect(mockConn.close).toHaveBeenCalledTimes(1);
    });
  });

  // Test column mapping functionality 
  describe('column mapping', () => {
    it('should map column names from schema', async () => {
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

      expect(mockConn.query).toHaveBeenCalledWith('SELECT * FROM table_data LIMIT 1');
      expect(generatePivotQuery).toHaveBeenCalledWith(expect.objectContaining({
        safeRowFields: ['category'],
        safeColFields: ['region'],
        safeValField: 'sales'
      }));
    });
    it('should handle columns with dots in names', async () => {
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));

      await result.current.executePivot({
        rowFields: ['product.name'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(mockConn.query).toHaveBeenCalledWith('SELECT * FROM table_data LIMIT 1');
      expect(generatePivotQuery).toHaveBeenCalledWith(expect.objectContaining({
        safeRowFields: ['product.name'], // Should map to sanitized name
        safeColFields: ['region'],
        safeValField: 'sales'
      }));
    });
    it('should handle columns with -s in names', async () => {
      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));

      await result.current.executePivot({
        rowFields: ['product_name'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(mockConn.query).toHaveBeenCalledWith('SELECT * FROM table_data LIMIT 1');
      expect(generatePivotQuery).toHaveBeenCalledWith(expect.objectContaining({
        safeRowFields: ['product.name'], // Should map to sanitized name
        safeColFields: ['region'],
        safeValField: 'sales'
      }));
    });
    it('should pass mapped fields to generatePivotQuery', async () => { });
  });

  // Test generatePivotQuery integration
  describe('pivot execution', () => {
    it('should handle empty column fields', async () => {
      const consoleInfoSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => { });

      const { mockDb, setPivotLoading, onPivotComplete } = createMocks();
      const { result } = renderHook(() => usePivotExecution(mockDb));

      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: [],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(generatePivotQuery).not.toHaveBeenCalled();
      expect(onPivotComplete).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'No column fields selected.'
      );

      consoleInfoSpy.mockRestore();
    });

    it('should call onPivotComplete with query results', async () => {
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

      expect(generatePivotQuery).toHaveBeenCalledTimes(1);
      expect(onPivotComplete).toHaveBeenCalledWith(
        [{ result: 'data' }],
        [{ id: 'column' }]
      );
      expect(setPivotLoading).toHaveBeenCalledWith(false);
    });
    it('should handle query errors', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => { });

      const { mockDb, mockConn, setPivotLoading, onPivotComplete } = createMocks();
      mockConn.query.mockRejectedValue(new Error('Query failed'));

      const { result } = renderHook(() => usePivotExecution(mockDb));

      await result.current.executePivot({
        rowFields: ['category'],
        columnFields: ['region'],
        valueField: 'sales',
        aggregateFunc: 'SUM',
        setPivotLoading,
        onPivotComplete
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error executing pivot query:",
        expect.objectContaining({ message: "Query failed" })
      );
      expect(setPivotLoading).toHaveBeenCalledWith(false);
      expect(onPivotComplete).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});