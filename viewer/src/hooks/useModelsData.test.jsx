import { renderHook, waitFor } from '@testing-library/react';
import { useModelsData } from './useModelsData';
import { withProviders } from '../utils/test-utils';
import { QueryProvider } from '../contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchModelsData from '../queries/modelsData';

describe('useModelsData', () => {
  test('should return empty object when no models', async () => {
    const { result } = renderHook(() => useModelsData('projectId', []), { wrapper: withProviders });
    await waitFor(() => {
      expect(result.current).toStrictEqual({});
    });
  });

  test('should return model data', async () => {
    const fetchModelsQuery = (projectId, name) => ({
      queryKey: ['model', projectId, name],
      queryFn: () => [{ name: 'modelName' }],
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    jest
      .spyOn(fetchModelsData, 'fetchModelsData')
      .mockImplementation(models => ({ modelName: { data: 'data' } }));

    const { result } = renderHook(() => useModelsData('projectId', ['modelName']), {
      wrapper: ({ children }) => (
        <QueryProvider value={{ fetchModelsQuery }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </QueryProvider>
      ),
    });
    await waitFor(() => {
      expect(result.current).toStrictEqual({ modelName: { data: 'data' } });
    });
  });
});
