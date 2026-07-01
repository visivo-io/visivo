import { useMemo, useCallback } from 'react';
import Chart from '../../items/Chart';
import CircularProgress from '@mui/material/CircularProgress';

const EDITABLE_PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: false,
  editable: true,
  edits: { titleText: true, axisTitleText: true, legendText: true },
};

const READONLY_PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: false,
};

/**
 * ChartPreview - presentational wrapper around <Chart> that renders loading/error/empty
 * states and forwards a list of insight store keys to the renderer.
 *
 * Callers are responsible for driving the underlying preview job (via
 * useChartPreviewJob or useInsightPreviewData) and passing the resulting
 * store keys in `insightKeys`.
 */
const ChartPreview = ({
  chartConfig,
  insightKeys,
  projectId,
  onLayoutChange,
  editableLayout = true,
  isLoading = false,
  error = null,
  progress = 0,
  progressMessage = '',
}) => {
  const chartInsights = useMemo(
    () => (insightKeys || []).filter(Boolean).map(name => ({ name })),
    [insightKeys]
  );

  const chartLayout = useMemo(
    () => ({
      autosize: true,
      margin: { l: 70, r: 70, t: 50, b: 70 },
      ...chartConfig?.layout,
    }),
    [chartConfig?.layout]
  );

  const chart = useMemo(
    () => ({
      name: chartConfig?.name || 'Preview Chart',
      insights: chartInsights,
      traces: [],
      layout: chartLayout,
    }),
    [chartConfig?.name, chartInsights, chartLayout]
  );

  const plotlyConfig = useMemo(
    () => (editableLayout ? EDITABLE_PLOTLY_CONFIG : READONLY_PLOTLY_CONFIG),
    [editableLayout]
  );

  const handleRelayout = useCallback(
    update => {
      if (!update || !onLayoutChange) return;
      const layoutUpdates = {};
      if (update['title.text'] !== undefined) {
        layoutUpdates.title = { text: update['title.text'] };
      }
      if (update['xaxis.title.text'] !== undefined) {
        layoutUpdates.xaxis = { title: { text: update['xaxis.title.text'] } };
      }
      if (update['yaxis.title.text'] !== undefined) {
        layoutUpdates.yaxis = { title: { text: update['yaxis.title.text'] } };
      }
      if (Object.keys(layoutUpdates).length > 0) {
        onLayoutChange(layoutUpdates);
      }
    },
    [onLayoutChange]
  );

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="chart-preview-loading"
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
    const errorMessage = typeof error === 'string' ? error : error?.message || String(error);
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="chart-preview-error"
      >
        <h3 className="text-lg font-medium text-red-600 mb-2">Preview Failed</h3>
        <p className="text-sm text-gray-700 max-w-sm font-mono bg-red-50 p-3 rounded">
          {errorMessage}
        </p>
      </div>
    );
  }

  if (chartInsights.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-preview-empty"
      >
        <span className="text-sm text-secondary-400">Drag columns to axis fields to see chart preview</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden" data-testid="chart-preview">
      <div className="w-full h-full relative" style={{ minWidth: 0 }}>
        <Chart
          chart={chart}
          projectId={projectId}
          shouldLoad={true}
          hideToolbar={true}
          plotlyConfig={plotlyConfig}
          onRelayout={editableLayout ? handleRelayout : undefined}
        />
      </div>
    </div>
  );
};

export default ChartPreview;
