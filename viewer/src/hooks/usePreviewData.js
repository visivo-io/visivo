import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import { queryPropsHaveChanged, hashQueryProps } from '../utils/queryPropertyDetection';
import { DEFAULT_RUN_ID } from '../constants';

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
  const { projectId, savedConfig, needsInitialPreview = false } = options;

  const [lastPreviewConfig, setLastPreviewConfig] = useState(null);
  const [lastPreviewHash, setLastPreviewHash] = useState(null);
  const [shouldRunPreview, setShouldRunPreview] = useState(false);
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
      setShouldRunPreview(true);
      setIsLoading(true);
      setError(null);

      previewJob
        .startJob(config)
        .then(() => {
          setLastPreviewConfig(config);
          setLastPreviewHash(currentHash);
        })
        .catch(err => {
          console.error('Failed to start preview job:', err);
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
      setShouldRunPreview(false);
    } else if (previewJob.status === 'failed') {
      setIsLoading(false);
      setShouldRunPreview(false);
      setError(previewJob.error || 'Preview failed');
    }
  }, [previewJob.status, previewJob.error]);

  const resetPreview = useCallback(() => {
    previewJob.resetJob();
    setLastPreviewConfig(null);
    setLastPreviewHash(null);
    setShouldRunPreview(false);
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
    needsPreviewRun,
    resetPreview,
    status: previewJob.status,
  };
};

/**
 * Specialized hook for insight previews that combines usePreviewData with useInsightsData.
 *
 * Flow:
 * 1. Try to load from "main" run_id first
 * 2. If insight doesn't exist in main (not on dashboard), trigger initial preview with saved config
 * 3. After initial load, only trigger new previews when query properties change
 * 4. Once a preview completes, use preview result for data
 *
 * @param {Object} insightConfig - Insight configuration
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID
 * @param {Object} options.savedConfig - Pre-fetched saved config
 * @returns {Object} Combined preview and data state
 */
export const useInsightPreviewData = (insightConfig, options = {}) => {
  const [hasCheckedMain, setHasCheckedMain] = useState(false);
  const [insightNotInMain, setInsightNotInMain] = useState(false);
  const [shouldEnableQuery, setShouldEnableQuery] = useState(true);

  const insightNames = useMemo(() => {
    if (!insightConfig?.name) return [];
    return [insightConfig.name];
  }, [insightConfig]);

  // Run preview logic - will trigger initial preview if needsInitialPreview is true
  const previewState = usePreviewData('insights', insightConfig, {
    ...options,
    needsInitialPreview: insightNotInMain,
  });

  // Use preview run_id if:
  // 1. Preview has completed, OR
  // 2. Insight not in main and we're running/have started a preview
  const runId = useMemo(() => {
    if (!insightConfig?.name) return DEFAULT_RUN_ID;

    // If preview completed, use preview run_id
    if (previewState.isCompleted && previewState.result) {
      return `preview-${insightConfig.name}`;
    }

    // If insight not in main and preview is running, use preview run_id
    if (insightNotInMain && previewState.isLoading) {
      return `preview-${insightConfig.name}`;
    }

    return DEFAULT_RUN_ID;
  }, [insightConfig, previewState.isCompleted, previewState.result, previewState.isLoading, insightNotInMain]);

  // Load insights data - disable while waiting for initial check or preview
  const insightsDataState = useInsightsData(
    options.projectId,
    insightNames,
    runId,
    previewState.result,
    shouldEnableQuery
  );

  // Check if the insight exists in main run (only check once on first load)
  useEffect(() => {
    if (hasCheckedMain) return;

    // Wait for initial query to complete
    if (insightsDataState.isInsightsLoading) return;

    const insight = insightsDataState.insights?.[insightConfig?.name];
    const hasError = insightsDataState.error;

    // Mark that we've checked main
    setHasCheckedMain(true);

    // If no insight found in main run OR there was an error, trigger initial preview
    if (!insight || hasError) {
      setInsightNotInMain(true);
      setShouldEnableQuery(false); // Disable query while preview runs
    }
  }, [hasCheckedMain, insightsDataState, insightConfig]);

  // Re-enable query when preview completes
  useEffect(() => {
    if (previewState.isCompleted && previewState.result) {
      setShouldEnableQuery(true);
    }
  }, [previewState.isCompleted, previewState.result]);

  return {
    ...previewState,
    ...insightsDataState,
    data: insightsDataState.insights?.[insightConfig?.name]?.data || null,
    insight: insightsDataState.insights?.[insightConfig?.name] || null,
  };
};
