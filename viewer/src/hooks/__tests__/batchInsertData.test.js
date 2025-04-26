import { batchInsertData } from '../utilities/batchInsertData';
import { formatValueForSql } from '../utilities/formatValueForSql';

// Mock the formatValueForSql function
jest.mock('../utilities/formatValueForSql', () => {
  return {
    formatValueForSql: jest.fn()
  };
});

const mockFormatValueForSql = formatValueForSql;

describe('batchInsertData', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConnection = {
      query: jest.fn().mockResolvedValue(undefined)
    };

    // Default mock implementation for formatValueForSql
    mockFormatValueForSql.mockImplementation((value, type) => {
      if (value === null || value === undefined) return 'NULL';
      if (type === 'DOUBLE') return typeof value === 'number' ? value : 'NULL';
      return `'${value}'`;
    });
  });

  describe('basic functionality', () => {
    it('should insert data in single batch when data size is less than batch size', async () => {
      const data = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes);

      expect(result.insertedRows).toBe(2);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(1);
      expect(mockConnection.query).toHaveBeenCalledWith(
        'INSERT INTO table_data ("id", "name") VALUES (1, \'John\'),\n(2, \'Jane\')'
      );
    });

    it('should handle empty data array', async () => {
      const result = await batchInsertData(mockConnection, [], {});

      expect(result.insertedRows).toBe(0);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('should handle data with single row', async () => {
      const data = [{ id: 1, name: 'John' }];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes);

      expect(result.insertedRows).toBe(1);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch processing', () => {
    it('should split data into multiple batches based on batch size', async () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes, 500);

      expect(result.insertedRows).toBe(1000);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(2); // 1000 ÷ 500 = 2 batches
    });

    it('should handle custom batch size', async () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes, 25);

      expect(result.insertedRows).toBe(100);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(4); // 100 ÷ 25 = 4 batches
    });

    it('should handle data size not evenly divisible by batch size', async () => {
      const data = Array.from({ length: 1250 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes, 500);

      expect(result.insertedRows).toBe(1250);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(3); // Math.ceil(1250 ÷ 500) = 3 batches
    });

    it('should use default batch size of 500', async () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      // Don't specify batch size - should use default 500
      await batchInsertData(mockConnection, data, columnTypes);

      expect(mockConnection.query).toHaveBeenCalledTimes(2); // 1000 ÷ 500 = 2 batches
    });
  });

  describe('SQL generation', () => {
    it('should generate correct SQL with multiple columns', async () => {
      const data = [
        { id: 1, name: 'John', age: 30, active: true }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR', age: 'DOUBLE', active: 'VARCHAR' };

      await batchInsertData(mockConnection, data, columnTypes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        'INSERT INTO table_data ("id", "name", "age", "active") VALUES (1, \'John\', 30, \'true\')'
      );
    });

    it('should call formatValueForSql for each value', async () => {
      const data = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      await batchInsertData(mockConnection, data, columnTypes);

      expect(mockFormatValueForSql).toHaveBeenCalledTimes(4); // 2 rows × 2 columns
      expect(mockFormatValueForSql).toHaveBeenCalledWith(1, 'DOUBLE');
      expect(mockFormatValueForSql).toHaveBeenCalledWith('John', 'VARCHAR');
      expect(mockFormatValueForSql).toHaveBeenCalledWith(2, 'DOUBLE');
      expect(mockFormatValueForSql).toHaveBeenCalledWith('Jane', 'VARCHAR');
    });

    it('should generate correct multi-row VALUES clause', async () => {
      const data = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      await batchInsertData(mockConnection, data, columnTypes);

      expect(mockConnection.query).toHaveBeenCalledWith(
        'INSERT INTO table_data ("id", "name") VALUES (1, \'John\'),\n(2, \'Jane\'),\n(3, \'Bob\')'
      );
    });
  });

  describe('error handling', () => {
    it('should handle query errors and count error rows', async () => {
      const data = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      mockConnection.query.mockRejectedValue(new Error('SQL Error'));

      const result = await batchInsertData(mockConnection, data, columnTypes);

      expect(result.insertedRows).toBe(0);
      expect(result.errorRows).toBe(2);
    });

    it('should handle partial batch failures', async () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      // Fail the second batch
      mockConnection.query
        .mockResolvedValueOnce(undefined) // First batch succeeds
        .mockRejectedValueOnce(new Error('SQL Error')); // Second batch fails

      const result = await batchInsertData(mockConnection, data, columnTypes, 500);

      expect(result.insertedRows).toBe(500); // First batch
      expect(result.errorRows).toBe(500);    // Second batch
    });

    it('should continue processing after a batch error', async () => {
      const data = Array.from({ length: 1500 }, (_, i) => ({
        id: i,
        name: `User${i}`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      // Fail the middle batch
      mockConnection.query
        .mockResolvedValueOnce(undefined)         // First batch succeeds
        .mockRejectedValueOnce(new Error('SQL Error')) // Second batch fails
        .mockResolvedValueOnce(undefined);        // Third batch succeeds

      const result = await batchInsertData(mockConnection, data, columnTypes, 500);

      expect(result.insertedRows).toBe(1000); // First + Third batch
      expect(result.errorRows).toBe(500);     // Second batch
      expect(mockConnection.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases', () => {
    it('should handle data with null and undefined values', async () => {
      const data = [
        { id: 1, name: null, age: undefined }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR', age: 'DOUBLE' };

      mockFormatValueForSql.mockImplementation((value, type) => {
        if (value === null || value === undefined) return 'NULL';
        return value;
      });

      await batchInsertData(mockConnection, data, columnTypes);

      expect(mockFormatValueForSql).toHaveBeenCalledWith(null, 'VARCHAR');
      expect(mockFormatValueForSql).toHaveBeenCalledWith(undefined, 'DOUBLE');
    });

    it('should handle empty batches gracefully', async () => {
      const data = []; // Empty data
      const columnTypes = {};

      const result = await batchInsertData(mockConnection, data, columnTypes, 100);

      expect(result.insertedRows).toBe(0);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('should handle data with varying column orders', async () => {
      const data = [
        { id: 1, name: 'John' },
        { name: 'Jane', id: 2 } // Different order
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      await batchInsertData(mockConnection, data, columnTypes);

      // Should use column order from first object
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('"id", "name"')
      );
    });

    it('should handle batch size larger than data size', async () => {
      const data = [
        { id: 1, name: 'John' }
      ];
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes, 1000);

      expect(result.insertedRows).toBe(1);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('performance considerations', () => {
    it('should process large datasets efficiently', async () => {
      const data = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const columnTypes = { id: 'DOUBLE', name: 'VARCHAR', email: 'VARCHAR' };

      const result = await batchInsertData(mockConnection, data, columnTypes);

      expect(result.insertedRows).toBe(10000);
      expect(result.errorRows).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledTimes(20); // 10000 ÷ 500 = 20 batches
    });
  });
});