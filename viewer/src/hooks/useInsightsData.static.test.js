/**
 * useInsightsData — static insights (VIS-1464).
 *
 * A static insight (no query bindings) is shipped by run_insight_job.static_action
 * with `files: []` and `query: null`. The hook must not run anything in DuckDB for
 * it and must still publish its static_props so chartDataFromInsightData can build
 * the trace.
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

const IMAGE_Z = [[[255, 0, 0]], [[0, 0, 255]]];

const STATIC_INSIGHT = {
  name: 'pixels',
  files: [],
  query: null,
  props_mapping: {},
  static_props: { z: IMAGE_Z },
  props_slices: {},
  split_key: null,
  type: 'image',
};

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useInsightsData static insights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useStore.setState({
        insightJobs: {},
        inputJobs: {},
        inputSelectedValues: {},
        inputJobsInitialized: {},
        db: null,
      });
    });
    useFetchInsightJobs.mockReturnValue(jest.fn(async () => [STATIC_INSIGHT]));
    useDuckDB.mockReturnValue({ mock: 'db' });
    loadInsightParquetFiles.mockResolvedValue({ loaded: [], failed: [] });
    prepPostQuery.mockImplementation(({ query }) => query);
    runDuckDBQuery.mockResolvedValue({ mock: 'arrow' });
    processArrowResult.mockImplementation(() => [{ should: 'not be used' }]);
  });

  test('publishes static_props with empty data and never queries DuckDB', async () => {
    renderHook(() => useInsightsData('project1', ['pixels']), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(useStore.getState().insightJobs['pixels']?.data).toEqual([]);
    });

    const job = useStore.getState().insightJobs['pixels'];
    expect(job.static_props).toEqual({ z: IMAGE_Z });
    expect(job.type).toBe('image');
    expect(job.error).toBeNull();
    expect(runDuckDBQuery).not.toHaveBeenCalled();
    expect(processArrowResult).not.toHaveBeenCalled();
  });
});
