/**
 * @jest-environment jsdom
 */

import { DuckDBService } from './duckdbService';

// Mock DuckDB WASM since it requires browser environment
jest.mock('@duckdb/duckdb-wasm', () => ({
  selectBundle: jest.fn().mockResolvedValue({
    mainModule: '/mock/duckdb.wasm',
    mainWorker: '/mock/duckdb.worker.js'
  }),
  ConsoleLogger: jest.fn().mockImplementation(() => ({})),
  AsyncDuckDB: jest.fn().mockImplementation(() => ({
    instantiate: jest.fn().mockResolvedValue(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({
        toArray: jest.fn().mockReturnValue([
          new Map([['cohort_value', 'Product A'], ['columns.x_data', ['Jan', 'Feb']], ['columns.y_data', [100, 150]]]),
          new Map([['cohort_value', 'Product B'], ['columns.x_data', ['Jan', 'Feb']], ['columns.y_data', [200, 250]]])
        ])
      }),
      insertJSONFromPath: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue()
    }),
    terminate: jest.fn().mockResolvedValue()
  }))
}));

// Mock Worker
global.Worker = jest.fn().mockImplementation(() => ({}));

describe('DuckDBService', () => {
  let service;

  beforeEach(() => {
    service = new DuckDBService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (service.initialized) {
      await service.cleanup();
    }
  });

  describe('initialization', () => {
    it('should initialize DuckDB WASM successfully', async () => {
      await service.initialize();
      
      expect(service.initialized).toBe(true);
      expect(service.db).toBeDefined();
      expect(service.conn).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      const firstDb = service.db;
      
      await service.initialize();
      
      expect(service.db).toBe(firstDb);
    });
  });

  describe('data loading', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should load data into a table', async () => {
      const testData = {
        'columns.x_data': [['Jan', 'Feb'], ['Mar', 'Apr']],
        'columns.y_data': [[100, 150], [200, 250]]
      };

      await service.loadData('test_table', testData);

      expect(service.conn.insertJSONFromPath).toHaveBeenCalledWith(
        'test_table',
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              'columns.x_data': ['Jan', 'Feb'],
              'columns.y_data': [100, 150]
            }),
            expect.objectContaining({
              'columns.x_data': ['Mar', 'Apr'],
              'columns.y_data': [200, 250]
            })
          ])
        })
      );
    });

    it('should handle empty data', async () => {
      const testData = {};

      await expect(service.loadData('empty_table', testData))
        .rejects.toThrow('No data columns provided');
    });

    it('should convert single values to row format', async () => {
      const testData = {
        'single_col': 'single_value'
      };

      await service.loadData('single_table', testData);

      expect(service.conn.insertJSONFromPath).toHaveBeenCalledWith(
        'single_table',
        expect.objectContaining({
          data: [{ 'single_col': 'single_value' }]
        })
      );
    });
  });


  describe('query execution', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should execute SQL queries', async () => {
      const mockResult = {
        toArray: () => [
          new Map([['col1', 'val1'], ['col2', 'val2']])
        ]
      };
      service.conn.query.mockResolvedValueOnce(mockResult);

      const result = await service.executeQuery('SELECT * FROM test');

      expect(service.conn.query).toHaveBeenCalledWith('SELECT * FROM test');
      expect(result).toEqual([{ col1: 'val1', col2: 'val2' }]);
    });

    it('should handle query errors', async () => {
      service.conn.query.mockRejectedValueOnce(new Error('SQL error'));

      await expect(service.executeQuery('INVALID SQL'))
        .rejects.toThrow('Query failed: SQL error');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await service.initialize();
      
      await service.cleanup();

      expect(service.conn.close).toHaveBeenCalled();
      expect(service.db.terminate).toHaveBeenCalled();
      expect(service.initialized).toBe(false);
    });

    it('should handle cleanup errors gracefully', async () => {
      await service.initialize();
      service.conn.close.mockRejectedValueOnce(new Error('Close failed'));

      // Should not throw
      await service.cleanup();
      
      expect(service.initialized).toBe(false);
    });
  });
});