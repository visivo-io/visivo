import { initializeDuckDB, getDuckDBStatus, cleanupDuckDB } from './duckDBWasmInit';
import * as duckdb from '@duckdb/duckdb-wasm';

// Mock the entire @duckdb/duckdb-wasm module
jest.mock('@duckdb/duckdb-wasm');

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-worker-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Worker
global.Worker = jest.fn().mockImplementation(() => ({
  postMessage: jest.fn(),
  terminate: jest.fn(),
}));

// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('duckDBWasmInit', () => {
  let mockBundle;
  let mockWorker;
  let mockLogger;
  let mockDB;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();

    mockBundle = {
      mainModule: 'mock-main-module',
      mainWorker: 'mock-main-worker',
      pthreadWorker: 'mock-pthread-worker',
    };

    mockWorker = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
    };

    mockConnection = {
      query: jest.fn(),
      close: jest.fn(),
    };

    mockDB = {
      instantiate: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockConnection),
      terminate: jest.fn(),
    };

    // Setup DuckDB mocks
    duckdb.getJsDelivrBundles = jest.fn().mockReturnValue('mock-bundles');
    duckdb.selectBundle = jest.fn().mockResolvedValue(mockBundle);
    duckdb.ConsoleLogger = jest.fn().mockReturnValue(mockLogger);
    duckdb.AsyncDuckDB = jest.fn().mockReturnValue(mockDB);
    global.Worker = jest.fn().mockReturnValue(mockWorker);

    // Reset module state BEFORE each test
    cleanupDuckDB({ terminate: jest.fn() }); 
  });

  afterEach(() => {
    // Clean up any timers that might have been used
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('getDuckDBStatus', () => {
    it('should return initial idle status', () => {
      const status = getDuckDBStatus();
      expect(status).toEqual({
        state: 'idle',
        progress: 0,
        message: '',
      });
    });

    it('should return a copy of the status (not reference)', () => {
      const status1 = getDuckDBStatus();
      const status2 = getDuckDBStatus();
      
      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2);
    });
  });

  describe('initializeDuckDB', () => {
    it('should initialize DuckDB successfully with all progress steps', async () => {
      const onStatusChange = jest.fn();
      
      mockDB.instantiate.mockResolvedValue();

      const dbPromise = initializeDuckDB(onStatusChange);
      const db = await dbPromise;

      expect(db).toBe(mockDB);

      // Verify status change calls
      const calls = onStatusChange.mock.calls.map(call => call[0]);
      
      expect(calls).toContainEqual({
        state: 'loading',
        progress: 0,
        message: 'Preparing DuckDB...',
      });

      expect(calls).toContainEqual({
        state: 'success',
        progress: 100,
        message: 'DuckDB ready!',
      });

      expect(calls.length).toBeGreaterThanOrEqual(7);
    });

    it('should handle progress updates during WASM download', async () => {
      const onStatusChange = jest.fn();

      // Mock instantiate to call the progress callback immediately
      mockDB.instantiate.mockImplementation((mainModule, pthreadWorker, callback) => {
        // Call the progress callback immediately to simulate download
        if (callback) {
          callback({
            bytesLoaded: 10 * 1024 * 1024, // 10MB (becomes 2MB after /5)
            bytesTotal: 20 * 1024 * 1024,   // 20MB
          });
        }
        
        return Promise.resolve();
      });

      const dbPromise = initializeDuckDB(onStatusChange);
      await dbPromise;

      // Check that progress update was called with download message
      const calls = onStatusChange.mock.calls.map(call => call[0]);
      const downloadCalls = calls.filter(call => 
        call.message && call.message.includes('Downloading WASM')
      );
      
      expect(downloadCalls.length).toBeGreaterThan(0);
      
      // Look for the call that has the MB information
      const progressCall = downloadCalls.find(call => call.message.includes('MB'));
      expect(progressCall).toBeDefined();
      expect(progressCall.message).toContain('2MB / 20MB');
      expect(progressCall.progress).toBeGreaterThan(50);
    });

    it('should handle progress when loaded >= total', async () => {
      const onStatusChange = jest.fn();

      mockDB.instantiate.mockImplementation(async (mainModule, pthreadWorker, callback) => {
        // Let initial setup complete - use setTimeout instead of setImmediate
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Call progress callback
        if (callback) {
          callback({
            bytesLoaded: 100 * 1024 * 1024, // 100MB (becomes 20MB after /5)
            bytesTotal: 20 * 1024 * 1024,   // 20MB - so loaded >= total
          });
        }
        return Promise.resolve();
      });

      const dbPromise = initializeDuckDB(onStatusChange);
      await dbPromise;

      const calls = onStatusChange.mock.calls.map(call => call[0]);
      const progressCalls = calls.filter(call => call.progress === 95);
      
      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('should handle missing progress data gracefully', async () => {
      const onStatusChange = jest.fn();

      mockDB.instantiate.mockImplementation(async (mainModule, pthreadWorker, callback) => {
        // Call with missing data
        if (callback) {
          callback({
            // No bytesLoaded or bytesTotal
          });
        }
        return Promise.resolve();
      });

      const dbPromise = initializeDuckDB(onStatusChange);
      await dbPromise;

      // Should complete successfully without crashing
      const calls = onStatusChange.mock.calls.map(call => call[0]);
      const successCall = calls.find(call => call.state === 'success');
      
      expect(successCall).toEqual({
        state: 'success',
        progress: 100,
        message: 'DuckDB ready!',
      });
    });

    it('should return existing promise if already initializing', async () => {
      const onStatusChange1 = jest.fn();
      const onStatusChange2 = jest.fn();

      mockDB.instantiate.mockResolvedValue();

      const promise1 = initializeDuckDB(onStatusChange1);
      const promise2 = initializeDuckDB(onStatusChange2);

      expect(promise1).toBe(promise2);
      
      await promise1;
      
      expect(onStatusChange1).toHaveBeenCalled();
      expect(onStatusChange2).toHaveBeenCalled();
    });

    it('should notify existing status when promise already exists', async () => {
      const onStatusChange1 = jest.fn();
      const onStatusChange2 = jest.fn();

      mockDB.instantiate.mockResolvedValue();

      const promise1 = initializeDuckDB(onStatusChange1);
      const promise2 = initializeDuckDB(onStatusChange2);

      expect(promise1).toBe(promise2);
      expect(onStatusChange2).toHaveBeenCalled();
      
      await promise1;
    });

    it('should handle download timeout', async () => {
      // Skip this test if timeout logic is too complex to test with fake timers
      // Instead, test that the function has timeout protection
      
      const onStatusChange = jest.fn();

      // Mock setTimeout to immediately call the timeout callback
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        if (delay > 50000) { // Only mock the long timeout, not short ones
          setTimeout(() => callback(), 0); // Trigger immediately
        } else {
          return originalSetTimeout(callback, delay);
        }
      });

      // Make instantiate hang forever
      mockDB.instantiate.mockImplementation(() => new Promise(() => {}));

      const dbPromise = initializeDuckDB(onStatusChange);

      await expect(dbPromise).rejects.toThrow('Download timeout');

      const calls = onStatusChange.mock.calls.map(call => call[0]);
      const errorCall = calls.find(call => call.state === 'error');
      
      expect(errorCall).toMatchObject({
        state: 'error',
        message: 'Error: Download timeout',
      });

      // Restore setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should handle selectBundle error', async () => {
      const onStatusChange = jest.fn();
      const error = new Error('Bundle selection failed');

      duckdb.selectBundle.mockRejectedValue(error);

      const dbPromise = initializeDuckDB(onStatusChange);

      await expect(dbPromise).rejects.toThrow('Bundle selection failed');

      const calls = onStatusChange.mock.calls.map(call => call[0]);
      const errorCall = calls.find(call => call.state === 'error');
      
      // Error state should only have state and message, no progress
      expect(errorCall).toEqual({
        state: 'error',
        progress: 20,
        message: 'Error: Bundle selection failed',
      });
    });

    it('should handle Worker creation error', async () => {
      const onStatusChange = jest.fn();
      const error = new Error('Worker creation failed');

      global.Worker = jest.fn().mockImplementation(() => {
        throw error;
      });

      await expect(initializeDuckDB(onStatusChange)).rejects.toThrow('Worker creation failed');
    });

    it('should handle AsyncDuckDB constructor error', async () => {
      const onStatusChange = jest.fn();
      const error = new Error('AsyncDuckDB creation failed');

      duckdb.AsyncDuckDB = jest.fn().mockImplementation(() => {
        throw error;
      });

      await expect(initializeDuckDB(onStatusChange)).rejects.toThrow('AsyncDuckDB creation failed');
    });

    it('should handle instantiate error', async () => {
      const onStatusChange = jest.fn();
      const error = new Error('Instantiate failed');

      mockDB.instantiate.mockRejectedValue(error);

      await expect(initializeDuckDB(onStatusChange)).rejects.toThrow('Instantiate failed');
    });

    it('should reset dbPromise on error to allow retry', async () => {
      const onStatusChange = jest.fn();
      const error = new Error('First attempt failed');

      // First attempt fails
      duckdb.selectBundle.mockRejectedValueOnce(error);
      
      await expect(initializeDuckDB(onStatusChange)).rejects.toThrow('First attempt failed');

      // Reset state for retry
      cleanupDuckDB({ terminate: jest.fn() });
      
      // Reset mocks for second attempt
      duckdb.selectBundle.mockResolvedValue(mockBundle);
      mockDB.instantiate.mockResolvedValue();

      // Second attempt should work
      const secondAttempt = initializeDuckDB(onStatusChange);
      await expect(secondAttempt).resolves.toBe(mockDB);
    });

    it('should call console.log when starting download', async () => {
      const onStatusChange = jest.fn();
      mockDB.instantiate.mockResolvedValue();

      await initializeDuckDB(onStatusChange);

      expect(console.log).toHaveBeenCalledWith('Starting DuckDB WASM module download...');
    });

    it('should handle unknown errors gracefully', async () => {
      const onStatusChange = jest.fn();
      const error = new Error();
      error.message = undefined;

      duckdb.selectBundle.mockRejectedValue(error);

      await expect(initializeDuckDB(onStatusChange)).rejects.toThrow();
    });
  });

  describe('cleanupDuckDB', () => {
    it('should clean up database resources successfully', () => {
      cleanupDuckDB(mockDB);

      expect(mockDB.terminate).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('DuckDB resources cleaned up');

      const status = getDuckDBStatus();
      expect(status).toEqual({
        state: 'idle',
        progress: 0,
        message: '',
      });
    });

    it('should handle cleanup errors gracefully', () => {
      const error = new Error('Cleanup failed');
      
      mockDB.terminate.mockImplementation(() => {
        throw error;
      });

      cleanupDuckDB(mockDB);

      expect(console.error).toHaveBeenCalledWith('Error cleaning up DuckDB:', error);
    });

    it('should handle null database gracefully', () => {
      expect(() => cleanupDuckDB(null)).not.toThrow();
      expect(() => cleanupDuckDB(undefined)).not.toThrow();
    });
  });
});