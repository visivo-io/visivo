import React, { useMemo } from 'react';
import Chart from '../../items/Chart';
import { usePreviewInsightData } from '../../../hooks/usePreviewData';
import { usePreviewInputDependencies } from '../workspace/usePreviewInputDependencies';
import PreviewInputControls from '../workspace/PreviewInputControls';
import { MissingRelationCard, AmbiguousRelationCard } from './InsightPreviewRelationCards';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * InsightPreview - A minimal dashboard for previewing a single insight
 *
 * This component creates a synthetic dashboard configuration with:
 * - Input controls for any inputs referenced in the insight (props + layout +
 *   interactions), always defaulted so the chart renders immediately
 * - A single chart displaying the insight
 *
 * The preview flow (VIS-1002):
 * 1. usePreviewInsightData picks MODE A (published, main-run data under the
 *    un-prefixed key) or MODE B (unsaved/edited, preview-run under __preview__).
 * 2. The synthetic chart points at the resolved key either way.
 * 3. Input widgets render via the shared PreviewInputControls (VIS-1003),
 *    outside the chart spinner gate so a value is always suppliable.
 *
 * Props:
 * - insightConfig: The insight configuration object
 * - projectId: Project ID for data loading
 * - layoutValues: Optional layout configuration for the chart
 */
const InsightPreview = ({ insightConfig, projectId, layoutValues = {} }) => {
  const { isLoading, error, errorDetails, progress, progressMessage, chartInsightKey, resetPreview } =
    usePreviewInsightData(insightConfig, { projectId });

  // Union of input widgets this insight depends on (runtime inputDependencies +
  // pendingInputs, with a props/layout/interactions config fallback), defaults
  // seeded so the chart renders without waiting.
  const insightNames = useMemo(
    () => (insightConfig?.name ? [insightConfig.name] : []),
    [insightConfig]
  );
  const { inputConfigs } = usePreviewInputDependencies(projectId, {
    insightNames,
    configForFallback: insightConfig,
  });

  const chart = useMemo(() => {
    const previewLayout = {
      autosize: true,
      margin: { l: 40, r: 10, t: 20, b: 30 },
      ...layoutValues,
    };

    if (chartInsightKey) {
      return {
        name: 'Preview Chart',
        insights: [{ name: chartInsightKey }],
        traces: [],
        layout: previewLayout,
      };
    }

    return {
      name: 'Preview Chart',
      insights: [],
      traces: [],
      layout: previewLayout,
    };
  }, [chartInsightKey, layoutValues]);

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="preview-loading"
      >
        <CircularProgress size={48} className="mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Running Preview</h3>
        <p className="text-sm text-gray-500 max-w-sm mb-2">{progressMessage}</p>
        <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (error) {
    // Typed relation failures (VIS-1007) get an inline fix card instead of a
    // dead-end red error. A successful save re-triggers the preview by
    // resetting the run state, which re-fires the preview effect.
    const errorType = errorDetails?.error_type;
    const errorModels = errorDetails?.error_models || [];
    const handleRelationSaved = () => {
      if (typeof resetPreview === 'function') resetPreview();
    };

    if (errorType === 'missing_relation' && errorModels.length >= 2) {
      return <MissingRelationCard models={errorModels} onRelationSaved={handleRelationSaved} />;
    }

    if (errorType === 'ambiguous_relation' && errorModels.length >= 2) {
      return <AmbiguousRelationCard models={errorModels} onRelationSaved={handleRelationSaved} />;
    }

    const errorMessage = typeof error === 'string' ? error : error?.message || String(error);
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="preview-error"
      >
        <h3 className="text-lg font-medium text-red-600 mb-2">Preview Failed</h3>
        <p className="text-sm text-gray-700 max-w-sm font-mono bg-red-50 p-3 rounded">
          {errorMessage}
        </p>
      </div>
    );
  }

  if (!insightConfig?.name || insightConfig.name === '__preview__') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="unsaved-insight-message"
      >
        <h3 className="text-lg font-medium text-gray-700 mb-2">Save to Preview with Data</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Save the insight and run 'visivo run' to generate preview data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PreviewInputControls inputConfigs={inputConfigs} projectId={projectId} />

      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <div className="w-full h-full relative" style={{ minWidth: 0 }}>
          <Chart
            chart={chart}
            projectId={projectId}
            itemWidth={1}
            height={400}
            width={undefined}
            shouldLoad={true}
            hideToolbar={true}
          />
        </div>
      </div>
    </div>
  );
};

export default InsightPreview;
