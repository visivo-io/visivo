import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import { queryPropsHaveChanged, hashQueryProps } from '../utils/queryPropertyDetection';

/**
 * Generic hook for managing preview data with smart diff detection.
 *
 * This hook:
 * 1. Detects changes in query-affecting properties (those with ?{} patterns)
 * 2. Compares against cached preview config OR saved config
 * 3. Only triggers preview run when query properties have changed
 * 4. Orchestrates preview job execution and data loading
 *
 * @param {string} type - Type of object to preview ('insights', 'charts', etc.)
 * @param {Object} config - Current object configuration
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID (for fetching saved configs)
 * @param {Object} options.savedConfig - Pre-fetched saved config (bypasses fetch)
 * @returns {Object} Preview data state
 */
export const usePreviewData = (type, config, options = {}) => {
  const { projectId, savedConfig } = options;

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

    return true;
  }, [config, lastPreviewConfig, lastPreviewHash, currentHash, savedConfig]);

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
 * @param {Object} insightConfig - Insight configuration
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID
 * @param {Object} options.savedConfig - Pre-fetched saved config
 * @returns {Object} Combined preview and data state
 */
export const useInsightPreviewData = (insightConfig, options = {}) => {
  const previewState = usePreviewData('insights', insightConfig, options);

  const insightNames = useMemo(() => {
    if (!insightConfig?.name) return [];
    return [insightConfig.name];
  }, [insightConfig]);

  const runId = useMemo(() => {
    if (!insightConfig?.name) return null;
    return `preview-${insightConfig.name}`;
  }, [insightConfig]);

  const insightsDataState = useInsightsData(
    options.projectId,
    insightNames,
    runId,
    previewState.result
  );

  return {
    ...previewState,
    ...insightsDataState,
    data: insightsDataState.insights?.[insightConfig?.name]?.data || null,
    insight: insightsDataState.insights?.[insightConfig?.name] || null,
  };
};
