import { renderHook } from '@testing-library/react';
import { useLoadDataToDuckDB } from '../useLoadDataToDuckDb';
import { batchInsertData } from '../utilities/batchInsertData';

jest.mock('../utilities/batchInsertData', () => ({
  batchInsertData: jest.fn().mockResolvedValue({
    insertedRows: 1,
    errorRows: 1
  })
}));

describe('useLoadDataToDuckDB', () => {
  // Hook initialization
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('hook initialization', () => {
    it('should return loadDataToDuckDB function', () => {
      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB: jest.fn(),
        tableData: []
      }));

      expect(typeof result.current).toBe('function');
    })
  });

  // Parameter validation
  describe('parameter validation', () => {
    it('should require setIsLoadingDuckDB parameter', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => { });
      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB: null,
        tableData: []
      }));

      // call load data to duck db
      await result.current(null, []);

      expect(console.error).toHaveBeenCalledWith("setIsLoadingDuckDB is required");
    })

    it('should handle empty tableData', async () => {
      const setIsLoadingDuckDB = jest.fn();
      const mockDb = { connect: jest.fn() };

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: []
      }));

      // Call the returned function
      const outcome = await result.current(mockDb);

      // Verify early return behavior
      expect(mockDb.connect).not.toHaveBeenCalled();
      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(true);
      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(outcome).toBeUndefined();
    });

    it('should prefer dataToLoad parameter over tableData prop', () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };
      const setIsLoadingDuckDB = jest.fn();
      const tableData = [{ id: 1, name: 'Test' }];
      const dataToLoad = [{ id: 2, name: 'Override' }];

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData
      }));

      // Call the returned function with dataToLoad
      result.current(mockDb, dataToLoad);

      expect(mockDb.connect).toHaveBeenCalled();
      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(true);
    })
  });

  // Database operations
  describe('database operations', () => {
    it('should connect to database', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: [] // Empty array causes early return
      }));

      // Call the function with sample data to prevent early return
      await result.current(mockDb, [{ id: 1, name: 'Test' }]);

      expect(mockDb.connect).toHaveBeenCalled();
    })

    it('should attempt to drop existing table', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: [] // Empty array causes early return
      }));

      // Call the function with sample data to prevent early return
      await result.current(mockDb, [{ id: 1, name: 'Test' }]);

      expect(mockConn.query).toHaveBeenCalledWith('DROP TABLE IF EXISTS table_data');
    })
    it('should create table with proper schema', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: [{ id: 1, name: 'Test' }] // Sample data
      }));

      // Call the function
      await result.current(mockDb);

      expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE table_data'));
      expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('"id" VARCHAR'));
      expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('"name" VARCHAR'));

    })
    it('should close connection when complete', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: [{ id: 1, name: 'Test' }] // Sample data
      }));

      // Call the function
      await result.current(mockDb);

      expect(mockConn.close).toHaveBeenCalled();
    })
    it('should handle connection errors', async () => {
      const mockDb = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };

      const setIsLoadingDuckDB = jest.fn();

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: []
      }));

      // Call the function
      await result.current(mockDb);

      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(true);
      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(false);
    })
  });

  // Loading state management
  describe('loading state management', () => {
    it('should set loading state to true at start', async () => {
      const setIsLoadingDuckDB = jest.fn();
      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: []
      }));

      // Call the function
      await result.current(null, []);

      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(true);
    })

    it('should set loading state to false when complete', async () => {
      const setIsLoadingDuckDB = jest.fn();
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: [{ id: 1, name: 'Test' }] // Sample data
      }));

      // Call the function
      await result.current(mockDb);

      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(false);
    })

    it('should set loading state to false when errors occur', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => { });
      const setIsLoadingDuckDB = jest.fn();
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData: []
      }));

      // Call the function
      await result.current(mockDb);

      expect(setIsLoadingDuckDB).toHaveBeenCalledWith(false);
    })
  });

  // Data insertion
  describe('data insertion', () => {
    it('should call batchInsertData with correct parameters', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();
      const tableData = [{ id: 1, name: 'Test' }];

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData
      }));

      // Call the function
      await result.current(mockDb);

      expect(batchInsertData).toHaveBeenCalledWith(
        mockConn,
        tableData,  // The data array 
        { "id": "VARCHAR", "name": "VARCHAR" }  // The column types object
      );
    })

    it('should return counts', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDb = {
        connect: jest.fn().mockResolvedValue(mockConn)
      };

      const setIsLoadingDuckDB = jest.fn();
      const tableData = [{ id: 1, name: 'Test' }];

      const { result } = renderHook(() => useLoadDataToDuckDB({
        setIsLoadingDuckDB,
        tableData
      }));

      // Call the function
      const outcome = await result.current(mockDb);

      expect(outcome).toEqual({
        insertedRows: 1,
        errorRows: 1,
        success: true
      });
      expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('SELECT COUNT(*) FROM table_data'));
    })
  });
});