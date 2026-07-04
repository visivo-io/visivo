import { renderHook } from '@testing-library/react';
import { useInsightPreviewData, useChartPreviewJob, usePreviewInsightData } from './usePreviewData';
import { useInsightsData } from './useInsightsData';
import useStore from '../stores/store';

jest.mock('./useInsightsData');
jest.mock('../stores/store');

// The preview hooks now read the already-built `main` run — no preview run, no
// polling, no `__preview__` store namespace. Insights are read by name from
// `insightJobs`, and freshness comes from `runDataVersion` (bumped by the
// run-poller after an on-save run).

const insightsDataState = {
  insights: {},
  insightsData: {},
  isInsightsLoading: false,
  hasAllInsightData: false,
  error: null,
};

const setStore = state => {
  useStore.mockImplementation(selector =>
    typeof selector === 'function' ? selector(state) : undefined
  );
  useStore.getState = jest.fn(() => state);
};

beforeEach(() => {
  jest.clearAllMocks();
  useInsightsData.mockReturnValue(insightsDataState);
  setStore({ insightJobs: {}, runDataVersion: 0 });
});

describe('useInsightPreviewData', () => {
  test('reads the built main run for the insight (undefined run_id, runDataVersion cacheKey)', () => {
    setStore({ insightJobs: {}, runDataVersion: 7 });

    renderHook(() => useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj-1' }));

    expect(useInsightsData).toHaveBeenCalledWith('proj-1', ['my-insight'], undefined, {
      cacheKey: 7,
    });
  });

  test('previewInsightKey is the plain insight name (no __preview__ prefix)', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.previewInsightKey).toBe('my-insight');
  });

  test('previewInsightKey is null and names empty when config has no name', () => {
    const { result } = renderHook(() => useInsightPreviewData({}, { projectId: 'proj' }));

    expect(result.current.previewInsightKey).toBeNull();
    const lastCall = useInsightsData.mock.calls[useInsightsData.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
  });

  test('returns data/insight from the main store by name', () => {
    setStore({
      insightJobs: { 'my-insight': { data: [{ x: 1, y: 2 }], type: 'scatter' } },
      runDataVersion: 0,
    });

    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.data).toEqual([{ x: 1, y: 2 }]);
    expect(result.current.insight).toEqual({ data: [{ x: 1, y: 2 }], type: 'scatter' });
  });

  test('returns null data when the insight is not in the main store', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'missing' }, { projectId: 'proj' })
    );

    expect(result.current.data).toBeNull();
    expect(result.current.insight).toBeNull();
  });

  test('never requests a preview run (no needsPreviewRun, settled state)', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.needsPreviewRun).toBe(false);
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isFailed).toBe(false);
  });
});

describe('useChartPreviewJob', () => {
  test('reads the built main run for the chart insight names', () => {
    setStore({ insightJobs: {}, runDataVersion: 3 });

    renderHook(() =>
      useChartPreviewJob({ insight_names: ['a', 'b'] }, { projectId: 'proj' })
    );

    expect(useInsightsData).toHaveBeenCalledWith('proj', ['a', 'b'], undefined, {
      cacheKey: 3,
    });
  });

  test('previewInsightKeys are the plain insight names', () => {
    const { result } = renderHook(() =>
      useChartPreviewJob({ insight_names: ['a', 'b'] }, { projectId: 'proj' })
    );

    expect(result.current.previewInsightKeys).toEqual(['a', 'b']);
    expect(result.current.previewRunId).toBeNull();
  });

  test('empty names when previewRequest is null', () => {
    renderHook(() => useChartPreviewJob(null, { projectId: 'proj' }));

    const lastCall = useInsightsData.mock.calls[useInsightsData.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
  });
});

describe('usePreviewInsightData', () => {
  test('resolves the synthetic chart to the un-prefixed main-run key', () => {
    const { result } = renderHook(() =>
      usePreviewInsightData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.chartInsightKey).toBe('my-insight');
    // No preview run — inert failure surface, settled progress.
    expect(result.current.errorDetails).toBeNull();
    expect(typeof result.current.resetPreview).toBe('function');
  });

  test('reads the built main run for the insight', () => {
    setStore({ insightJobs: {}, runDataVersion: 5 });

    renderHook(() => usePreviewInsightData({ name: 'my-insight' }, { projectId: 'proj' }));

    expect(useInsightsData).toHaveBeenCalledWith('proj', ['my-insight'], undefined, {
      cacheKey: 5,
    });
  });

  test('flags insightNotInMain when the insight has no main-run entry', () => {
    setStore({ insightJobs: {}, runDataVersion: 0 });
    const { result: missing } = renderHook(() =>
      usePreviewInsightData({ name: 'missing' }, { projectId: 'proj' })
    );
    expect(missing.current.insightNotInMain).toBe(true);

    setStore({ insightJobs: { present: { data: [] } }, runDataVersion: 0 });
    const { result: present } = renderHook(() =>
      usePreviewInsightData({ name: 'present' }, { projectId: 'proj' })
    );
    expect(present.current.insightNotInMain).toBe(false);
  });

  test('chartInsightKey is null when config has no name', () => {
    const { result } = renderHook(() => usePreviewInsightData({}, { projectId: 'proj' }));
    expect(result.current.chartInsightKey).toBeNull();
  });
});
