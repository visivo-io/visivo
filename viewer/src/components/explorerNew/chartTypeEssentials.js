/**
 * Chart-type-specific essential property paths.
 *
 * For each chart type, lists the property paths most users want to set when
 * configuring an Insight. These power the "Show essentials only / Show all"
 * toggle in the Insight property panel so new users aren't overwhelmed by
 * Plotly's full property surface (e.g., 286 props for scatter).
 *
 * Path format matches the SchemaEditor's flat dot-notation keys (e.g.,
 * `marker.color`, `line.width`).
 */
export const CHART_TYPE_ESSENTIALS = {
  scatter: ['x', 'y', 'mode', 'name', 'marker.color', 'marker.size', 'line.color', 'line.width'],
  bar: ['x', 'y', 'name', 'marker.color', 'marker.line.color', 'marker.line.width', 'orientation'],
  line: ['x', 'y', 'name', 'mode', 'line.color', 'line.width', 'line.shape'],
  pie: ['labels', 'values', 'name', 'hole', 'marker.colors', 'textposition', 'textinfo'],
  area: ['x', 'y', 'name', 'fill', 'fillcolor', 'line.color', 'mode'],
  histogram: ['x', 'y', 'name', 'marker.color', 'nbinsx', 'nbinsy', 'orientation'],
  box: ['x', 'y', 'name', 'marker.color', 'boxpoints', 'jitter'],
  heatmap: ['x', 'y', 'z', 'name', 'colorscale', 'reversescale', 'showscale'],
  table: ['header.values', 'cells.values', 'columnwidth'],
  indicator: ['mode', 'value', 'title.text', 'gauge.axis.range', 'delta.reference'],
};

/**
 * Layout essentials apply to ALL chart types — the most commonly tweaked
 * properties on the chart-level (not insight-level) Layout panel.
 */
export const LAYOUT_ESSENTIALS = [
  'title.text',
  'xaxis.title.text',
  'xaxis.type',
  'yaxis.title.text',
  'yaxis.type',
  'showlegend',
  'legend.orientation',
  'paper_bgcolor',
  'plot_bgcolor',
  'margin.t',
  'margin.b',
  'margin.l',
  'margin.r',
];

/**
 * Fallback essential paths for chart types not explicitly listed above.
 */
const DEFAULT_ESSENTIALS = ['x', 'y', 'name'];

/**
 * Get the essential property paths for a given Insight chart type.
 * @param {string} chartType - The chart type (e.g., 'scatter', 'bar')
 * @returns {Array<string>} Array of dot-notation property paths
 */
export function getEssentialsForChartType(chartType) {
  return CHART_TYPE_ESSENTIALS[chartType] || DEFAULT_ESSENTIALS;
}

/**
 * Get the essential property paths for the Layout panel.
 * @returns {Array<string>} Array of dot-notation property paths
 */
export function getLayoutEssentials() {
  return LAYOUT_ESSENTIALS;
}
