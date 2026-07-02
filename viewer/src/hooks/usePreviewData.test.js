import { renderHook, act, waitFor } from '@testing-library/react';
import {
  usePreviewData,
  useInsightPreviewData,
  usePreviewInsightData,
  useChartPreviewJob,
} from './usePreviewData';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import {
  queryPropsHaveChanged,
  hashQueryProps,
  extractNonQueryProps,
  extractQueryAffectingProps,
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
      runId: null,
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
    expect(result.current.runId).toBeNull();
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('exposes runId from previewJob', () => {
    usePreviewJob.mockReturnValue({ ...mockPreviewJobBase, runId: 'run-456' });

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' })
    );

    expect(result.current.runId).toBe('run-456');
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
    // New batched contract: single-insight auto-wraps into {insight_names, context_objects}
    expect(mockStartRun).toHaveBeenCalledWith({
      insight_names: ['test'],
      context_objects: { insights: [config] },
    });
  });

  test('triggers preview when needsInitialPreview is true and no prior preview', () => {
    const config = { name: 'test', props: { x: '?{col1}' } };

    const { result } = renderHook(() =>
      usePreviewData('insights', config, { needsInitialPreview: true })
    );

    expect(result.current.needsPreviewRun).toBe(true);
    expect(mockStartRun).toHaveBeenCalledWith({
      insight_names: ['test'],
      context_objects: { insights: [config] },
    });
  });

  test('passes explicit requestBody when provided instead of wrapping config', () => {
    const config = { name: 'test', props: { x: '?{col1}' } };
    const requestBody = {
      insight_names: ['test', 'other'],
      context_objects: { insights: [config, { name: 'other' }] },
    };

    renderHook(() =>
      usePreviewData('insights', config, { needsInitialPreview: true, requestBody })
    );

    expect(mockStartRun).toHaveBeenCalledWith(requestBody);
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
      runId: 'run-done',
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

  test('passes through structured errorDetails from previewJob (VIS-1007)', () => {
    usePreviewJob.mockReturnValue({
      ...mockPreviewJobBase,
      status: 'failed',
      isFailed: true,
      error: 'No relation connects orders and users.',
      errorDetails: { error_type: 'missing_relation', error_models: ['orders', 'users'] },
    });

    const { result } = renderHook(() => usePreviewData('insights', { name: 'test' }));

    expect(result.current.errorDetails).toEqual({
      error_type: 'missing_relation',
      error_models: ['orders', 'users'],
    });
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

  test('after a successful run, an identical config does not re-trigger (hash gate)', async () => {
    mockStartRun.mockResolvedValueOnce('run-1');
    const config = { name: 'test', props: { x: '?{col1}' } };

    const { result, rerender } = renderHook(
      ({ cfg }) => usePreviewData('insights', cfg, { needsInitialPreview: true }),
      { initialProps: { cfg: config } }
    );

    // Once startRun resolves, the last-preview hash is recorded and the same
    // config hashes equal → no further run needed.
    await waitFor(() => expect(result.current.needsPreviewRun).toBe(false));

    rerender({ cfg: { ...config } });
    expect(result.current.needsPreviewRun).toBe(false);
    expect(mockStartRun).toHaveBeenCalledTimes(1);
  });

  test('re-runs when query props change relative to the LAST PREVIEWED config', async () => {
    mockStartRun.mockResolvedValue('run');
    const config1 = { name: 'test', props: { x: '?{col1}' } };
    const config2 = { name: 'test', props: { x: '?{col2}' } };

    const { result, rerender } = renderHook(
      ({ cfg }) => usePreviewData('insights', cfg, { needsInitialPreview: true }),
      { initialProps: { cfg: config1 } }
    );
    await waitFor(() => expect(result.current.needsPreviewRun).toBe(false));

    // The second config diffs against the cached previewed config, not savedConfig.
    queryPropsHaveChanged.mockReturnValue(true);
    rerender({ cfg: config2 });

    expect(queryPropsHaveChanged).toHaveBeenCalledWith(config2, config1);
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(2));
    expect(mockStartRun).toHaveBeenLastCalledWith({
      insight_names: ['test'],
      context_objects: { insights: [config2] },
    });
  });

  test('surfaces a startRun failure as error and stops loading', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce(new Error('server down'));

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' }, { needsInitialPreview: true })
    );

    await waitFor(() => expect(result.current.error).toBe('server down'));
    expect(result.current.isLoading).toBe(false);
    // The failed hash is recorded so the same config doesn't retry in a loop.
    expect(result.current.needsPreviewRun).toBe(false);
    consoleSpy.mockRestore();
  });

  test('falls back to a generic message when the startRun failure has no message', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce({});

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' }, { needsInitialPreview: true })
    );

    await waitFor(() => expect(result.current.error).toBe('Failed to start preview'));
    consoleSpy.mockRestore();
  });

  test('resetPreview clears a previous error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() =>
      usePreviewData('insights', { name: 'test' }, { needsInitialPreview: true })
    );
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => {
      result.current.resetPreview();
    });

    expect(result.current.error).toBeNull();
    expect(mockResetRun).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('useInsightPreviewData', () => {
  let mockStartRun;
  let mockResetRun;

  const makePreviewJob = (overrides = {}) => ({
    runId: null,
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

    useStore.mockStoreState = {
      insightJobs: {},
      updateInsightJob: jest.fn(),
    };
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(useStore.mockStoreState);
      }
      return undefined;
    });
    useStore.getState = jest.fn(() => useStore.mockStoreState);
  });

  test('passes null runId to useInsightsData when preview not completed', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({ runId: 'run-abc', status: 'running', isRunning: true })
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

  test('passes run_id from result when preview is completed', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runId: 'run-456',
        status: 'completed',
        isCompleted: true,
        // New contract: backend returns run_id in the polling result
        result: { insights: {}, run_id: 'preview-run-456' },
      })
    );

    renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj-1' })
    );

    expect(useInsightsData).toHaveBeenCalledWith(
      'proj-1',
      ['my-insight'],
      'preview-run-456',
      { storeKeyPrefix: '__preview__', cacheKey: 'run-456' }
    );
  });

  test('passes null runId when result is completed but has no run_id', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runId: 'run-456',
        status: 'completed',
        isCompleted: true,
        result: {},
      })
    );

    renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj-1' })
    );

    expect(useInsightsData).toHaveBeenCalledWith(
      'proj-1',
      ['my-insight'],
      null,
      { storeKeyPrefix: '__preview__', cacheKey: 'run-456' }
    );
  });

  test('passes runId as cacheKey to useInsightsData', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runId: 'unique-run-id-789',
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
    useStore.mockStoreState.insightJobs = {
      '__preview__my-insight': {
        data: [{ x: 1, y: 2 }],
        type: 'scatter',
      },
    };

    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.data).toEqual([{ x: 1, y: 2 }]);
    expect(result.current.insight).toEqual({ data: [{ x: 1, y: 2 }], type: 'scatter' });
  });

  test('returns null data when store has no preview data', () => {
    const { result } = renderHook(() =>
      useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
    );

    expect(result.current.data).toBeNull();
    expect(result.current.insight).toBeNull();
  });

  test('detects insight not in main store and sets needsInitialPreview', () => {
    renderHook(() =>
      useInsightPreviewData({ name: 'new-insight' }, { projectId: 'proj' })
    );

    expect(mockStartRun).toHaveBeenCalled();
  });

  test('does not trigger initial preview when insight exists in main store', () => {
    useStore.mockStoreState.insightJobs = {
      'existing-insight': { data: [{ x: 1 }], query: 'SELECT 1' },
    };

    renderHook(() =>
      useInsightPreviewData({ name: 'existing-insight' }, { projectId: 'proj' })
    );

    expect(mockStartRun).not.toHaveBeenCalled();
  });

  describe('static-only patch path (no preview re-run)', () => {
    const seedStores = (previewEntry = {}) => {
      useStore.mockStoreState.insightJobs = {
        // Present in main → no initial preview run fires.
        'my-insight': { data: [{ x: 1 }] },
        '__preview__my-insight': {
          data: [{ x: 1 }],
          type: 'scatter',
          static_props: { mode: 'lines' },
          ...previewEntry,
        },
      };
    };

    test('patches changed type AND static_props into the preview store entry', () => {
      seedStores();
      extractNonQueryProps.mockReturnValue({ mode: 'markers' });

      renderHook(() =>
        useInsightPreviewData(
          { name: 'my-insight', props: { type: 'bar', mode: 'markers' } },
          { projectId: 'proj' }
        )
      );

      expect(mockStartRun).not.toHaveBeenCalled();
      expect(useStore.mockStoreState.updateInsightJob).toHaveBeenCalledWith(
        '__preview__my-insight',
        { type: 'bar', static_props: { mode: 'markers' } }
      );
    });

    test('patches only static_props when the type is unchanged', () => {
      seedStores();
      extractNonQueryProps.mockReturnValue({ mode: 'markers' });

      renderHook(() =>
        useInsightPreviewData(
          { name: 'my-insight', props: { type: 'scatter', mode: 'markers' } },
          { projectId: 'proj' }
        )
      );

      expect(useStore.mockStoreState.updateInsightJob).toHaveBeenCalledWith(
        '__preview__my-insight',
        { static_props: { mode: 'markers' } }
      );
    });

    test('does NOT patch when neither type nor static props changed', () => {
      seedStores();
      extractNonQueryProps.mockReturnValue({ mode: 'lines' });

      renderHook(() =>
        useInsightPreviewData(
          { name: 'my-insight', props: { type: 'scatter', mode: 'lines' } },
          { projectId: 'proj' }
        )
      );

      expect(useStore.mockStoreState.updateInsightJob).not.toHaveBeenCalled();
    });

    test('does NOT patch when the preview entry has no data yet', () => {
      useStore.mockStoreState.insightJobs = {
        'my-insight': { data: [{ x: 1 }] },
        '__preview__my-insight': { type: 'scatter', static_props: {} },
      };
      extractNonQueryProps.mockReturnValue({ mode: 'markers' });

      renderHook(() =>
        useInsightPreviewData(
          { name: 'my-insight', props: { type: 'bar', mode: 'markers' } },
          { projectId: 'proj' }
        )
      );

      expect(useStore.mockStoreState.updateInsightJob).not.toHaveBeenCalled();
    });

    test('does NOT patch when the config has no props', () => {
      seedStores();

      renderHook(() =>
        useInsightPreviewData({ name: 'my-insight' }, { projectId: 'proj' })
      );

      expect(useStore.mockStoreState.updateInsightJob).not.toHaveBeenCalled();
    });
  });
});

describe('useChartPreviewJob — runHash gating', () => {
  let mockStartRun;
  let mockResetRun;

  const makePreviewJob = (overrides = {}) => ({
    runId: null,
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

    // Pending promise so .then() never fires — keeps the
    // post-resolve state update outside the test's render cycle and
    // avoids React act warnings without needing explicit act wrappers.
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

    // The hook depends on the real extractor logic to decide what
    // counts as query-affecting; mocking it away would defeat the
    // gating test. Provide a thin stand-in that mirrors the real
    // implementation just enough for the cases below.
    extractQueryAffectingProps.mockImplementation(props => {
      if (!props || typeof props !== 'object') return {};
      const out = {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v === 'string' && /\?\{/.test(v)) out[k] = v;
      }
      return out;
    });
    extractNonQueryProps.mockImplementation(props => {
      if (!props || typeof props !== 'object') return {};
      const out = {};
      for (const [k, v] of Object.entries(props)) {
        if (!(typeof v === 'string' && /\?\{/.test(v))) out[k] = v;
      }
      return out;
    });

    useStore.mockStoreState = {
      insightJobs: {},
      updateInsightJob: jest.fn(),
    };
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(useStore.mockStoreState);
      }
      return undefined;
    });
    useStore.getState = jest.fn(() => useStore.mockStoreState);
  });

  const buildRequest = (props = { type: 'indicator', value: '?{MAX(x)}', mode: 'number' }) => ({
    insight_names: ['ind'],
    context_objects: {
      insights: [{ name: 'ind', props }],
    },
  });

  // Note on the gating mechanism: with pendingPromise(), startRun()
  // never resolves, so lastFiredHash never advances past null. The
  // skip path is instead enforced by `fireRef.current` (set true
  // before startRun, never cleared because .finally never fires).
  // That single-flight guard is what stops the second startRun call
  // for static-only changes. The check below verifies that.

  test('fires startRun on first request', () => {
    renderHook(() => useChartPreviewJob(buildRequest(), { projectId: 'p' }));
    expect(mockStartRun).toHaveBeenCalledTimes(1);
  });

  test('does NOT re-fire startRun when only a static prop changes', () => {
    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );
    expect(mockStartRun).toHaveBeenCalledTimes(1);

    rerender({ req: buildRequest({ type: 'indicator', value: '?{MAX(x)}', mode: 'delta' }) });
    expect(mockStartRun).toHaveBeenCalledTimes(1);
  });

  test('re-fires startRun when a query-string prop changes', async () => {
    // For runHash to advance after the first call, lastFiredHash
    // needs to flip — give the first startRun a resolving promise
    // so the .then handler runs and clears fireRef + advances state.
    // Subsequent calls keep using the pending default from beforeEach.
    mockStartRun.mockReturnValueOnce(Promise.resolve('run-1'));

    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(1));

    rerender({ req: buildRequest({ type: 'indicator', value: '?{MIN(x)}', mode: 'number' }) });
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(2));
  });

  test('re-fires startRun when type changes', async () => {
    mockStartRun.mockReturnValueOnce(Promise.resolve('run-1'));
    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(1));

    rerender({ req: buildRequest({ type: 'scatter', value: '?{MAX(x)}', mode: 'number' }) });
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(2));
  });

  test('re-fires startRun when interactions change', async () => {
    mockStartRun.mockReturnValueOnce(Promise.resolve('run-1'));
    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(1));

    const withInteraction = {
      insight_names: ['ind'],
      context_objects: {
        insights: [
          {
            name: 'ind',
            props: { type: 'indicator', value: '?{MAX(x)}', mode: 'number' },
            interactions: [{ filter: '?{x > 0}' }],
          },
        ],
      },
    };
    rerender({ req: withInteraction });
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(2));
  });

  test('after first run completes, static-only change patches insightJobs locally', () => {
    // Seed insightJobs so the local-update branch has something to
    // patch when hasCompletedFirstRun flips true.
    useStore.mockStoreState.insightJobs = {
      __preview__ind: {
        data: [{ x: 1 }],
        type: 'indicator',
        static_props: { mode: 'number' },
      },
    };

    let isCompleted = false;
    usePreviewJob.mockImplementation(() =>
      makePreviewJob({ isCompleted, status: isCompleted ? 'completed' : null })
    );

    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );

    // Flip the mocked job to completed and re-render to flush the
    // hasCompletedFirstRun effect.
    isCompleted = true;
    rerender({ req: buildRequest() });

    // Static-only change: mode flips number → delta. Must not fire
    // a new run, but should patch insightJobs locally.
    rerender({ req: buildRequest({ type: 'indicator', value: '?{MAX(x)}', mode: 'delta' }) });

    expect(mockStartRun).toHaveBeenCalledTimes(1);
    expect(useStore.mockStoreState.updateInsightJob).toHaveBeenCalledWith(
      '__preview__ind',
      expect.objectContaining({
        static_props: expect.objectContaining({ mode: 'delta' }),
      })
    );
  });

  test('does not patch locally before first run completes', () => {
    // hasCompletedFirstRun stays false (preview job never reports
    // completion), so the local-update path is gated off.
    const { rerender } = renderHook(
      ({ req }) => useChartPreviewJob(req, { projectId: 'p' }),
      { initialProps: { req: buildRequest() } }
    );

    rerender({ req: buildRequest({ type: 'indicator', value: '?{MAX(x)}', mode: 'delta' }) });
    expect(useStore.mockStoreState.updateInsightJob).not.toHaveBeenCalled();
  });

  test('does not fire for a null request or an empty insight_names list', () => {
    const { rerender } = renderHook(({ req }) => useChartPreviewJob(req, { projectId: 'p' }), {
      initialProps: { req: null },
    });
    expect(mockStartRun).not.toHaveBeenCalled();

    rerender({ req: { insight_names: [], context_objects: { insights: [] } } });
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('surfaces a failed startRun as error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce(new Error('kaboom'));

    // A stable request object: a fresh object per render would re-trigger the
    // fire effect (which clears the local error) on every render.
    const req = buildRequest();
    const { result } = renderHook(() => useChartPreviewJob(req, { projectId: 'p' }));

    await waitFor(() => expect(result.current.error).toBe('kaboom'));
    consoleSpy.mockRestore();
  });

  test('falls back to a generic message when the failure has no message', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce({});

    const req = buildRequest();
    const { result } = renderHook(() => useChartPreviewJob(req, { projectId: 'p' }));

    await waitFor(() => expect(result.current.error).toBe('Failed to start preview'));
    consoleSpy.mockRestore();
  });

  test('on completion, exposes the filesystem run_id and loads data under __preview__ keys', () => {
    usePreviewJob.mockReturnValue(
      makePreviewJob({
        runId: 'job-1',
        status: 'completed',
        isCompleted: true,
        result: { run_id: 'preview-42' },
      })
    );

    const { result } = renderHook(() => useChartPreviewJob(buildRequest(), { projectId: 'p' }));

    expect(result.current.previewRunId).toBe('preview-42');
    expect(result.current.previewInsightKeys).toEqual(['__preview__ind']);
    expect(useInsightsData).toHaveBeenCalledWith('p', ['ind'], 'preview-42', {
      storeKeyPrefix: '__preview__',
      cacheKey: 'job-1',
    });
  });

  test('loads no insight names until the run completes', () => {
    const { result } = renderHook(() => useChartPreviewJob(buildRequest(), { projectId: 'p' }));

    expect(result.current.previewRunId).toBeNull();
    expect(result.current.previewInsightKeys).toEqual([]);
    expect(useInsightsData).toHaveBeenCalledWith('p', [], null, {
      storeKeyPrefix: '__preview__',
      cacheKey: null,
    });
  });

  test('resetPreview resets the underlying job and clears the local error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartRun.mockRejectedValueOnce(new Error('kaboom'));

    const req = buildRequest();
    const { result } = renderHook(() => useChartPreviewJob(req, { projectId: 'p' }));
    await waitFor(() => expect(result.current.error).toBe('kaboom'));

    act(() => {
      result.current.resetPreview();
    });

    expect(mockResetRun).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
  });

  test('surfaces an insights-data load error', () => {
    useInsightsData.mockReturnValue({
      insights: {},
      insightsData: {},
      isInsightsLoading: false,
      hasAllInsightData: false,
      error: 'parquet fetch failed',
    });

    const { result } = renderHook(() => useChartPreviewJob(buildRequest(), { projectId: 'p' }));

    expect(result.current.error).toBe('parquet fetch failed');
  });
});

// ---------------------------------------------------------------------------
// usePreviewInsightData — the two-mode resolver (VIS-1002 / design §2 + §8.3).
//
// MODE A (published/saved, insight present in the main run): point the chart at
//   the UN-prefixed key and load via useInsightsData(projectId, [name], 'main').
// MODE B (unsaved/never-run, insight ABSENT from the main run): keep the
//   __preview__-prefixed preview-run path (must not regress).
// ---------------------------------------------------------------------------
describe('usePreviewInsightData — MODE-A / MODE-B selection', () => {
  let mockStartRun;
  let mockResetRun;

  const makePreviewJob = (overrides = {}) => ({
    runId: null,
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

    useStore.mockStoreState = { insightJobs: {}, updateInsightJob: jest.fn() };
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(useStore.mockStoreState);
      }
      return undefined;
    });
    useStore.getState = jest.fn(() => useStore.mockStoreState);
  });

  test('MODE A: published insight (present in main run) points chart at the un-prefixed key', () => {
    // Insight IS in the main run → insightNotInMain=false → MODE A.
    useStore.mockStoreState.insightJobs = {
      sales: { data: [{ x: 1 }], query: 'SELECT 1' },
    };

    const { result } = renderHook(() =>
      usePreviewInsightData({ name: 'sales' }, { projectId: 'proj-1' })
    );

    // The synthetic chart targets the UN-prefixed key (= the dashboard key).
    expect(result.current.chartInsightKey).toBe('sales');
    expect(result.current.insightNotInMain).toBe(false);
  });

  test('MODE A: loads main-run data via useInsightsData at runId=main, no prefix', () => {
    useStore.mockStoreState.insightJobs = {
      sales: { data: [{ x: 1 }], query: 'SELECT 1' },
    };

    renderHook(() => usePreviewInsightData({ name: 'sales' }, { projectId: 'proj-1' }));

    // The MODE-A load is the exact ChartPreview/dashboard call: default runId,
    // no storeKeyPrefix.
    expect(useInsightsData).toHaveBeenCalledWith('proj-1', ['sales'], 'main');
  });

  test('MODE A: does NOT fire a preview run for a published insight', () => {
    useStore.mockStoreState.insightJobs = {
      sales: { data: [{ x: 1 }], query: 'SELECT 1' },
    };

    renderHook(() => usePreviewInsightData({ name: 'sales' }, { projectId: 'proj-1' }));

    expect(mockStartRun).not.toHaveBeenCalled();
  });

  test('MODE B: unsaved/never-run insight (absent from main) uses the __preview__ key', () => {
    // Insight is NOT in the main run → insightNotInMain=true → MODE B.
    const { result } = renderHook(() =>
      usePreviewInsightData({ name: 'draft' }, { projectId: 'proj-1' })
    );

    expect(result.current.chartInsightKey).toBe('__preview__draft');
    expect(result.current.insightNotInMain).toBe(true);
  });

  test('MODE B: fires a preview run for an absent insight (regression guard)', () => {
    renderHook(() => usePreviewInsightData({ name: 'draft' }, { projectId: 'proj-1' }));

    // The existing preview-run path (useInsightPreviewData → startRun) still
    // fires for the never-run case — ExplorerChartPreview depends on this.
    expect(mockStartRun).toHaveBeenCalled();
  });

  test('returns null chartInsightKey when config has no name', () => {
    const { result } = renderHook(() => usePreviewInsightData({}, { projectId: 'proj-1' }));

    // No name → insightNotInMain=false → MODE A returns the (null) name as key.
    expect(result.current.chartInsightKey).toBeNull();
  });
});
