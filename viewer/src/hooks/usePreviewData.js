import { useCallback } from 'react';
import { useInsightsData } from './useInsightsData';
import useStore from '../stores/store';
import { useShallow } from 'zustand/react/shallow';

/**
 * Preview data hooks — now backed by the already-built `main` run, NOT an
 * ephemeral preview run.
 *
 * The editor/explorer previews show the data the last run built; freshness comes
 * from the run-on-save loop (a save triggers a run that rebuilds `main`, and the
 * run-poller bumps `runDataVersion` so these hooks refetch). There is no
 * preview run, no polling, and no `__preview__` store namespace — insights are
 * read by name from `insightJobs` exactly like the dashboard. A brand-new insight
 * that has never been built simply has no data until it's saved (which runs).
 *
 * The hooks keep their previous return shape so their consumers
 * (InsightPreview, ChartPreview, ExplorerChartPreview, …) need no changes;
 * preview-only fields are returned as inert no-preview values.
 */

/**
 * Single-insight preview: read the built `main` data for one insight by name.
 */
export const useInsightPreviewData = (insightConfig, options = {}) => {
  const name = insightConfig?.name || null;
  const runDataVersion = useStore(state => state.runDataVersion);

  const insightsDataState = useInsightsData(
    options.projectId,
    name ? [name] : [],
    undefined, // the "main" run
    { cacheKey: runDataVersion }
  );

  const entry = useStore(
    useShallow(
      useCallback(
        state => (name ? state.insightJobs?.[name] || null : null),
        [name]
      )
    )
  );

  return {
    isLoading: insightsDataState.isInsightsLoading,
    isCompleted: !insightsDataState.isInsightsLoading,
    isFailed: false,
    error: insightsDataState.error || null,
    progress: 1,
    progressMessage: '',
    result: null,
    runId: runDataVersion,
    needsPreviewRun: false,
    status: 'completed',
    resetPreview: () => {},
    // Insights are read from the main store by name (no __preview__ prefix).
    previewInsightKey: name,
    data: entry?.data || null,
    insight: entry || null,
  };
};

/**
 * Chart-level preview: read the built `main` data for the chart's insights.
 *
 * ``previewRequest`` keeps the batched shape (``{ insight_names, context_objects }``)
 * for call-site compatibility, but only ``insight_names`` is used — the configs
 * the editor is holding are rendered from their refreshed config + the built
 * data, not a live re-query.
 */
export const useChartPreviewJob = (previewRequest, options = {}) => {
  const names = previewRequest?.insight_names || [];
  const runDataVersion = useStore(state => state.runDataVersion);

  const insightsDataState = useInsightsData(options.projectId, names, undefined, {
    cacheKey: runDataVersion,
  });

  return {
    isLoading: insightsDataState.isInsightsLoading,
    isCompleted: !insightsDataState.isInsightsLoading,
    isFailed: false,
    error: insightsDataState.error || null,
    progress: 1,
    progressMessage: '',
    runId: runDataVersion,
    previewRunId: null,
    // Insights are read from the main store by name (no __preview__ prefix).
    previewInsightKeys: names,
    status: 'completed',
    resetPreview: () => {},
  };
};
