import { renderHook, act } from '@testing-library/react';
import { usePreviewData, useInsightPreviewData } from './usePreviewData';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import {
  queryPropsHaveChanged,
  hashQueryProps,
  extractNonQueryProps,
} from '../utils/queryPropertyDetection';
import useStore from '../stores/store';

jest.mock('./usePreviewJob');
jest.mock('./useInsightsData');
jest.mock('../utils/queryPropertyDetection');
jest.mock('../stores/store');

// A promise that never resolves, preventing .then() callbacks from firing
// state updates outside of act().
const pendingPromise = () => new Promise(() => {});

describe('usePreviewData', () => {
  let mockStartRun;
  let mockResetRun;
  let mockPreviewJobBase;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStartRun = jest.fn().mockReturnValue(pendingPromise());
    mockResetRun = jest.fn();
    mockPreviewJobBase = {
      runInstanceId: null,
      status: null,
      progress: 0,
      progressMessage: '',
      result: null,
      error: null,
      isRunning: false,
      isCompleted: false,
      isFailed: false,
      startRun: mockStartRun,
      resetRun: mockResetRun,
    };

    usePreviewJob.mockReturnValue(mockPreviewJobBase);
    hashQueryProps.mockImplementation(config => JSON.stringify(config));
    queryPropsHaveChanged.mockReturnValue(false);
  });

  test('returns idle state with null config', () => {
    const { result } = renderHook(() => usePreviewData('insights', null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isFailed).toBe(false);
    expect(result.current.needsPreviewRun).toBe(false);
    expect(result.current.runInstanceId).toBeNull();
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('exposes runInstanceId from previewJob', () => {
    usePreviewJob.mockReturnValue({ ...mockPreviewJobBase, runInstanceId: 'run-456' });

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    expect(result.current.runInstanceId).toBe('run-456');
  });

  test('does not trigger preview when config matches savedConfig', () => {
    queryPropsHaveChanged.mockReturnValue(false);

    const config = { name: 'test', props: { x: '?{col1}' } };
    const savedConfig = { name: 'test', props: { x: '?{col1}' } };

    const { result } = renderHook(() =>
      usePreviewData('insights', config, { savedConfig })
    );

    expect(result.current.needsPreviewRun).toBe(false);
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('triggers preview when config differs from savedConfig', () => {
    queryPropsHaveChanged.mockReturnValue(true);

    const config = { name: 'test', props: { x: '?{col2}' } };
    const savedConfig = { name: 'test', props: { x: '?{col1}' } };

    const { result } = renderHook(() =>
      usePreviewData('insights', config, { savedConfig })
    );

    expect(result.current.needsPreviewRun).toBe(true);
    expect(mockStartRun).toHaveBeenCalledWith(config);
  });

  test('triggers preview when needsInitialPreview is true and no prior preview', () => {
    const config = { name: 'test', props: { x: '?{col1}' } };

    const { result } = renderHook(() =>
      usePreviewData('insights', config, { needsInitialPreview: true })
    );

    expect(result.current.needsPreviewRun).toBe(true);
    expect(mockStartRun).toHaveBeenCalledWith(config);
  });

  test('does not trigger preview when needsInitialPreview is false and no savedConfig', () => {
    const config = { name: 'test', props: { x: '?{col1}' } };

    const { result } = renderHook(() =>
      usePreviewData('insights', config, { needsInitialPreview: false })
    );

    expect(result.current.needsPreviewRun).toBe(false);
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('reflects completed status from previewJob', () => {
    usePreviewJob.mockReturnValue({
      ...mockPreviewJobBase,
      status: 'completed',
      isCompleted: true,
      result: { files: ['data.parquet'] },
      runInstanceId: 'run-done',
    });

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toEqual({ files: ['data.parquet'] });
  });

  test('reflects running status as isLoading', () => {
    usePreviewJob.mockReturnValue({
      ...mockPreviewJobBase,
      status: 'running',
      isRunning: true,
      progress: 50,
      progressMessage: 'Halfway there',
    });

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.progress).toBe(50);
    expect(result.current.progressMessage).toBe('Halfway there');
  });

  test('reflects failed status and error from previewJob', () => {
    usePreviewJob.mockReturnValue({
      ...mockPreviewJobBase,
      status: 'failed',
      isFailed: true,
      error: 'Query failed',
    });

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    expect(result.current.isFailed).toBe(true);
    expect(result.current.error).toBe('Query failed');
  });

  test('resetPreview calls previewJob.resetRun', () => {
    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    act(() => {
      result.current.resetPreview();
    });

    expect(mockResetRun).toHaveBeenCalled();
  });
});

describe('useInsightPreviewData', () => {
  let mockStartRun;
  let mockResetRun;

  const makePreviewJob = (overrides = {}) => ({
    runInstanceId: null,
    status: null,
    progress: 0,
    progressMessage: '',
    result: null,
    error: null,
    isRunning: false,
    isCompleted: false,
    isFailed: false,
    startRun: mockStartRun,
    resetRun: mockResetRun,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockStartRun = jest.fn().mockReturnValue(pendingPromise());
    mockResetRun = jest.fn();

    usePreviewJob.mockReturnValue(makePreviewJob());

    useInsightsData.mockReturnValue({
      insights: {},
      insightsData: {},
      isInsightsLoading: false,
      hasAllInsightData: false,
      error: null,
    });

    hashQueryProps.mockImplementation(() => 'hash');
    queryPropsHaveChanged.mockReturnValue(false);
    extractNonQueryProps.mockReturnValue({});

    useStore.mockImplementation(selector => {
      if (selector.toString().includes('insightJobs')) {
        return {};
      }
      return null;
    });
    useStore.getState = jest.fn().mockReturnValue({
      insightJobs: {},
      updateInsightJob: jest.fn(),
    });
  });

  test('passes null runId to useInsightsData when preview not completed', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({ runInstanceId: 'run-abc', status: 'running', isRunning: true })
    );

    renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj-1' })
    );

    expect(useInsightsData).toHaveBeenCalledWith(
      'proj-1',
      ['my-insight'],
      null,
      { storeKeyPrefix: '__preview__', cacheKey: 'run-abc' }
    );
  });

  test('passes preview-{name} runId when preview is completed', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runInstanceId: 'run-456',
        status: 'completed',
        isCompleted: true,
        result: { files: [] },
      })
    );

    renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj-1' })
    );

    expect(useInsightsData).toHaveBeenCalledWith(
      'proj-1',
      ['my-insight'],
      'preview-my-insight',
      { storeKeyPrefix: '__preview__', cacheKey: 'run-456' }
    );
  });

  test('passes runInstanceId as cacheKey to useInsightsData', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runInstanceId: 'unique-run-id-789',
        status: 'completed',
        isCompleted: true,
      })
    );

    renderHook(() =>
      useInsightPreviewData({ name: 'test' }, { projectId: 'proj' })
    );

    const lastCall = useInsightsData.mock.calls[useInsightsData.mock.calls.length - 1];
    expect(lastCall[3].cacheKey).toBe('unique-run-id-789');
  });

  test('always passes __preview__ storeKeyPrefix to useInsightsData', () => {
    renderHook(() =>
      useInsightPreviewData({ name: 'test' }, { projectId: 'proj' })
    );

    const lastCall = useInsightsData.mock.calls[useInsightsData.mock.calls.length - 1];
    expect(lastCall[3].storeKeyPrefix).toBe('__preview__');
  });

  test('passes empty array for insight names when no name provided', () => {
    renderHook(() => useInsightPreviewData({}, { projectId: 'proj' }));

    const lastCall = useInsightsData.mock.calls[useInsightsData.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
  });

  test('returns previewInsightKey with prefix', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.previewInsightKey).toBe('__preview__my-insight');
  });

  test('returns null previewInsightKey when config has no name', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({}, { projectId: 'proj' })
    );

    expect(result.current.previewInsightKey).toBeNull();
  });

  test('returns data from store under prefixed preview key', () => {
    const previewStoreData = {
      '__preview__my-insight': {
        data: [{ x: 1, y: 2 }],
        type: 'scatter',
      },
    };

    useStore.mockImplementation(selector => {
      if (selector.toString().includes('insightJobs')) {
        return previewStoreData;
      }
      return null;
    });

    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.data).toEqual([{ x: 1, y: 2 }]);
    expect(result.current.insight).toEqual({ data: [{ x: 1, y: 2 }], type: 'scatter' });
  });

  test('returns null data when store has no preview data', () => {
    useStore.mockImplementation(selector => {
      if (selector.toString().includes('insightJobs')) {
        return {};
      }
      return null;
    });

    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.data).toBeNull();
    expect(result.current.insight).toBeNull();
  });

  test('detects insight not in main store and sets needsInitialPreview', () => {
    useStore.mockImplementation(selector => {
      if (selector.toString().includes('insightJobs')) {
        return {};
      }
      return null;
    });

    renderHook(() =>
      useInsightPreviewData({ name: 'new-insight' }, { projectId: 'proj' })
    );

    expect(mockStartRun).toHaveBeenCalled();
  });

  test('does not trigger initial preview when insight exists in main store', () => {
    useStore.mockImplementation(selector => {
      if (selector.toString().includes('insightJobs')) {
        return {
          'existing-insight': { data: [{ x: 1 }], query: 'SELECT 1' },
        };
      }
      return null;
    });

    renderHook(() =>
      useInsightPreviewData({ name: 'existing-insight' }, { projectId: 'proj' })
    );

    expect(mockStartRun).not.toHaveBeenCalled();
  });
});
