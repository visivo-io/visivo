import { useMemo, useState, useEffect, useRef } from 'react';
import { PiCircleNotch, PiCursorClick } from 'react-icons/pi';
import ChartPreview from '../views/common/ChartPreview';
import useDraftInsightPreview, { draftInsightKey } from '../../hooks/useDraftInsightPreview';
import { useInsightsData } from '../../hooks/useInsightsData';
import { usePreviewInputDependencies } from '../views/workspace/usePreviewInputDependencies';
import PreviewInputControls from '../views/workspace/PreviewInputControls';
import useStore from '../../stores/store';
import { emitTimeToFirstChart } from '../views/workspace/telemetry';
import { buildInsightFreshnessSignature } from '../../utils/insightFreshnessSignature';

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
 * PROMOTED-DATA FRESHNESS (P5-D1 -> P6-D1/D2/D3/D8 closure,
 * e2e-gap-review.md "Phase 6 delta pass"): the promoted-lane switch above
 * was originally a ONE-WAY RATCHET — once `promotedNames` included a name
 * and `insightJobs[name].data` existed, every future render kept preferring
 * the real key forever, even after the user kept editing that insight's
 * props/interactions post-promote ("promote early, keep refining" silently
 * broke: the chart froze on the promote-moment snapshot). The FIRST fix
 * (P5-D1) tried to repair this with a component-instance ref
 * (`promotedDataSignatureRef`) that captured "what the insight looked like"
 * the moment a new `data` reference was FIRST SEEN — but that mechanism was
 * wrong in three ways the Phase 6 delta review (P6-D1/D2/D3/D8) confirmed:
 *   1. A component-instance ref dies on remount — any tab park/resume (or
 *      exploration switch) unmounts/remounts this component, so the ref was
 *      always empty on resume and the FIRST post-resume render would
 *      recapture whatever the CURRENT (possibly since-edited) insight state
 *      was as if it described the STALE data already sitting in
 *      `insightJobs` — resurrecting the exact "stuck on stale data" bug the
 *      fix was supposed to have closed (P6-D1, HIGH).
 *   2. The signature was captured at DATA-ARRIVAL time, not at
 *      promote-invoke time — an edit made between clicking promote and the
 *      run's data landing got silently absorbed as if the (pre-edit) data
 *      represented the (post-edit) state (P6-D3/D8).
 *   3. The signature only ever covered `insightStates[name]`
 *      (type/props/interactions) — a promoted MODEL's SQL/row-count changing
 *      post-promote left the insight signature untouched, so the real lane
 *      never unlocked for a model-only edit (P6-D2).
 *
 * The fix: `explorerStore.js`'s `explorerPromotedSignatures` (a durable,
 * per-exploration STORE field, not a component ref) records each promoted
 * insight's full `insightFreshnessSignature.js` signature — type, props,
 * interactions, AND every referenced model's SQL/source/row-count, the exact
 * same fingerprint `useDraftInsightPreview.js`'s own recompute trigger uses —
 * captured SYNCHRONOUSLY by `promoteExploration`
 * (`workspaceExplorationsStore.js`) at the moment promote was invoked, frozen
 * before any save/run async work runs. Because it lives in the same Zustand
 * slice as `explorerInsightStates`, it round-trips through the exact same
 * `snapshotExplorerWorkingState`/`restoreExplorerWorkingState` park/resume
 * cycle — surviving a remount instead of resetting to empty. Below, a
 * promoted name resolves to the real key ONLY when the CURRENT full
 * signature still equals the recorded one; any divergence (an insight edit,
 * OR a referenced model edit, at ANY point after promote) falls back to the
 * draft-namespaced key, which resumes the normal live draft-compile preview
 * immediately. There is no data-reference-triggered recapture at all — only
 * a fresh `promoteExploration` call ever writes a new signature.
 *
 * (Residual, out of scope for this pass: two DIFFERENT explorations that
 * both hold a draft insight literally named the same as a just-(re)promoted
 * insight can still observe each other's fresh data for that name if BOTH
 * happen to have recorded an identical signature for that name — real
 * cross-exploration isolation would require scoping `insightJobs` itself per
 * exploration, a larger change to the shared run/dashboard rendering
 * pipeline. Tracked as a follow-up; this fix closes the reported "stuck
 * forever"/"silently reverts" symptoms, which are the common case.)
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
  const modelStates = useStore(s => s.explorerModelStates);
  // P6-D1/D2/D3/D8 — the durable, store-backed promoted-lane freshness
  // signature (replaces the component-instance ref; see the docstring above).
  const promotedSignatures = useStore(s => s.explorerPromotedSignatures);
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

  // P6-D1/D2/D3/D8 — the shared signature (insight type/props/interactions
  // PLUS every referenced model's SQL/source/row-count), computed the exact
  // same way `useDraftInsightPreview.js`'s own recompute trigger is.
  const insightSignature = name => buildInsightFreshnessSignature(insightStates[name], modelStates);

  // Per-insight lane: the REAL name once its real data has actually landed
  // AND the CURRENT full signature still matches the one recorded at
  // promote-invoke time (never just because it's promoted — avoids both a
  // flash of empty/error chart state in the gap between promote and the run
  // finishing, and a stale snapshot surviving an insight OR model edit made
  // after promotion); the draft-namespaced key otherwise. No data-reference-
  // triggered recapture here at all — `promotedSignatures` is only ever
  // written by `promoteExploration` (see `explorerStore.js`'s
  // `recordPromotedInsightSignature` and this file's docstring).
  const previewInsightKeys = useMemo(
    () =>
      chartInsightNames.map(name => {
        if (!promotedNames.includes(name)) return draftInsightKey(name);
        const data = storeInsightJobs?.[name]?.data;
        if (!data) return draftInsightKey(name);

        const recordedSig = promotedSignatures?.[name];
        if (!recordedSig) return draftInsightKey(name);
        return recordedSig === insightSignature(name) ? name : draftInsightKey(name);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartInsightNames, promotedNames, storeInsightJobs, promotedSignatures, insightStates, modelStates]
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

  // ux-audit.md "unresolved-input misclassification" finding (cold-start #3,
  // promote-roundtrip #3, pills #3): a model reference authored via the
  // Build rail's own pill drops (`?{${ref(model).column}}`) is picked up by
  // the SAME regex `extractInputDependenciesFromProps` uses to find real
  // Input references — the two are textually indistinguishable without
  // knowing what names are actually models. `usePreviewInputDependencies`
  // excludes PUBLISHED model names on its own (`state.models`); draft/
  // not-yet-promoted model tabs only exist here (`explorerModelStates`), so
  // they're passed explicitly.
  const extraModelNames = useMemo(() => Object.keys(modelStates || {}), [modelStates]);

  const { inputConfigs, unresolvedNames } = usePreviewInputDependencies(projectId, {
    insightNames: draftPreview.previewInsightKeys,
    configForFallback,
    extraModelNames,
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
          Run your query{draftLaneBlockedStatus.blockedModel ? ` for "${draftLaneBlockedStatus.blockedModel}"` : ''}{' '}
          to see a preview
        </span>
        <span className="text-xs text-secondary-400 max-w-sm">
          This chart references a column on a model that hasn&apos;t returned any rows yet.
        </span>
      </div>
    );
  }

  // ux-audit.md "infinite spinner" finding (cold-start #2, pills #3): nothing
  // has been mapped to this insight yet (no x/y/etc.), so there is genuinely
  // nothing to compile or load — a guided empty state, never a spinner that
  // waits on a request that was never made.
  if (draftLaneBlockedStatus?.blockedReason === 'no_data_props') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full bg-gray-50 gap-2 p-6 text-center"
        data-testid="chart-preview-empty-no-props"
      >
        <PiCursorClick className="h-5 w-5 text-secondary-300" aria-hidden="true" />
        <span className="text-sm font-medium text-secondary-600">Nothing to preview yet</span>
        <span className="text-xs text-secondary-400 max-w-sm">
          Drag a column from the results grid onto a field (like x or y) to see a chart preview.
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
          Input{unresolvedNames.length === 1 ? '' : 's'}{' '}
          {unresolvedNames.map(n => `"${n}"`).join(', ')}{' '}
          {unresolvedNames.length === 1 ? "isn't" : "aren't"} defined in this project yet.
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
          Couldn&apos;t load this chart&apos;s saved data
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
