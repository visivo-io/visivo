import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import { queryPropsHaveChanged, hashQueryProps, extractNonQueryProps } from '../utils/queryPropertyDetection';
import useStore from '../stores/store';
import { useShallow } from 'zustand/react/shallow';

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
  const { savedConfig, needsInitialPreview = false, extraPreviewBody } = options;

  const [lastPreviewConfig, setLastPreviewConfig] = useState(null);
  const [lastPreviewHash, setLastPreviewHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const previewJobInitializedRef = useRef(false);

  const {
    startRun,
    resetRun,
    isRunning,
    isCompleted,
    isFailed,
    status: jobStatus,
    error: jobError,
    progress,
    progressMessage,
    result,
    runInstanceId,
  } = usePreviewJob();

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

    if (needsPreviewRun && !isRunning && !previewJobInitializedRef.current) {
      previewJobInitializedRef.current = true;

      setIsLoading(true);
      setError(null);

      startRun(config, extraPreviewBody)
        .then(() => {
          setLastPreviewConfig(config);
          setLastPreviewHash(currentHash);
        })
        .catch(err => {
          console.error('Failed to start preview run:', err);
          setError(err.message || 'Failed to start preview');
          setIsLoading(false);
          setLastPreviewHash(currentHash);
        })
        .finally(() => {
          previewJobInitializedRef.current = false;
        });
    }
  }, [config, needsPreviewRun, startRun, isRunning, currentHash, extraPreviewBody]);

  useEffect(() => {
    if (jobStatus === 'completed') {
      setIsLoading(false);
      setError(null);
    } else if (jobStatus === 'failed') {
      setIsLoading(false);
      setError(jobError || 'Preview failed');
    }
  }, [jobStatus, jobError]);

  const resetPreview = useCallback(() => {
    resetRun();
    setLastPreviewConfig(null);
    setLastPreviewHash(null);
    setIsLoading(false);
    setError(null);
  }, [resetRun]);

  return {
    isLoading: isLoading || isRunning,
    isCompleted,
    isFailed,
    error: error || jobError,
    progress,
    progressMessage,
    result,
    runInstanceId,
    needsPreviewRun,
    resetPreview,
    status: jobStatus,
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
  const previewInsightKey = insightConfig?.name
    ? PREVIEW_STORE_PREFIX + insightConfig.name
    : null;

  // Targeted selectors: only re-render when the specific insight entries change,
  // not when ANY insight job in the store changes
  const mainInsightName = insightConfig?.name || null;
  const insightNotInMain = useStore(
    useCallback(state => {
      if (!mainInsightName) return false;
      return !state.insightJobs?.[mainInsightName];
    }, [mainInsightName])
  );

  const previewInsightEntry = useStore(
    useShallow(
      useCallback(state => {
        if (!previewInsightKey) return null;
        return state.insightJobs?.[previewInsightKey] || null;
      }, [previewInsightKey])
    )
  );

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
    isLoading: previewState.isLoading || insightsDataState.isInsightsLoading,
    error: previewState.error || insightsDataState.error,
    previewInsightKey,
    data: previewInsightEntry?.data || null,
    insight: previewInsightEntry || null,
  };
};
