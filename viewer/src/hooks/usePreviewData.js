import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import { queryPropsHaveChanged, hashQueryProps, extractNonQueryProps } from '../utils/queryPropertyDetection';
import useStore from '../stores/store';

/**
 * Generic hook for managing preview data with smart diff detection.
 *
 * This hook:
 * 1. Detects changes in query-affecting properties (those with ?{} patterns)
 * 2. Compares against cached preview config OR saved config
 * 3. Only triggers preview run when query properties have changed
 * 4. Orchestrates preview job execution and data loading
 * 5. Optionally triggers initial preview if no data exists in main run
 *
 * @param {string} type - Type of object to preview ('insights', 'charts', etc.)
 * @param {Object} config - Current object configuration
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID (for fetching saved configs)
 * @param {Object} options.savedConfig - Pre-fetched saved config (bypasses fetch)
 * @param {boolean} options.needsInitialPreview - If true, run preview even on first load
 * @returns {Object} Preview data state
 */
export const usePreviewData = (type, config, options = {}) => {
  const { savedConfig, needsInitialPreview = false } = options;

  const [lastPreviewConfig, setLastPreviewConfig] = useState(null);
  const [lastPreviewHash, setLastPreviewHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const previewJobInitializedRef = useRef(false);

  const previewJob = usePreviewJob();

  const currentHash = useMemo(() => {
    if (!config) return null;
    return hashQueryProps(config);
  }, [config]);

  const needsPreviewRun = useMemo(() => {
    if (!config) return false;

    if (lastPreviewHash && currentHash === lastPreviewHash) {
      return false;
    }

    if (lastPreviewConfig) {
      return queryPropsHaveChanged(config, lastPreviewConfig);
    }

    if (savedConfig) {
      return queryPropsHaveChanged(config, savedConfig);
    }

    // If needsInitialPreview is true and we haven't run a preview yet, trigger one
    if (needsInitialPreview && !lastPreviewConfig) {
      return true;
    }

    return false;
  }, [config, lastPreviewConfig, lastPreviewHash, currentHash, savedConfig, needsInitialPreview]);

  useEffect(() => {
    if (!config) return;

    if (needsPreviewRun && !previewJob.isRunning && !previewJobInitializedRef.current) {
      previewJobInitializedRef.current = true;

      setIsLoading(true);
      setError(null);

      previewJob
        .startRun(config)
        .then(() => {
          setLastPreviewConfig(config);
          setLastPreviewHash(currentHash);
        })
        .catch(err => {
          console.error('Failed to start preview run:', err);
          setError(err.message || 'Failed to start preview');
          setIsLoading(false);
        })
        .finally(() => {
          previewJobInitializedRef.current = false;
        });
    }
  }, [config, needsPreviewRun, previewJob, currentHash]);

  useEffect(() => {
    if (previewJob.status === 'completed') {
      setIsLoading(false);

      setError(null);
    } else if (previewJob.status === 'failed') {
      setIsLoading(false);

      setError(previewJob.error || 'Preview failed');
    }
  }, [previewJob.status, previewJob.error]);

  const resetPreview = useCallback(() => {
    previewJob.resetRun();
    setLastPreviewConfig(null);
    setLastPreviewHash(null);
    setIsLoading(false);
    setError(null);
  }, [previewJob]);

  return {
    isLoading: isLoading || previewJob.isRunning,
    isCompleted: previewJob.isCompleted,
    isFailed: previewJob.isFailed,
    error: error || previewJob.error,
    progress: previewJob.progress,
    progressMessage: previewJob.progressMessage,
    result: previewJob.result,
    runInstanceId: previewJob.runInstanceId,
    needsPreviewRun,
    resetPreview,
    status: previewJob.status,
  };
};

/**
 * Specialized hook for insight previews that combines usePreviewData with useInsightsData.
 *
 * Simple flow:
 * 1. Check if insight exists in insight job store (from "main" run)
 * 2. If not in store, trigger preview
 * 3. When preview completes, load the preview result data
 * 4. On config changes, re-run preview and reload data
 *
 * @param {Object} insightConfig - Insight configuration
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID
 * @param {Object} options.savedConfig - Pre-fetched saved config
 * @returns {Object} Combined preview and data state
 */
const PREVIEW_STORE_PREFIX = '__preview__';

export const useInsightPreviewData = (insightConfig, options = {}) => {
  const storeInsightData = useStore(state => state.insightJobs);

  const previewInsightKey = insightConfig?.name
    ? PREVIEW_STORE_PREFIX + insightConfig.name
    : null;

  // Check if insight exists in the store (loaded from main run)
  const insightNotInMain = useMemo(() => {
    if (!insightConfig?.name) return false;
    return !storeInsightData?.[insightConfig.name];
  }, [insightConfig, storeInsightData]);

  // Run preview logic - will trigger initial preview if needsInitialPreview is true
  const previewState = usePreviewData('insights', insightConfig, {
    ...options,
    needsInitialPreview: insightNotInMain,
  });

  // Load insights data when preview completes.
  // runId is null until preview completes, so useInsightsData won't fetch before data is on disk.
  // cacheKey = runInstanceId ensures React Query re-fetches on each new preview run
  // (since runId is the same preview-{name} string every time).
  const previewRunId = previewState.isCompleted ? `preview-${insightConfig?.name}` : null;

  const insightsDataState = useInsightsData(
    options.projectId,
    insightConfig?.name ? [insightConfig.name] : [],
    previewRunId,
    { storeKeyPrefix: PREVIEW_STORE_PREFIX, cacheKey: previewState.runInstanceId }
  );

  useEffect(() => {
    if (!insightConfig?.props || !previewInsightKey) return;
    if (previewState.needsPreviewRun || previewState.isLoading) return;

    const existing = useStore.getState().insightJobs?.[previewInsightKey];
    if (!existing?.data) return;

    const { type: newType, ...restProps } = insightConfig.props;
    const newStaticProps = extractNonQueryProps(restProps);

    const typeChanged = newType !== existing.type;
    const staticChanged = JSON.stringify(newStaticProps) !== JSON.stringify(existing.static_props);
    if (!typeChanged && !staticChanged) return;

    const payload = {};
    if (typeChanged) payload.type = newType;
    if (staticChanged) payload.static_props = newStaticProps;

    useStore.getState().updateInsightJob(previewInsightKey, payload);
  }, [insightConfig, previewInsightKey, previewState.needsPreviewRun, previewState.isLoading]);

  return {
    ...previewState,
    ...insightsDataState,
    previewInsightKey,
    data: storeInsightData?.[previewInsightKey]?.data || null,
    insight: storeInsightData?.[previewInsightKey] || null,
  };
};
