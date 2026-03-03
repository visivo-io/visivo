import React, { useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import useStore from '../../stores/store';

const COLORWAY = [
  '#713B57',
  '#FFB400',
  '#003F91',
  '#D25946',
  '#1CA9C9',
  '#999999',
  '#E63946',
  '#A8DADC',
  '#457B9D',
  '#2B2B2B',
];

const EDITABLE_CONFIG = {
  responsive: true,
  displayModeBar: false,
  editable: true,
  edits: { titleText: true, axisTitleText: true, legendText: true },
};

const buildTraces = (rows, props) => {
  if (!rows?.length || !props) return [];

  const { type = 'scatter', x, y, color, size, mode, ...restProps } = props;

  const extractColumn = (colName) => {
    if (!colName) return undefined;
    return rows.map((row) => row[colName]);
  };

  // If color column is set, split data into one trace per unique color value
  if (color) {
    const groups = {};
    rows.forEach((row) => {
      const key = row[color] ?? 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    return Object.entries(groups).map(([groupName, groupRows]) => {
      const trace = { type, name: groupName };
      if (x) trace.x = groupRows.map((r) => r[x]);
      if (y) trace.y = groupRows.map((r) => r[y]);
      if (mode) trace.mode = mode;
      if (size) trace.marker = { ...trace.marker, size: groupRows.map((r) => r[size]) };
      return trace;
    });
  }

  // Single trace
  const trace = { type };
  if (x) trace.x = extractColumn(x);
  if (y) trace.y = extractColumn(y);
  if (mode) trace.mode = mode;
  if (size) trace.marker = { size: extractColumn(size) };

  // Pass through additional trace props (e.g., marker.color, line, fill, etc.)
  // but only simple scalar values, not column references
  Object.entries(restProps).forEach(([key, val]) => {
    if (key === 'name' || key === 'type') return;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      trace[key] = val;
    }
  });

  return [trace];
};

const buildLayout = (chartLayout) => {
  return {
    autosize: true,
    colorway: COLORWAY,
    margin: { l: 50, r: 20, t: 40, b: 40 },
    ...chartLayout,
  };
};

const ExplorerChartPreview = () => {
  const queryResult = useStore((s) => s.explorerQueryResult);
  const insightConfig = useStore((s) => s.explorerInsightConfig);
  const chartLayout = useStore((s) => s.explorerChartLayout);
  const syncPlotlyEdits = useStore((s) => s.syncPlotlyEditsToChartLayout);

  const hasResults = !!queryResult?.columns?.length;
  const hasAxisMapping = !!(insightConfig?.props?.x || insightConfig?.props?.y);

  const traces = useMemo(
    () => (hasResults && hasAxisMapping ? buildTraces(queryResult.rows, insightConfig.props) : []),
    [hasResults, hasAxisMapping, queryResult?.rows, insightConfig?.props]
  );

  const layout = useMemo(() => buildLayout(chartLayout), [chartLayout]);

  const handleRelayout = useCallback(
    (update) => {
      if (!update) return;
      const edits = {};
      if (update['title.text'] !== undefined) {
        edits.title = { text: update['title.text'] };
      }
      if (update['xaxis.title.text'] !== undefined) {
        edits.xaxis = { title: { text: update['xaxis.title.text'] } };
      }
      if (update['yaxis.title.text'] !== undefined) {
        edits.yaxis = { title: { text: update['yaxis.title.text'] } };
      }
      if (Object.keys(edits).length > 0) {
        syncPlotlyEdits(edits);
      }
    },
    [syncPlotlyEdits]
  );

  if (!hasResults) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-results"
      >
        <span className="text-sm text-secondary-400">Run a query to see chart preview</span>
      </div>
    );
  }

  if (!hasAxisMapping) {
    return (
      <div
        className="flex items-center justify-center h-full bg-gray-50"
        data-testid="chart-empty-no-axes"
      >
        <span className="text-sm text-secondary-400">
          Configure axes in the Insight Editor →
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white" data-testid="chart-preview">
      <Plot
        data={traces}
        layout={layout}
        config={EDITABLE_CONFIG}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
        onRelayout={handleRelayout}
      />
    </div>
  );
};

export default ExplorerChartPreview;
