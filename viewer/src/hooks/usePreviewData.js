import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePreviewJob } from './usePreviewJob';
import { useInsightsData } from './useInsightsData';
import {
  queryPropsHaveChanged,
  hashQueryProps,
  extractNonQueryProps,
  extractQueryAffectingProps,
} from '../utils/queryPropertyDetection';
import useStore from '../stores/store';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_RUN_ID } from '../constants';

/**
 * Build the batched preview POST body for a single insight.
 * Used by useInsightPreviewData to adapt the single-insight API to the
 * backend's list-based contract.
 */
const buildSingleInsightBody = (insightConfig, extraContextObjects = {}) => ({
  insight_names: [insightConfig.name],
  context_objects: {
    ...extraContextObjects,
    insights: [insightConfig],
  },
});

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
 * @param {Object} config - Current object configuration (used for diff hashing)
 * @param {Object} options - Optional configuration
 * @param {string} options.projectId - Project ID (for fetching saved configs)
 * @param {Object} options.savedConfig - Pre-fetched saved config (bypasses fetch)
 * @param {boolean} options.needsInitialPreview - If true, run preview even on first load
 * @param {Object} options.requestBody - POST body for the batched preview contract.
 *   Expected shape: { insight_names: [...], context_objects: {...} }. If not
 *   provided, a single-insight body is built from `config`.
 * @returns {Object} Preview data state
 */
export const usePreviewData = (type, config, options = {}) => {
  const { savedConfig, needsInitialPreview = false, requestBody, extraContextObjects } = options;

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
    errorDetails: jobErrorDetails,
    progress,
    progressMessage,
    result,
    runId,
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

      const body = requestBody || buildSingleInsightBody(config, extraContextObjects);

      startRun(body)
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
  }, [config, needsPreviewRun, startRun, isRunning, currentHash, requestBody, extraContextObjects]);

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
    // Structured fields for the typed-error UI (VIS-1007). Only set on a
    // missing/ambiguous relation failure; null otherwise.
    errorDetails: jobErrorDetails,
    progress,
    progressMessage,
    result,
    runId,
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

  // Load insights data when preview completes. The backend now puts the real
  // filesystem run_id (preview-{job_id}) in result.run_id; read it from there
  // instead of hardcoding preview-{insightName}.
  const previewRunId =
    previewState.isCompleted && previewState.result?.run_id ? previewState.result.run_id : null;

  const insightsDataState = useInsightsData(
    options.projectId,
    insightConfig?.name ? [insightConfig.name] : [],
    previewRunId,
    { storeKeyPrefix: PREVIEW_STORE_PREFIX, cacheKey: previewState.runId }
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

/**
 * Shared two-mode insight-preview resolver (VIS-1002 / design §2 + §8.3).
 *
 * Decides where a single previewed insight's data lives and which synthetic
 * chart key to point the renderer at, mirroring what the dashboard already
 * does. The mode is gated on the presence of the insight's MAIN-run job entry
 * (`insightNotInMain = !insightJobs[name]`) — NOT on data completeness — so it
 * does not flap while inputs resolve:
 *
 *   MODE A — published / saved (dominant case): the insight already has
 *     main-run data, so point the synthetic chart at the UN-prefixed key
 *     `insightJobs[name]` and load via `useInsightsData(projectId, [name])` at
 *     the default `runId='main'` (no prefix) — the exact path
 *     `workspace/ChartPreview` uses. No preview run, no spinner hang. The prior
 *     bug always targeted `__preview__name` and only loaded via a preview run
 *     that fires when the insight is ABSENT — so published insights never
 *     loaded (inverted).
 *
 *   MODE B — unsaved / never-run / query-affecting edit: keep the existing
 *     `__preview__`-prefixed preview-run path (`useInsightPreviewData`). The
 *     Explorer right-rail editor (`ExplorerChartPreview`/`useChartPreviewJob`)
 *     depends on this path, so it must not regress.
 *
 * Both underlying hooks are always called (rules of hooks); the result is
 * selected by mode. The canvas is BIDIRECTIONAL like the dashboard — every
 * config change re-runs MODE B (no staleness gate here) and inputs always
 * default, so there is no "waiting for input" empty state.
 *
 * @param {Object} insightConfig - Insight configuration object (must have name)
 * @param {Object} options
 * @param {string} options.projectId
 * @returns {Object} { chartInsightKey, isLoading, error, insightNotInMain, ...modeBState }
 */
export const usePreviewInsightData = (insightConfig, options = {}) => {
  const insightName = insightConfig?.name || null;

  // Mode is keyed on PRESENCE of the main-run job entry, never data
  // completeness — that's what keeps the mode from flapping while an
  // input-driven insight resolves its default value.
  const insightNotInMain = useStore(
    useCallback(
      state => {
        if (!insightName) return false;
        return !state.insightJobs?.[insightName];
      },
      [insightName]
    )
  );

  // MODE B path (existing): preview-run under the __preview__ prefix. Always
  // invoked so it tracks edits, but only SELECTED when insightNotInMain.
  const previewState = useInsightPreviewData(insightConfig, options);

  // MODE A path: load the published insight's main-run data under its
  // un-prefixed key — identical to the dashboard / ChartPreview call.
  const mainState = useInsightsData(
    options.projectId,
    insightName ? [insightName] : [],
    DEFAULT_RUN_ID
  );

  if (insightNotInMain) {
    return {
      ...previewState,
      chartInsightKey: previewState.previewInsightKey,
      insightNotInMain: true,
    };
  }

  return {
    chartInsightKey: insightName,
    isLoading: mainState.isInsightsLoading,
    error: mainState.error,
    // MODE A reads published main-run data (no preview run), so a typed
    // missing-relation failure can't arise here — keep the shape consistent.
    errorDetails: null,
    progress: 0,
    progressMessage: '',
    insightNotInMain: false,
  };
};

/**
 * Batched chart-level preview hook.
 *
 * Takes a full request body matching the backend's batched preview contract
 * ({ insight_names, context_objects }) and orchestrates:
 *
 *   1. One POST to /api/insight-jobs/ per distinct request (debounced by hash).
 *   2. Polling via usePreviewJob until the run completes.
 *   3. Reading result.run_id from the polling response (the real filesystem run_id).
 *   4. Fetching every insight's data via useInsightsData with that run_id,
 *      storing each under insightJobs[__preview__<name>].
 *
 * Consumers (e.g., ExplorerChartPreview) pass chartInsightNames and the explorer's
 * in-flight working stores as overrides; Chart.jsx reads the results from the
 * store by name and renders them together.
 *
 * @param {Object|null} previewRequest - { insight_names: [...], context_objects: {...} }
 *   or null when there's nothing to preview.
 * @param {Object} options
 * @param {string} options.projectId
 * @returns {Object} Preview state
 */
export const useChartPreviewJob = (previewRequest, options = {}) => {
  const { projectId } = options;

  const {
    startRun,
    resetRun,
    isRunning,
    isCompleted,
    isFailed,
    status: jobStatus,
    error: jobError,
    errorDetails: jobErrorDetails,
    progress,
    progressMessage,
    result,
    runId,
  } = usePreviewJob();

  // The "run hash" hashes ONLY the parts of the request that affect
  // the SQL pipeline: trace types, query-string props (?{...}), and
  // interactions. Static prop changes (color, mode, delta.relative,
  // axis labels, etc.) hash to the same value as before, so they
  // don't trigger a re-run — the local-update effect below patches
  // them into insightJobs directly. This avoids round-tripping
  // through the backend for cosmetic edits that don't change the SQL
  // or the data.
  const runHash = useMemo(() => {
    if (!previewRequest || !previewRequest.insight_names?.length) return null;
    const stripStatic = insight => {
      const { props, ...rest } = insight;
      const queryProps = props ? extractQueryAffectingProps(props) : {};
      return {
        ...rest,
        // Keep type — different trace types resolve to different
        // schemas, so a type swap should still re-run.
        type: props?.type,
        props: queryProps,
      };
    };
    const insights = (previewRequest.context_objects?.insights || []).map(stripStatic);
    return JSON.stringify({
      insight_names: previewRequest.insight_names,
      context_objects: {
        ...previewRequest.context_objects,
        insights,
      },
    });
  }, [previewRequest]);

  const [lastFiredHash, setLastFiredHash] = useState(null);
  const [hasCompletedFirstRun, setHasCompletedFirstRun] = useState(false);
  const [localError, setLocalError] = useState(null);
  const fireRef = useRef(false);

  useEffect(() => {
    if (!runHash) return;
    if (runHash === lastFiredHash) return;
    if (fireRef.current) return;
    if (isRunning) return;

    fireRef.current = true;
    setLocalError(null);

    startRun(previewRequest)
      .then(() => {
        setLastFiredHash(runHash);
      })
      .catch(err => {
        console.error('Failed to start chart preview run:', err);
        setLocalError(err.message || 'Failed to start preview');
      })
      .finally(() => {
        fireRef.current = false;
      });
  }, [runHash, previewRequest, startRun, isRunning, lastFiredHash]);

  // Track whether at least one run has completed, so static-only
  // changes can begin applying locally. Before any run completes
  // there's nothing in insightJobs to patch.
  useEffect(() => {
    if (isCompleted) setHasCompletedFirstRun(true);
  }, [isCompleted]);

  // Local-update path: when previewRequest changes in a way that
  // didn't move runHash, the change is static-only — patch each
  // insight's static_props (and type, if changed) into the preview
  // store directly so the chart re-renders without a backend round
  // trip. Mirrors the single-insight path in useInsightPreviewData.
  useEffect(() => {
    if (!hasCompletedFirstRun) return;
    if (isRunning) return;
    if (!previewRequest?.context_objects?.insights) return;

    const updateInsightJob = useStore.getState().updateInsightJob;
    const currentJobs = useStore.getState().insightJobs || {};

    for (const insight of previewRequest.context_objects.insights) {
      const key = PREVIEW_STORE_PREFIX + insight.name;
      const existing = currentJobs[key];
      if (!existing?.data) continue;
      const { type: newType, ...restProps } = insight.props || {};
      const newStaticProps = extractNonQueryProps(restProps);
      const typeChanged = newType !== existing.type;
      const staticChanged =
        JSON.stringify(newStaticProps) !== JSON.stringify(existing.static_props);
      if (!typeChanged && !staticChanged) continue;

      const payload = {};
      if (typeChanged) payload.type = newType;
      if (staticChanged) payload.static_props = newStaticProps;
      updateInsightJob(key, payload);
    }
  }, [previewRequest, hasCompletedFirstRun, isRunning]);

  // Real filesystem run_id comes from the polling response on completion.
  const previewRunId = useMemo(() => {
    if (!isCompleted) return null;
    return result?.run_id || null;
  }, [isCompleted, result]);

  const namesToLoad = useMemo(
    () => (previewRunId ? previewRequest?.insight_names || [] : []),
    [previewRunId, previewRequest]
  );

  const insightsDataState = useInsightsData(projectId, namesToLoad, previewRunId, {
    storeKeyPrefix: PREVIEW_STORE_PREFIX,
    cacheKey: runId,
  });

  const resetPreview = useCallback(() => {
    resetRun();
    setLastFiredHash(null);
    setHasCompletedFirstRun(false);
    setLocalError(null);
  }, [resetRun]);

  return {
    isLoading: isRunning || insightsDataState.isInsightsLoading,
    isCompleted,
    isFailed,
    error: localError || jobError || insightsDataState.error,
    errorDetails: jobErrorDetails,
    progress,
    progressMessage,
    runId,
    previewRunId,
    previewInsightKeys: namesToLoad.map(name => PREVIEW_STORE_PREFIX + name),
    status: jobStatus,
    resetPreview,
  };
};
