import { useMemo } from 'react';
import { PiCircleNotch } from 'react-icons/pi';
import ChartPreview from '../views/common/ChartPreview';
import useDraftInsightPreview from '../../hooks/useDraftInsightPreview';
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
 */
const ExplorerChartPreview = () => {
  const chartLayout = useStore(s => s.explorerChartLayout);
  const chartName = useStore(s => s.explorerChartName);
  const syncPlotlyEdits = useStore(s => s.setChartLayout);
  const projectId = useStore(s => s.project?.id);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const insightStates = useStore(s => s.explorerInsightStates);

  const draftPreview = useDraftInsightPreview();

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
          insightKeys={draftPreview.previewInsightKeys}
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
