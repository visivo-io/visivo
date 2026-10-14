// Plotly colours these by label (slices, nodes, lines) rather than by trace.
const LABEL_COLORED_TYPES = new Set([
  'pie',
  'funnelarea',
  'sunburst',
  'treemap',
  'icicle',
  'sankey',
  'parcats',
]);

const sharesSeriesColors = traces =>
  (traces.length > 1 || traces.some(trace => trace.sourceInsight)) &&
  !traces.some(trace => LABEL_COLORED_TYPES.has(trace.type));

// Plotly advances through the colorway for every trace except an explicitly hidden one.
const colorwayTraces = traces => traces.filter(trace => trace.visible !== false);

export const seriesOrderOf = tracesPerChart => {
  const order = [];
  for (const traces of tracesPerChart) {
    if (!sharesSeriesColors(traces)) continue;
    for (const { name } of colorwayTraces(traces)) {
      if (!order.includes(name)) order.push(name);
    }
  }
  return order;
};

export const seriesColorway = (traces, seriesOrder, colorway) => {
  if (!seriesOrder?.length || !colorway?.length || !sharesSeriesColors(traces)) return undefined;
  const positions = colorwayTraces(traces).map(trace => seriesOrder.indexOf(trace.name));
  if (positions.includes(-1)) return undefined;
  return positions.map(position => colorway[position % colorway.length]);
};
