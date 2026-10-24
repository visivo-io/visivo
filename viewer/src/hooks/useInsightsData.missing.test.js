/**
 * useInsightsData — insights with no built output (VIS-1544).
 *
 * The server leaves out an insight it has no output for, and answers 404 when
 * it has none of the requested ones. Either way the store must say so, or the
 * chart waits forever.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInsightsData } from './useInsightsData';
import { useFetchInsightJobs } from '../contexts/QueryContext';
import { useDuckDB } from '../contexts/DuckDBContext';
import { loadInsightParquetFiles, runDuckDBQuery, prepPostQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';
import useStore from '../stores/store';

jest.mock('@tanstack/react-query', () => jest.requireActual('@tanstack/react-query'));
jest.mock('../contexts/QueryContext');
jest.mock('../contexts/DuckDBContext');
jest.mock('../duckdb/queries');
jest.mock('../duckdb/resultProcessing');

const BUILT = {
  name: 'built',
  files: [{ name_hash: 'mabc', signed_data_file_url: '/api/files/built/main/' }],
  query: 'SELECT * FROM "mabc"',
  props_mapping: { 'props.x': 'x' },
  static_props: {},
  props_slices: {},
  split_key: null,
  type: 'bar',
};

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useInsightsData missing insights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useStore.setState({ insightJobs: {}, inputJobs: {} });
    });
    useDuckDB.mockReturnValue({ mock: 'db' });
    loadInsightParquetFiles.mockResolvedValue({ loaded: ['mabc'], failed: [] });
    prepPostQuery.mockImplementation(({ query }) => query);
    runDuckDBQuery.mockResolvedValue({ mock: 'arrow' });
    processArrowResult.mockImplementation(() => [{ x: 1 }]);
  });

  test('marks a name the server left out as missing', async () => {
    useFetchInsightJobs.mockReturnValue(jest.fn(async () => [BUILT]));

    renderHook(() => useInsightsData('project1', ['built', 'failed']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['failed']?.missing).toBe(true);
    });
    const jobs = useStore.getState().insightJobs;
    expect(jobs['failed'].data).toBeNull();
    expect(jobs['built'].data).toEqual([{ x: 1 }]);
    expect(jobs['built'].missing).toBeUndefined();
  });

  test('marks every name as missing when the fetch fails', async () => {
    useFetchInsightJobs.mockReturnValue(
      jest.fn(async () => {
        throw new Error('404 NOT FOUND. No insight files found');
      })
    );

    renderHook(() => useInsightsData('project1', ['failed']), { wrapper: createWrapper() });

    await waitFor(
      () => {
        expect(useStore.getState().insightJobs['failed']?.missing).toBe(true);
      },
      { timeout: 4000 }
    );
    expect(useStore.getState().insightJobs['failed'].data).toBeNull();
  });

  test('a failed fetch leaves an entry that already exists alone', async () => {
    const existing = { name: 'kept', data: [{ x: 2 }], error: null };
    act(() => {
      useStore.setState({ insightJobs: { kept: existing } });
    });
    useFetchInsightJobs.mockReturnValue(
      jest.fn(async () => {
        throw new Error('500');
      })
    );

    const { result } = renderHook(() => useInsightsData('project1', ['kept']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 4000 });
    expect(useStore.getState().insightJobs['kept']).toBe(existing);
  });

  test('a prefixed store marks missing names under the prefix', async () => {
    useFetchInsightJobs.mockReturnValue(jest.fn(async () => [BUILT]));

    renderHook(
      () => useInsightsData('project1', ['built', 'failed'], undefined, {
        storeKeyPrefix: '__preview__',
      }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(useStore.getState().insightJobs['__preview__failed']?.missing).toBe(true);
    });
    expect(useStore.getState().insightJobs['__preview__built'].data).toEqual([{ x: 1 }]);
    expect(useStore.getState().insightJobs['failed']).toBeUndefined();
  });

  test('a query that fails in DuckDB is an error, not a missing insight', async () => {
    useFetchInsightJobs.mockReturnValue(jest.fn(async () => [BUILT]));
    runDuckDBQuery.mockRejectedValue(new Error('Binder Error: column not found'));

    renderHook(() => useInsightsData('project1', ['built']), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['built']?.error).toBe(
        'Binder Error: column not found'
      );
    });
    const job = useStore.getState().insightJobs['built'];
    expect(job.data).toEqual([]);
    expect(job.missing).toBeUndefined();
  });

  test('input refs nested in static_props arrays are dependencies', async () => {
    useFetchInsightJobs.mockReturnValue(
      jest.fn(async () => [
        { ...BUILT, static_props: { marker: { color: [`\${palette.value}`, 'red'] } } },
      ])
    );
    act(() => {
      useStore.setState({ inputJobs: { palette: { value: 'blue' } } });
    });

    renderHook(() => useInsightsData('project1', ['built']), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['built']?.inputDependencies).toEqual(['palette']);
    });
  });
});
