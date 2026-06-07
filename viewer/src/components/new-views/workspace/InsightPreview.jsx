import React, { useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import ExplorerInsightPreview from '../common/InsightPreview';

/**
 * InsightPreview — VIS-798 / N-5.
 *
 * Renders the active insight as a chart via Explorer's EXISTING render path —
 * the `common/InsightPreview` component (the one the Explorer / right-rail
 * editor use), which builds a synthetic single-insight chart, mounts the input
 * controls the insight depends on, and drives data through
 * `useInsightPreviewData`. No editing affordances — editing lives in the right
 * rail.
 *
 * The insight record is resolved from the insight store by name
 * (RightRailEditPanel COLLECTION_KEY['insight'] = 'insights'); we hand the saved
 * config (with its name) to the shared preview, which reuses the main-run data
 * when present and otherwise triggers a preview run.
 */
const InsightPreview = ({ activeObject, projectId }) => {
  const name = activeObject?.name || null;
  const insights = useStore(s => s.insights);
  const fetchInsights = useStore(s => s.fetchInsights);

  useEffect(() => {
    if ((!insights || insights.length === 0) && typeof fetchInsights === 'function') {
      fetchInsights();
    }
  }, [insights, fetchInsights]);

  const record = useMemo(
    () => (Array.isArray(insights) ? insights.find(i => i.name === name) || null : null),
    [insights, name]
  );

  const insightConfig = useMemo(() => {
    if (!record) return null;
    const config = record.config || record;
    return { name: record.name, ...config };
  }, [record]);

  if (!insightConfig) {
    return (
      <div
        data-testid="insight-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Insight "${name}" not found.` : 'No insight selected.'}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="insight-preview" className="flex flex-1 min-h-0 flex-col bg-white">
      <ExplorerInsightPreview insightConfig={insightConfig} projectId={projectId} />
    </div>
  );
};

export default InsightPreview;
