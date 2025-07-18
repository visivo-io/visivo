import { renderHook, waitFor } from '@testing-library/react';
import { useTracesData } from './useTracesData';
import { withProviders } from '../utils/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchTracesData from '../queries/tracesData';
import * as tracesApi from '../api/traces';

// Mock the API
jest.mock('../api/traces');

describe('useTraceDate', () => {
  test('should return empty object when no traces', async () => {
    // Mock the API function to return empty array
    tracesApi.fetchTracesQuery.mockResolvedValue([]);
    
    const { result } = renderHook(() => useTracesData('projectId', []), { wrapper: withProviders });

    await waitFor(() => {
      expect(result.current).toStrictEqual({});
    });
  });

  test('should return trace data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Mock the API function
    tracesApi.fetchTracesQuery.mockResolvedValue([{ name: 'traceName' }]);

    jest
      .spyOn(fetchTracesData, 'fetchTracesData')
      .mockImplementation((projectId, traceNames) => ({ traceName: { data: 'data' } }));
    
    const { result } = renderHook(() => useTracesData('projectId', ['traceName']), {
      wrapper: ({ children }) => {
        return withProviders({ children });
      },
    });
    
    await waitFor(() => {
      expect(result.current).toStrictEqual({ traceName: { data: 'data' } });
    });
  });
});
