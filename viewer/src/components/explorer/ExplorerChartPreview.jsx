import { useMemo, useState, useEffect, useRef } from 'react';
import { PiCircleNotch } from 'react-icons/pi';
import ChartPreview from '../views/common/ChartPreview';
import useDraftInsightPreview, { draftInsightKey } from '../../hooks/useDraftInsightPreview';
import { useInsightsData } from '../../hooks/useInsightsData';
import { usePreviewInputDependencies } from '../views/workspace/usePreviewInputDependencies';
import PreviewInputControls from '../views/workspace/PreviewInputControls';
import useStore from '../../stores/store';
import { emitTimeToFirstChart } from '../views/workspace/telemetry';

// Stable empty-array reference (avoids a fresh `[]` literal defeating memoized
// selectors/`useMemo` deps every render — see ExplorationBuildRail.jsx's
// EMPTY_PROMOTED for the same convention).
const EMPTY_PROMOTED = [];

// VIS-1093 — a bounded polling budget for the promoted-insight bridge below:
// ~30s at 2s intervals. The run-on-save pipeline typically finishes in well
// under a second (verified via a live trace); this is generous headroom for
// a slow run, past which we stop polling forever and surface a failure state
// instead of silently spinning.
const MAX_PROMOTED_POLL_ATTEMPTS = 15;

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
 *
 * EXPLORATION-SCOPED LANE DETECTION (VIS-1091, Phase 5 preview-lane fix): a
 * bare NAME match against the project-global `state.insights` list is not
 * enough — two independently-created scratch explorations very likely mint
 * the same auto-name ("insight") for their first insight, so if EITHER ONE
 * gets promoted, the OTHER (never-promoted) exploration would incorrectly
 * treat its own still-draft insight as "promoted" the instant it renders,
 * silently swapping in unrelated real data. `promotedNames` below requires
 * BOTH a matching real `state.insights` entry AND that THIS exploration's
 * own `promoted[]` trail (`workspaceExplorations.byId[activeExplorationId]`)
 * actually recorded promoting an insight of that name.
 *
 * PER-INSIGHT LOADING/ERROR (VIS-1092): `isLoading`/`error` handed to
 * `<ChartPreview>` (which gates the WHOLE chart render on them) are computed
 * ONLY over the insights still in the draft lane — an already-promoted
 * insight showing real data is excluded, so a sibling draft insight's error
 * can never blank it.
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
  // VIS-1091 — the ACTIVE exploration's own promoted[] trail. This component
  // only ever mounts while an exploration tab is active (CenterPanel has no
  // other caller), so `workspaceActiveObject` reliably names it.
  const activeExplorationId = useStore(s =>
    s.workspaceActiveObject?.type === 'exploration' ? s.workspaceActiveObject.name : null
  );
  const explorationPromoted = useStore(s =>
    activeExplorationId
      ? s.workspaceExplorations?.byId?.[activeExplorationId]?.promoted || EMPTY_PROMOTED
      : EMPTY_PROMOTED
  );

  const draftPreview = useDraftInsightPreview();

  // Chart insights that are ALSO real, published objects THIS EXPLORATION
  // ITSELF promoted (VIS-1091 — never a bare cross-exploration name match).
  const promotedNames = useMemo(
    () =>
      chartInsightNames.filter(name => {
        const isRealInsight = (realInsights || []).some(i => i.name === name);
        if (!isRealInsight) return false;
        return explorationPromoted.some(p => p.type === 'insight' && p.name === name);
      }),
    [chartInsightNames, realInsights, explorationPromoted]
  );

  // Poll every 2s while any promoted insight is still missing its real data
  // — the run-on-save pipeline typically finishes in well under a second
  // (verified via a live trace), but nothing else on this surface would ever
  // ask again once the first attempt lands before the run does. Stops
  // itself the instant every promoted name has data, on unmount, OR once
  // MAX_PROMOTED_POLL_ATTEMPTS is exhausted (VIS-1093 — a run that never
  // completes server-side used to spin this forever with no failure state).
  const [pollTick, setPollTick] = useState(0);
  const [pollExhausted, setPollExhausted] = useState(false);
  const pollAttemptsRef = useRef(0);
  const hasPromotedWithoutRealData = promotedNames.some(
    name => !storeInsightJobs?.[name]?.data
  );
  const pollKey = promotedNames.join('|');
  useEffect(() => {
    // A NEW set of promoted-without-data names (e.g. a fresh promote) gets a
    // fresh polling budget — it must not inherit exhaustion from a prior one.
    pollAttemptsRef.current = 0;
    setPollExhausted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollKey]);
  useEffect(() => {
    if (!hasPromotedWithoutRealData) return undefined;
    const timer = setInterval(() => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > MAX_PROMOTED_POLL_ATTEMPTS) {
        setPollExhausted(true);
        clearInterval(timer);
        return;
      }
      setPollTick(t => t + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, [hasPromotedWithoutRealData]);

  const { error: promotedFetchError } =
    useInsightsData(projectId, promotedNames, undefined, { cacheKey: pollTick }) || {};
  const promotedPollFailed = hasPromotedWithoutRealData && (pollExhausted || !!promotedFetchError);

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

  // VIS-1092 — `<ChartPreview>` (unlike `Chart.jsx`) gates its ENTIRE render
  // on `isLoading`/`error` — a single Plotly figure needs every insight's
  // data to draw at all, so there's no such thing as "render just the good
  // insight." The fix is therefore two-layered:
  //   1. Only DRAFT-LANE insights (not already resolved to a real promoted
  //      key) can even contribute a loading/error/blocked status — a
  //      promoted insight's own real-data fetch is a separate lane entirely
  //      (the poll bridge below), never this hook's concern.
  //   2. Once ANY chart insight (promoted OR draft) already has data on
  //      screen, suppress the whole-chart loading/error gate outright —
  //      never regress an already-rendering chart back to a blank "Preview
  //      Failed"/spinner screen because a background recompute is chasing a
  //      sibling insight's edit. (`Chart.jsx`'s OWN `hasAllInsightData` gate
  //      still applies underneath — it shows its own gentler generic
  //      "Loading" state, never an alarming error, until every insight has
  //      data again.)
  const draftLaneNames = useMemo(
    () => chartInsightNames.filter((name, idx) => previewInsightKeys[idx] === draftInsightKey(name)),
    [chartInsightNames, previewInsightKeys]
  );
  const anyInsightAlreadyHasData = previewInsightKeys.some(key => storeInsightJobs?.[key]?.data != null);
  const draftLaneIsLoading =
    !anyInsightAlreadyHasData &&
    draftLaneNames.some(name => draftPreview.perInsight?.[name]?.isLoading);
  const draftLaneError = anyInsightAlreadyHasData
    ? null
    : draftLaneNames.map(name => draftPreview.perInsight?.[name]?.error).find(Boolean) || null;
  const draftLaneBlockedStatus = anyInsightAlreadyHasData
    ? null
    : draftLaneNames.map(name => draftPreview.perInsight?.[name]).find(s => s?.blockedReason);

  // VIS-1072 — `time_to_first_chart`: fires the FIRST time any chart insight
  // (draft or promoted) actually has data on screen for THIS exploration.
  // `emitTimeToFirstChart` itself is idempotent per exploration id (a no-op
  // on every subsequent render once fired), so this effect can just keep
  // re-checking the condition on every relevant state change with no extra
  // bookkeeping here.
  useEffect(() => {
    if (activeExplorationId && anyInsightAlreadyHasData) {
      emitTimeToFirstChart(activeExplorationId);
    }
  }, [activeExplorationId, anyInsightAlreadyHasData]);

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
  // model_schemas override (no cached query result yet). Scoped to the
  // DRAFT LANE (VIS-1092) — a blocked still-draft sibling must not blank an
  // already-rendering promoted insight either.
  if (draftLaneBlockedStatus?.blockedReason === 'model_not_run') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full bg-gray-50 gap-2 p-6 text-center"
        data-testid="chart-preview-run-first"
      >
        <PiCircleNotch className="h-5 w-5 text-secondary-300" aria-hidden="true" />
        <span className="text-sm font-medium text-secondary-600">
          Run the query{draftLaneBlockedStatus.blockedModel ? ` for "${draftLaneBlockedStatus.blockedModel}"` : ''}{' '}
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
      {/* VIS-1093 — the promoted-poll bridge's failure path: surfaced as a
          dismissible-by-nature banner (disappears once data lands or the
          promoted set changes), never an infinite silent spinner. */}
      {promotedPollFailed && (
        <div
          data-testid="chart-preview-promoted-poll-failed"
          className="px-3 py-1.5 text-xs text-highlight-700 bg-highlight-50 border-b border-highlight-200"
        >
          Couldn&apos;t load the promoted chart&apos;s data
          {promotedFetchError ? `: ${promotedFetchError.message || promotedFetchError}` : ' yet'}.
          It may still be running server-side — try reopening this exploration.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ChartPreview
          chartConfig={chartConfig}
          insightKeys={previewInsightKeys}
          projectId={projectId}
          onLayoutChange={syncPlotlyEdits}
          editableLayout={true}
          isLoading={draftLaneIsLoading}
          error={draftLaneError}
        />
      </div>
    </div>
  );
};

export default ExplorerChartPreview;
