import { renderHook, act } from '@testing-library/react';
import { useLoadDataToDuckDB } from './useLoadDataToDuckDb';
import detectColumnType from '../components/items/table-helpers/detectColumnType';
import isAggregateable from '../components/items/table-helpers/isAggregatable';
import { batchInsertData } from './utilities/batchInsertData';

// Mock the helper functions and utilities
jest.mock('../components/items/table-helpers/detectColumnType');
jest.mock('../components/items/table-helpers/isAggregatable');
jest.mock('./utilities/batchInsertData');

const mockDetectColumnType = detectColumnType;
const mockIsAggregateable = isAggregateable;
const mockBatchInsertData = batchInsertData;

describe('useLoadDataToDuckDB', () => {
  let mockDbInstance;
  let mockConnection;
  let mockSetIsLoadingDuckDB;

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    console.log = jest.fn();

    mockConnection = {
      query: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    };

    mockDbInstance = {
      connect: jest.fn().mockResolvedValue(mockConnection),
    };

    mockSetIsLoadingDuckDB = jest.fn();

    // Default mock implementations
    mockDetectColumnType.mockReturnValue('string');
    mockIsAggregateable.mockReturnValue(false);
    mockBatchInsertData.mockResolvedValue({
      insertedRows: 100,
      errorRows: 0
    });
  });

  describe('hook initialization', () => {
    it('should return a function', () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [],
        })
      );

      expect(typeof result.current).toBe('function');
    });

    it('should handle missing setIsLoadingDuckDB', async () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: null,
          tableData: [],
        })
      );

      await act(async () => {
        const response = await result.current(mockDbInstance, []);
      });

      expect(console.error).toHaveBeenCalledWith('setIsLoadingDuckDB is required');
    });
  });

  describe('data loading', () => {
    const sampleData = [
      { name: 'John', age: 30, salary: 50000 },
      { name: 'Jane', age: 25, salary: 60000 },
      { name: 'Bob', age: 35, salary: 55000 },
    ];

    it('should load data successfully', async () => {
      mockDetectColumnType.mockImplementation((data, key) => {
        if (key === 'age' || key === 'salary') return 'number';
        return 'string';
      });
      
      mockIsAggregateable.mockImplementation((type) => type === 'number');

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, sampleData);
      });

      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(true);
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(mockDbInstance.connect).toHaveBeenCalled();
      expect(mockConnection.query).toHaveBeenCalledWith('DROP TABLE IF EXISTS table_data');
      expect(mockConnection.query).toHaveBeenCalledWith(
        'CREATE TABLE table_data ("name" VARCHAR, "age" DOUBLE, "salary" DOUBLE)'
      );
      expect(mockBatchInsertData).toHaveBeenCalledWith(
        mockConnection,
        sampleData,
        { name: 'VARCHAR', age: 'DOUBLE', salary: 'DOUBLE' }
      );
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM table_data');
      expect(mockConnection.close).toHaveBeenCalled();
      expect(response).toEqual({
        success: true,
        insertedRows: 100,
        errorRows: 0
      });
    });

    it('should handle empty data', async () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [],
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, []);
      });

      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(true);
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(mockDbInstance.connect).not.toHaveBeenCalled();
      expect(mockBatchInsertData).not.toHaveBeenCalled();
    });

    it('should handle null data', async () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: null,
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, null);
      });

      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(true);
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(mockDbInstance.connect).not.toHaveBeenCalled();
      expect(mockBatchInsertData).not.toHaveBeenCalled();
    });

    it('should use tableData when dataToLoad is not provided', async () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      await act(async () => {
        await result.current(mockDbInstance); // No dataToLoad provided
      });

      expect(mockDbInstance.connect).toHaveBeenCalled();
      expect(mockBatchInsertData).toHaveBeenCalledWith(
        mockConnection,
        sampleData,
        expect.any(Object)
      );
    });

    it('should handle database connection errors', async () => {
      mockDbInstance.connect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, sampleData);
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeInstanceOf(Error);
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(mockBatchInsertData).not.toHaveBeenCalled();
    });

    it('should handle table creation errors', async () => {
      mockConnection.query.mockImplementation((query) => {
        if (query.includes('CREATE TABLE')) {
          throw new Error('Table creation failed');
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, sampleData);
      });

      expect(response.success).toBe(false);
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
      expect(mockBatchInsertData).not.toHaveBeenCalled();
    });

    it('should handle drop table errors quietly', async () => {
      mockConnection.query.mockImplementation((query) => {
        if (query.includes('DROP TABLE')) {
          throw new Error('Drop table failed');
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      await act(async () => {
        await result.current(mockDbInstance, sampleData);
      });

      expect(console.log).toHaveBeenCalledWith('Error dropping table:', expect.any(Error));
      expect(mockBatchInsertData).toHaveBeenCalled(); // Should continue despite drop error
    });

    it('should handle verification query errors silently', async () => {
      mockConnection.query.mockImplementation((query) => {
        if (query.includes('SELECT COUNT')) {
          throw new Error('Verification failed');
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: sampleData,
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, sampleData);
      });

      expect(response.success).toBe(true); // Should still succeed
      expect(mockBatchInsertData).toHaveBeenCalled();
    });
  });

  describe('utility integration', () => {
    it('should pass correct parameters to batchInsertData', async () => {
      const testData = [
        { name: 'Test', value: 123 }
      ];

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: testData,
        })
      );

      await act(async () => {
        await result.current(mockDbInstance, testData);
      });

      expect(mockBatchInsertData).toHaveBeenCalledWith(
        mockConnection,
        testData,
        { name: 'VARCHAR', value: 'VARCHAR' }
      );
    });

    it('should handle batchInsertData errors', async () => {
      mockBatchInsertData.mockRejectedValue(new Error('Batch insert failed'));

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [{ test: 'data' }],
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, [{ test: 'data' }]);
      });

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Batch insert failed');
      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledWith(false);
    });

    it('should return results from batchInsertData', async () => {
      mockBatchInsertData.mockResolvedValue({
        insertedRows: 500,
        errorRows: 25
      });

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [{ test: 'data' }],
        })
      );

      let response;
      await act(async () => {
        response = await result.current(mockDbInstance, [{ test: 'data' }]);
      });

      expect(response).toEqual({
        success: true,
        insertedRows: 500,
        errorRows: 25
      });
    });
  });

  describe('loading state management', () => {
    it('should set loading state correctly during successful operation', async () => {
      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [{ test: 'data' }],
        })
      );

      await act(async () => {
        await result.current(mockDbInstance, [{ test: 'data' }]);
      });

      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledTimes(2);
      expect(mockSetIsLoadingDuckDB).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsLoadingDuckDB).toHaveBeenNthCalledWith(2, false);
    });

    it('should reset loading state even when operation fails', async () => {
      mockDbInstance.connect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() =>
        useLoadDataToDuckDB({
          setIsLoadingDuckDB: mockSetIsLoadingDuckDB,
          tableData: [{ test: 'data' }],
        })
      );

      await act(async () => {
        await result.current(mockDbInstance, [{ test: 'data' }]);
      });

      expect(mockSetIsLoadingDuckDB).toHaveBeenCalledTimes(2);
      expect(mockSetIsLoadingDuckDB).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsLoadingDuckDB).toHaveBeenNthCalledWith(2, false);
    });
  });
});