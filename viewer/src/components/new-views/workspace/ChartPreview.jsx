import React, { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useStore from '../../../stores/store';
import Chart from '../../items/Chart';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useInputsData } from '../../../hooks/useInputsData';
import { parseRefValue } from '../../../utils/refString';

/**
 * ChartPreview — VIS-784 / N-1.
 *
 * Renders the active chart full-size via the EXISTING `<Chart>` renderer — the
 * same component the Dashboard mounts for a chart item — so a saved chart
 * previews identically to how it renders on a dashboard. No editing
 * affordances; editing lives in the right rail.
 *
 * The chart record is resolved from the chart store by name (RightRailEditPanel
 * COLLECTION_KEY['chart'] = 'charts'). Its `insights` arrive as un-resolved
 * context-string refs from the store endpoint; we normalize them into
 * `{ name }` objects exactly as <Dashboard> does (the VIS-827 fix) so
 * Chart.jsx's `chart.insights.map(i => i.name)` resolves, and we load each
 * insight's data via the same `useInsightsData` hook the Dashboard uses.
 */
const ChartPreview = ({ activeObject, projectId }) => {
  const name = activeObject?.name || null;
  const charts = useStore(s => s.charts);
  const fetchCharts = useStore(s => s.fetchCharts);

  useEffect(() => {
    if ((!charts || charts.length === 0) && typeof fetchCharts === 'function') {
      fetchCharts();
    }
  }, [charts, fetchCharts]);

  const record = useMemo(
    () => (Array.isArray(charts) ? charts.find(c => c.name === name) || null : null),
    [charts, name]
  );

  // Normalize insight refs ("${ref(name)}") → { name } objects so <Chart>
  // resolves the insight names it loads (mirrors <Dashboard>'s VIS-827 fix).
  const chart = useMemo(() => {
    if (!record) return null;
    const config = record.config || record;
    const rawInsights = Array.isArray(config.insights) ? config.insights : [];
    const insights = rawInsights.map(insight =>
      typeof insight === 'string' ? { name: parseRefValue(insight) } : insight
    );
    return {
      name: record.name,
      insights,
      traces: [],
      layout: config.layout || {},
    };
  }, [record]);

  const insightNames = useMemo(
    () => (chart?.insights || []).map(i => i?.name).filter(Boolean),
    [chart]
  );

  // Load each insight's data from the main run (the same hook the Dashboard
  // drives) plus any inputs those insights depend on.
  useInsightsData(projectId, insightNames);
  const inputDeps = useStore(
    useShallow(s => {
      const names = new Set();
      for (const n of insightNames) {
        const job = s.insightJobs?.[n];
        (job?.inputDependencies || []).forEach(dep => names.add(dep));
      }
      return Array.from(names).sort();
    })
  );
  useInputsData(projectId, inputDeps);

  if (!chart) {
    return (
      <div
        data-testid="chart-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Chart "${name}" not found.` : 'No chart selected.'}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="chart-preview" className="flex flex-1 min-h-0 bg-white p-4">
      <div className="relative h-full w-full" style={{ minWidth: 0 }}>
        <Chart chart={chart} projectId={projectId} shouldLoad={true} hideToolbar={true} />
      </div>
    </div>
  );
};

export default ChartPreview;
