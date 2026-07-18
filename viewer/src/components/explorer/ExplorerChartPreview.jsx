import { useMemo, useState, useEffect } from 'react';
import { PiCircleNotch } from 'react-icons/pi';
import ChartPreview from '../views/common/ChartPreview';
import useDraftInsightPreview, { draftInsightKey } from '../../hooks/useDraftInsightPreview';
import { useInsightsData } from '../../hooks/useInsightsData';
import { usePreviewInputDependencies } from '../views/workspace/usePreviewInputDependencies';
import PreviewInputControls from '../views/workspace/PreviewInputControls';
import useStore from '../../stores/store';

/**
 * ExplorerChartPreview — Explore 2.0 Phase 4 (S2's resolved design, VIS-1026's
 * ExplorerChartPreview half). Live, client-side chart preview for the
 * exploration surface's UNSAVED draft — REPLACES the dead `context_objects`
 * overlay this component used to build (B6): that payload was constructed
 * (`insightOverrides`/`modelOverrides`/`inputOverrides`) and sent as part of
 * `useChartPreviewJob`'s `previewRequest`, but `usePreviewData.js`'s
 * `useChartPreviewJob` only ever reads `previewRequest.insight_names` — the
 * `context_objects` half was 100% dead compute (confirmed by direct read of
 * `usePreviewData.js`).
 *
 * `useDraftInsightPreview` now does the real work: debounced compile-draft
 * calls -> synthetic draft-namespaced `insightJobs` entries -> the same
 * `<ChartPreview>`/`<Chart>` renderer real (main-run) data already uses (S2
 * Q1 — Chart.jsx is shape-agnostic about how an entry got populated).
 *
 * PROMOTED-LANE SWITCH (integration-gate fix cycle root cause): once a chart
 * insight is promoted, its data should come from the REAL (un-namespaced)
 * `insightJobs` entry the standard run-on-save pipeline populates — never
 * stay stuck showing the draft-namespaced snapshot from the moment before
 * promotion. That pipeline's only existing trigger, `runStore.js`'s
 * `runDataVersion` (bumped by `useRunPolling`), is mounted exclusively on
 * `Home.jsx`'s Dashboard surface — nothing on the Explorer route ever asks
 * `useInsightsData` for a freshly-promoted insight's real data, so
 * `insightJobs[name]` stayed `undefined` forever no matter how long a caller
 * waited. This component now polls for it directly, scoped to its own
 * lifetime, for exactly the chart's insights that have a matching real
 * `state.insights` entry (refreshed by `saveInsight`'s own `fetchInsights()`
 * call immediately after a successful promote).
 */
const ExplorerChartPreview = () => {
  const chartLayout = useStore(s => s.explorerChartLayout);
  const chartName = useStore(s => s.explorerChartName);
  const syncPlotlyEdits = useStore(s => s.setChartLayout);
  const projectId = useStore(s => s.project?.id);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const insightStates = useStore(s => s.explorerInsightStates);
  const realInsights = useStore(s => s.insights);
  const storeInsightJobs = useStore(s => s.insightJobs);

  const draftPreview = useDraftInsightPreview();

  // Chart insights that are ALSO real, published objects (post-promote).
  const promotedNames = useMemo(
    () => chartInsightNames.filter(name => (realInsights || []).some(i => i.name === name)),
    [chartInsightNames, realInsights]
  );

  // Poll every 2s while any promoted insight is still missing its real data
  // — the run-on-save pipeline typically finishes in well under a second
  // (verified via a live trace), but nothing else on this surface would ever
  // ask again once the first attempt lands before the run does. Stops
  // itself the instant every promoted name has data (or on unmount).
  const [pollTick, setPollTick] = useState(0);
  const hasPromotedWithoutRealData = promotedNames.some(
    name => !storeInsightJobs?.[name]?.data
  );
  useEffect(() => {
    if (!hasPromotedWithoutRealData) return undefined;
    const timer = setInterval(() => setPollTick(t => t + 1), 2000);
    return () => clearInterval(timer);
  }, [hasPromotedWithoutRealData]);

  useInsightsData(projectId, promotedNames, undefined, { cacheKey: pollTick });

  // Per-insight lane: the REAL name once its real data has actually landed
  // (never just because it's promoted — avoids a flash of empty/error chart
  // state in the gap between promote and the run finishing); the draft-
  // namespaced key otherwise.
  const previewInsightKeys = useMemo(
    () =>
      chartInsightNames.map(name =>
        promotedNames.includes(name) && storeInsightJobs?.[name]?.data
          ? name
          : draftInsightKey(name)
      ),
    [chartInsightNames, promotedNames, storeInsightJobs]
  );

  // Config-fallback source for `usePreviewInputDependencies` (02 §6):
  // extracts referenced input names from props/interactions text directly —
  // works identically whether or not the insight has ever been compiled.
  const configForFallback = useMemo(
    () => ({
      insights: chartInsightNames.map(name => ({
        props: insightStates[name]?.props,
        interactions: insightStates[name]?.interactions,
      })),
    }),
    [chartInsightNames, insightStates]
  );

  const { inputConfigs, unresolvedNames } = usePreviewInputDependencies(projectId, {
    insightNames: draftPreview.previewInsightKeys,
    configForFallback,
  });

  const chartConfig = useMemo(
    () => ({
      name: chartName || 'Preview Chart',
      layout: chartLayout,
    }),
    [chartName, chartLayout]
  );

  if (!chartInsightNames || chartInsightNames.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-insights"
      >
        <span className="text-sm text-secondary-400">Add an insight to see chart preview</span>
      </div>
    );
  }

  // Graceful "run the query first" state (S2's one known sub-gap): a raw-
  // column ref names a never-run scratch model with no schema anywhere —
  // neither a real schemas/<model>/schema.json NOR a client-supplied
  // model_schemas override (no cached query result yet).
  if (draftPreview.blockedReason === 'model_not_run') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full bg-gray-50 gap-2 p-6 text-center"
        data-testid="chart-preview-run-first"
      >
        <PiCircleNotch className="h-5 w-5 text-secondary-300" aria-hidden="true" />
        <span className="text-sm font-medium text-secondary-600">
          Run the query{draftPreview.blockedModel ? ` for "${draftPreview.blockedModel}"` : ''}{' '}
          to preview this chart
        </span>
        <span className="text-xs text-secondary-400 max-w-sm">
          This insight references a column on a model that hasn&apos;t returned any rows yet.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PreviewInputControls inputConfigs={inputConfigs} projectId={projectId} />
      {unresolvedNames.length > 0 && (
        <div
          data-testid="chart-preview-unresolved-inputs"
          className="px-3 py-1.5 text-xs text-highlight-700 bg-highlight-50 border-b border-highlight-200"
        >
          References input{unresolvedNames.length === 1 ? '' : 's'}{' '}
          {unresolvedNames.map(n => `"${n}"`).join(', ')} — not yet promoted.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ChartPreview
          chartConfig={chartConfig}
          insightKeys={previewInsightKeys}
          projectId={projectId}
          onLayoutChange={syncPlotlyEdits}
          editableLayout={true}
          isLoading={draftPreview.isLoading}
          error={draftPreview.error}
        />
      </div>
    </div>
  );
};

export default ExplorerChartPreview;
