import { renderHook, waitFor } from '@testing-library/react';
import { useTracesData } from './useTracesData';
import { withProviders } from '../utils/test-utils';
import * as fetchTracesData from '../queries/tracesData';
import * as tracesApi from '../api/traces';

// Mock the API
jest.mock('../api/traces');

describe('useTracesData', () => {
  test('should return loading state and null data when no traces', async () => {
    const { result } = renderHook(() => useTracesData([]), { wrapper: withProviders });

    // Should return the expected interface immediately
    expect(result.current).toEqual({
      data: null,
      isLoading: false // No traces means no loading
    });
  });

  test('should return correct interface with traces', async () => {
    // Mock the API function
    tracesApi.fetchTraces.mockResolvedValue([{ name: 'traceName', signed_data_file_url: 'http://example.com/data.json' }]);

    jest
      .spyOn(fetchTracesData, 'fetchTracesData')
      .mockImplementation(() => Promise.resolve({ traceName: { data: 'data' } }));
    
    const traces = [{ name: 'traceName' }];
    const { result } = renderHook(() => useTracesData(traces, 'projectId'), {
      wrapper: ({ children }) => {
        return withProviders({ children });
      },
    });
    
    // Should have the correct interface structure
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.isLoading).toBe('boolean');
    
    // Should eventually return data (don't worry about loading state timing for now)
    await waitFor(() => {
      expect(result.current.data).toEqual({ traceName: { data: 'data' } });
    });
  });

  test('should handle empty traces array', async () => {
    const { result } = renderHook(() => useTracesData([], 'projectId'), { wrapper: withProviders });

    expect(result.current).toEqual({
      data: null,
      isLoading: false
    });
  });

  test('should handle null traces parameter', async () => {
    const { result } = renderHook(() => useTracesData(null), { wrapper: withProviders });

    expect(result.current).toEqual({
      data: null,
      isLoading: false
    });
  });
});
