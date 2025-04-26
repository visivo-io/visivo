import { renderHook, waitFor } from '@testing-library/react';
import { useDuckDBInitialization } from '../useDuckDb';

jest.mock('../../components/items/duckdb-wasm-init/duckDBWasmInit', () => ({
  initializeDuckDB: jest.fn(),
  getDuckDBStatus: jest.fn(),
  cleanupDuckDB: jest.fn()
}));

const {
  initializeDuckDB: mockInitializeDuckDB
} = require('../../components/items/duckdb-wasm-init/duckDBWasmInit');

describe('useDuckDBInitialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.info = jest.fn();
    console.error = jest.fn();
  });

  it('should update status during initialization', async () => {
    let statusCallback;
    mockInitializeDuckDB.mockImplementation((callback) => {
      statusCallback = callback;
      return Promise.resolve('mock-db-instance');
    });

    const { result } = renderHook(() => useDuckDBInitialization());

    const progressUpdate = {
      state: "loading",
      message: "Loading...",
      progress: 50,
    };

    statusCallback(progressUpdate);

    waitFor(async () => {
      expect(result.current.duckDBStatus).toEqual(progressUpdate);
    });
  });

  it('should initialize DuckDB on mount', () => {
    mockInitializeDuckDB.mockResolvedValue('mock-db-instance');

    renderHook(() => useDuckDBInitialization());

    expect(mockInitializeDuckDB).toHaveBeenCalledTimes(1);
    expect(mockInitializeDuckDB).toHaveBeenCalledWith(expect.any(Function));
    expect(console.info).toHaveBeenCalledWith(
      "Starting DuckDB initialization on component mount"
    );
  });

  it('should set db when initialization succeeds', async () => {
    const mockDb = 'mock-db-instance';
    mockInitializeDuckDB.mockResolvedValue(mockDb);

    const { result } = renderHook(() => useDuckDBInitialization());

    await waitFor(() => {
      expect(result.current.db).toBe(mockDb);
    });

    expect(console.info).toHaveBeenCalledWith("DuckDB initialized successfully");
  });

  it('should handle initialization failure', async () => {
    const mockError = new Error('Initialization failed');
    mockInitializeDuckDB.mockRejectedValue(mockError);

    const { result } = renderHook(() => useDuckDBInitialization());

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        "DuckDB initialization failed:",
        mockError
      );
    });

    expect(result.current.db).toBeNull();
  });

  it('should not re-initialize if db already exists', async () => {
    mockInitializeDuckDB.mockResolvedValue('mock-db-instance');

    const { result, rerender } = renderHook(() => useDuckDBInitialization());

    // First render should initialize
    expect(mockInitializeDuckDB).toHaveBeenCalledTimes(1);

    // Force a re-render
    rerender();

    // Should not initialize again
    await waitFor(() => {
      expect(mockInitializeDuckDB).toHaveBeenCalledTimes(1);
    });
  });

  it('should calculate duckDBLoaded correctly with wrong status constant', async () => {
    let statusCallback;
    mockInitializeDuckDB.mockImplementation((callback) => {
      statusCallback = callback;
      return Promise.resolve('mock-db-instance');
    });

    const { result } = renderHook(() => useDuckDBInitialization());

    // Initially not loaded
    expect(result.current.duckDBLoaded).toBe(false);

    statusCallback({
      state: "success",
      message: "Complete",
      progress: 100,
    });

    await waitFor(() => {
      expect(result.current.duckDBLoaded).toBe(true);
    });
  });

  it('should calculate duckDBLoaded correctly with correct status', () => {
    let statusCallback;
    mockInitializeDuckDB.mockImplementation((callback) => {
      statusCallback = callback;
      return Promise.resolve('mock-db-instance');
    });

    const { result } = renderHook(() => useDuckDBInitialization());

    statusCallback({
      state: "success",
      message: "DuckDB ready!",
      progress: 100,
    });

    waitFor(() => {
      expect(result.current.duckDBLoaded).toBe(true);
    });
  });
});