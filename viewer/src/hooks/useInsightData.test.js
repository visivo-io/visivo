import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInsightsData, fetchInsightsData } from './useInsightsData';
import { useFetchInsights } from '../contexts/QueryContext';
import { useDuckDB } from '../contexts/DuckDBContext';
import { tableDuckDBExists, insertDuckDBFile } from '../duckdb/queries';
import useStore from '../stores/store';

// Mock dependencies
jest.mock('../contexts/QueryContext');
jest.mock('../contexts/DuckDBContext');
jest.mock('../duckdb/queries');
jest.mock('../stores/store');

// Mock fetch
global.fetch = jest.fn();

describe('useInsightsData Hook', () => {
  let queryClient;
  let mockFetchInsight;
  let mockDb;
  let mockSetInsights;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          cacheTime: 0,
        },
      },
    });

    return ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    fetch.mockClear();

    // Setup mock functions
    mockFetchInsight = jest.fn();
    mockDb = { mock: 'database' };
    mockSetInsights = jest.fn();

    // Setup mock returns
    useFetchInsights.mockReturnValue(mockFetchInsight);
    useDuckDB.mockReturnValue(mockDb);

    tableDuckDBExists.mockResolvedValue(false);
    insertDuckDBFile.mockResolvedValue(undefined);
  });

  describe('Basic functionality', () => {
    test('should return default values when no projectId or insightNames provided', () => {
      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        return null;
      });

      const { result } = renderHook(() => useInsightsData(null, []), { wrapper: createWrapper() });

      expect(result.current.insightsData).toEqual({});
      expect(result.current.isInsightsLoading).toBe(false);
      expect(result.current.hasAllInsightData).toBe(true);
      expect(result.current.error).toBeNull();
    });

    test('should return store data when hasCompleteData is true', () => {
      const completeStoreData = {
        insight1: {
          insight: [{ id: 1, name: 'test' }],
          columns: { id: 'integer' },
          props: { type: 'table' },
        },
      };

      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return completeStoreData;
        }
        return null;
      });

      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      expect(result.current.insightsData).toBe(completeStoreData);
      expect(result.current.isInsightsLoading).toBe(false);
      expect(result.current.hasAllInsightData).toBe(true);
      // Query should not be triggered when we have complete data
      expect(mockFetchInsight).not.toHaveBeenCalled();
    });

    test('should start loading when conditions are met but data is incomplete', () => {
      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {}; // Empty store = incomplete data
        }
        return null;
      });

      mockFetchInsight.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      // Initially should show loading state when query is enabled
      expect(result.current.hasAllInsightData).toBe(false);
    });
  });

  describe('Data processing edge cases', () => {
    test('should handle empty insight names array', () => {
      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        return null;
      });

      const { result } = renderHook(() => useInsightsData('project1', []), {
        wrapper: createWrapper(),
      });

      expect(result.current.insightsData).toEqual({});
      expect(result.current.isInsightsLoading).toBe(false);
      expect(result.current.hasAllInsightData).toBe(true);
    });

    test('should handle null insightNames', () => {
      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        return null;
      });

      const { result } = renderHook(() => useInsightsData('project1', null), {
        wrapper: createWrapper(),
      });

      expect(result.current.insightsData).toEqual({});
      expect(result.current.isInsightsLoading).toBe(false);
      expect(result.current.hasAllInsightData).toBe(true);
    });
  });

  describe('Store integration', () => {
    test('should use store data when available', () => {
      const storeData = {
        insight1: {
          insight: [{ id: 1, value: 'from store' }],
          columns: { id: 'integer' },
          props: { type: 'table' },
        },
      };

      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return storeData;
        }
        return null;
      });

      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      expect(result.current.insightsData).toEqual(storeData);
      expect(result.current.hasAllInsightData).toBe(true);
    });

    test('should detect incomplete data in store', () => {
      const incompleteStoreData = {
        insight1: {
          insight: [{ id: 1 }],
          // Missing columns and props
        },
      };

      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return incompleteStoreData;
        }
        return null;
      });

      mockFetchInsight.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      expect(result.current.hasAllInsightData).toBe(false);
    });
  });

  describe('Stable key generation', () => {
    test('should handle insight names in different orders consistently', () => {
      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        return null;
      });

      const { result: result1 } = renderHook(
        () => useInsightsData('project1', ['insight2', 'insight1']),
        { wrapper: createWrapper() }
      );

      const { result: result2 } = renderHook(
        () => useInsightsData('project1', ['insight1', 'insight2']),
        { wrapper: createWrapper() }
      );

      // Both should have consistent behavior
      expect(result1.current.isInsightsLoading).toBe(result2.current.isInsightsLoading);
      expect(result1.current.hasAllInsightData).toBe(result2.current.hasAllInsightData);
    });
  });

  describe('Async behavior simulation', () => {
    test('should transition from loading to loaded', async () => {
      const mockData = {
        insight1: {
          insight: [{ id: 1, value: 'test' }],
          columns: { id: 'integer' },
          props: { type: 'table' },
        },
      };

      let resolveQuery;
      const queryPromise = new Promise(resolve => {
        resolveQuery = resolve;
      });

      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        return null;
      });

      mockFetchInsight.mockReturnValue(queryPromise);

      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      // Simulate data becoming available in store
      act(() => {
        useStore.mockImplementation(selector => {
          if (selector.toString().includes('setInsights')) {
            return mockSetInsights;
          }
          if (selector.toString().includes('insights')) {
            return mockData;
          }
          return null;
        });
        resolveQuery([]);
      });

      expect(result.current.insightsData).toEqual([]);
    });
  });
});

describe('fetchInsightsData utility function', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('should fetch insights data successfully', async () => {
    const insights = [
      {
        name: 'insight1',
        signed_data_file_url: 'https://example.com/insight1.json',
      },
      {
        name: 'insight2',
        signed_data_file_url: 'https://example.com/insight2.json',
      },
    ];

    const mockData1 = { data: 'insight1Data' };
    const mockData2 = { data: 'insight2Data' };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData2),
      });

    const result = await fetchInsightsData(insights);

    expect(result).toEqual({
      insight1: mockData1,
      insight2: mockData2,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('https://example.com/insight1.json');
    expect(fetch).toHaveBeenCalledWith('https://example.com/insight2.json');
  });

  test('should handle mixed success and failure', async () => {
    const insights = [
      {
        name: 'insight1',
        signed_data_file_url: 'https://example.com/insight1.json',
      },
      {
        name: 'insight2',
        signed_data_file_url: 'https://example.com/insight2.json',
      },
    ];

    const mockData1 = { data: 'insight1Data' };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData1),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const result = await fetchInsightsData(insights);

    // Only successful requests should be in result
    expect(result).toEqual({
      insight1: mockData1,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('should handle network errors', async () => {
    const insights = [
      {
        name: 'insight1',
        signed_data_file_url: 'https://example.com/insight1.json',
      },
      {
        name: 'insight2',
        signed_data_file_url: 'https://example.com/insight2.json',
      },
    ];

    const mockData1 = { data: 'insight1Data' };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData1),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchInsightsData(insights);

    expect(result).toEqual({
      insight1: mockData1,
    });
  });

  test('should return empty object for empty insights array', async () => {
    const result = await fetchInsightsData([]);
    expect(result).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should return empty object for null insights', async () => {
    const result = await fetchInsightsData(null);
    expect(result).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should handle JSON parsing errors', async () => {
    const insights = [
      {
        name: 'insight1',
        signed_data_file_url: 'https://example.com/insight1.json',
      },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    const result = await fetchInsightsData(insights);

    expect(result).toEqual({});
  });
});
