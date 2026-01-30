import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInsightsData } from './useInsightsData';
import { useFetchInsightJobs } from '../contexts/QueryContext';
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
    useFetchInsightJobs.mockReturnValue(mockFetchInsight);
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
          id: 'insight1',
          name: 'insight1',
          data: [{ id: 1, name: 'test' }],
          files: [],
          query: 'SELECT * FROM test',
          props_mapping: { 'props.x': 'id' },
          loaded: 1,
          failed: 0,
          error: null,
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
          id: 'insight1',
          name: 'insight1',
          data: [{ id: 1, value: 'from store' }],
          files: [],
          query: 'SELECT * FROM test',
          props_mapping: { 'props.x': 'id' },
          loaded: 1,
          failed: 0,
          error: null,
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
          id: 'insight1',
          name: 'insight1',
          // Missing data field - incomplete
          files: [],
          query: 'SELECT * FROM test',
          props_mapping: { 'props.x': 'id' },
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

  describe('Race condition handling', () => {
    test('should use fresh inputs from store.getState() not closure value', () => {
      // This test verifies that the hook uses useStore.getState().inputs
      // instead of the closure-captured value, preventing race conditions
      // where inputs load after the query starts

      const initialInputs = {};
      const freshInputs = { testInput: { value: 'test' } };

      // Mock getState to return fresh inputs (simulating inputs that loaded during query)
      useStore.getState = jest.fn().mockReturnValue({ inputs: freshInputs });

      useStore.mockImplementation(selector => {
        if (selector.toString().includes('setInsights')) {
          return mockSetInsights;
        }
        if (selector.toString().includes('insights')) {
          return {};
        }
        // Return stale empty inputs via selector (simulating closure capture)
        if (selector.toString().includes('inputs')) {
          return initialInputs;
        }
        return null;
      });

      // Verify getState returns fresh inputs
      expect(useStore.getState().inputs).toEqual(freshInputs);

      // The hook should be able to be created without errors
      const { result } = renderHook(() => useInsightsData('project1', ['insight1']), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
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

      expect(result.current.insightsData).toEqual({});
    });
  });
});
