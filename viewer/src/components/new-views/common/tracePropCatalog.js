/**
 * tracePropCatalog.js — curated Plotly trace prop catalog.
 * Two-tier: A = data-binding essentials, B = key visual props.
 * Used by ChartEditForm grouping, Field Finder, and LLM oracle.
 *
 * Tier-A seeds come from insightRequiredFields.js REQUIRED_FIELDS.
 * Tier-B covers 2-5 key visual/style props per type.
 *
 * IMPORTANT: line.dash legal values live only in schema description text,
 * not in the JSON enum — enumValues is set manually here.
 */

/** @type {Record<string, Array<{path:string, label:string, tier:'A'|'B', description:string, keywords:string[], enumValues:string[]|null, example:any}>>} */
export const tracePropCatalog = {
  // ─── 2D Cartesian ────────────────────────────────────────────────────────────

  scatter: [
    { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'axis', 'data', 'coordinates'], enumValues: null, example: [1, 2, 3] },
    { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'axis', 'data', 'coordinates'], enumValues: null, example: [4, 5, 6] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode for this scatter trace', keywords: ['mode', 'lines', 'markers', 'text', 'display'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend', 'label'], enumValues: null, example: 'Series A' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace (0–1)', keywords: ['opacity', 'transparency', 'alpha'], enumValues: null, example: 0.8 },
    { path: 'line.dash', label: 'Line Dash', tier: 'B', description: 'Sets the dash style of lines', keywords: ['dash', 'line', 'style', 'dashed'], enumValues: ['solid', 'dot', 'dash', 'longdash', 'longdashdot'], example: 'solid' },
  ],

  bar: [
    { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'axis', 'categories', 'data'], enumValues: null, example: ['A', 'B', 'C'] },
    { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'axis', 'values', 'data'], enumValues: null, example: [10, 20, 30] },
    { path: 'orientation', label: 'Orientation', tier: 'B', description: 'Sets the orientation of the bars', keywords: ['orientation', 'horizontal', 'vertical'], enumValues: ['v', 'h'], example: 'v' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend', 'label'], enumValues: null, example: 'Sales' },
    { path: 'marker.color', label: 'Bar Color', tier: 'B', description: 'Sets the bar color', keywords: ['color', 'bar', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace (0–1)', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'text', label: 'Text Labels', tier: 'B', description: 'Sets text elements associated with each bar', keywords: ['text', 'label', 'annotation'], enumValues: null, example: ['10', '20', '30'] },
  ],

  // area is scatter with fill='tozeroy'
  area: [
    { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'axis', 'data'], enumValues: null, example: [1, 2, 3] },
    { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'axis', 'data'], enumValues: null, example: [4, 5, 6] },
    { path: 'fill', label: 'Fill Mode', tier: 'B', description: 'Sets the area to fill with a solid color', keywords: ['fill', 'area', 'shade'], enumValues: ['none', 'tozeroy', 'tozerox', 'tonexty', 'tonextx', 'toself', 'tonext'], example: 'tozeroy' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend'], enumValues: null, example: 'Area Series' },
    { path: 'fillcolor', label: 'Fill Color', tier: 'B', description: 'Sets the fill area color', keywords: ['color', 'fill', 'area'], enumValues: null, example: 'rgba(99,110,250,0.3)' },
    { path: 'line.dash', label: 'Line Dash', tier: 'B', description: 'Sets the dash style of the line', keywords: ['dash', 'line', 'style'], enumValues: ['solid', 'dot', 'dash', 'longdash', 'longdashdot'], example: 'solid' },
  ],

  pie: [
    { path: 'values', label: 'Values', tier: 'A', description: 'Sets the values of the sectors', keywords: ['values', 'data', 'sector', 'size'], enumValues: null, example: [10, 20, 30] },
    { path: 'labels', label: 'Labels', tier: 'A', description: 'Sets the sector labels', keywords: ['labels', 'categories', 'names'], enumValues: null, example: ['A', 'B', 'C'] },
    { path: 'hole', label: 'Hole Size (Donut)', tier: 'B', description: 'Sets the fraction of the radius to cut out of the pie (0–1); creates a donut chart', keywords: ['hole', 'donut', 'inner'], enumValues: null, example: 0 },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend'], enumValues: null, example: 'Distribution' },
    { path: 'textposition', label: 'Text Position', tier: 'B', description: 'Specifies the location of the text labels on each sector', keywords: ['text', 'label', 'position'], enumValues: ['inside', 'outside', 'auto', 'none'], example: 'inside' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  heatmap: [
    { path: 'z', label: 'Z Values', tier: 'A', description: 'Sets the z values (2D array of heat values)', keywords: ['z', 'values', 'data', 'matrix'], enumValues: null, example: [[1, 2], [3, 4]] },
    { path: 'x', label: 'X Labels', tier: 'A', description: 'Sets the x axis labels', keywords: ['x', 'labels', 'columns'], enumValues: null, example: ['Mon', 'Tue'] },
    { path: 'y', label: 'Y Labels', tier: 'A', description: 'Sets the y axis labels', keywords: ['y', 'labels', 'rows'], enumValues: null, example: ['A', 'B'] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale for the heatmap', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Greys', 'YlGnBu', 'Greens', 'YlOrRd', 'Bluered', 'RdBu', 'Reds', 'Blues', 'Picnic', 'Rainbow', 'Portland', 'Jet', 'Hot', 'Blackbody', 'Earth', 'Electric', 'Viridis', 'Cividis'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Heatmap' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'zmin', label: 'Z Min', tier: 'B', description: 'Sets the minimum color value', keywords: ['zmin', 'min', 'scale'], enumValues: null, example: 0 },
    { path: 'zmax', label: 'Z Max', tier: 'B', description: 'Sets the maximum color value', keywords: ['zmax', 'max', 'scale'], enumValues: null, example: 100 },
  ],

  heatmapgl: [
    { path: 'z', label: 'Z Values', tier: 'A', description: 'Sets the z values (2D array)', keywords: ['z', 'values', 'data', 'matrix'], enumValues: null, example: [[1, 2], [3, 4]] },
    { path: 'x', label: 'X Labels', tier: 'A', description: 'Sets the x axis labels', keywords: ['x', 'labels'], enumValues: null, example: ['Mon', 'Tue'] },
    { path: 'y', label: 'Y Labels', tier: 'A', description: 'Sets the y axis labels', keywords: ['y', 'labels'], enumValues: null, example: ['A', 'B'] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Greys', 'YlGnBu', 'Greens', 'Viridis', 'Cividis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'HeatmapGL' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity'], enumValues: null, example: 1 },
    { path: 'zmin', label: 'Z Min', tier: 'B', description: 'Sets the minimum color value', keywords: ['zmin', 'min', 'scale'], enumValues: null, example: 0 },
  ],

  histogram: [
    { path: 'x', label: 'X Values', tier: 'A', description: 'Sets the sample data to be binned on the x axis', keywords: ['x', 'data', 'values', 'sample'], enumValues: null, example: [1, 2, 2, 3, 3, 3] },
    { path: 'nbinsx', label: 'Number of Bins', tier: 'B', description: 'Specifies the maximum number of desired bins', keywords: ['bins', 'buckets', 'resolution'], enumValues: null, example: 10 },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend'], enumValues: null, example: 'Distribution' },
    { path: 'marker.color', label: 'Bar Color', tier: 'B', description: 'Sets the bar color', keywords: ['color', 'bar', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 0.75 },
    { path: 'histnorm', label: 'Normalization', tier: 'B', description: 'Specifies the normalization method for the histogram', keywords: ['normalization', 'probability', 'density'], enumValues: ['', 'percent', 'probability', 'density', 'probability density'], example: '' },
  ],

  box: [
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y sample data', keywords: ['y', 'values', 'data', 'sample'], enumValues: null, example: [1, 2, 3, 4, 5] },
    { path: 'x', label: 'X Categories', tier: 'A', description: 'Sets the x categories for grouping', keywords: ['x', 'categories', 'group'], enumValues: null, example: ['A', 'A', 'B', 'B', 'B'] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name shown in the legend', keywords: ['name', 'legend'], enumValues: null, example: 'Group A' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the color of the box marker', keywords: ['color', 'marker', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'boxpoints', label: 'Show Data Points', tier: 'B', description: 'Determines which points are displayed alongside the box', keywords: ['points', 'outliers', 'jitter'], enumValues: ['all', 'outliers', 'suspectedoutliers', 'false'], example: 'outliers' },
    { path: 'notched', label: 'Notched', tier: 'B', description: 'If true, boxes are drawn with notches indicating confidence intervals', keywords: ['notch', 'confidence', 'interval'], enumValues: null, example: false },
  ],

  violin: [
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y sample data', keywords: ['y', 'values', 'data', 'sample'], enumValues: null, example: [1, 2, 3, 4, 5] },
    { path: 'x', label: 'X Categories', tier: 'A', description: 'Sets the x categories for grouping', keywords: ['x', 'categories', 'group'], enumValues: null, example: ['A', 'A', 'B', 'B', 'B'] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Group A' },
    { path: 'marker.color', label: 'Fill Color', tier: 'B', description: 'Sets the violin fill color', keywords: ['color', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'box.visible', label: 'Show Box', tier: 'B', description: 'Shows the box plot inside the violin', keywords: ['box', 'boxplot', 'inner'], enumValues: null, example: true },
    { path: 'points', label: 'Show Data Points', tier: 'B', description: 'Determines which points are displayed', keywords: ['points', 'outliers', 'jitter'], enumValues: ['all', 'outliers', 'suspectedoutliers', 'false'], example: 'outliers' },
  ],

  funnel: [
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y coordinates (stage labels)', keywords: ['y', 'labels', 'stages'], enumValues: null, example: ['Step 1', 'Step 2', 'Step 3'] },
    { path: 'x', label: 'X Values', tier: 'A', description: 'Sets the x coordinates (quantity values)', keywords: ['x', 'values', 'quantity'], enumValues: null, example: [100, 80, 60] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Funnel' },
    { path: 'marker.color', label: 'Bar Color', tier: 'B', description: 'Sets the funnel bar color', keywords: ['color', 'bar', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'textposition', label: 'Text Position', tier: 'B', description: 'Specifies the location of the text labels', keywords: ['text', 'label', 'position'], enumValues: ['inside', 'outside', 'auto', 'none'], example: 'inside' },
  ],

  indicator: [
    { path: 'value', label: 'Value', tier: 'A', description: 'Sets the displayed number', keywords: ['value', 'number', 'kpi', 'metric'], enumValues: null, example: 450 },
    { path: 'mode', label: 'Display Mode', tier: 'A', description: 'Determines which indicator components are displayed', keywords: ['mode', 'gauge', 'delta', 'number'], enumValues: ['number', 'delta', 'gauge', 'number+delta', 'number+gauge', 'gauge+delta', 'number+delta+gauge'], example: 'number' },
    { path: 'title.text', label: 'Title', tier: 'B', description: 'Sets the title text of the indicator', keywords: ['title', 'label', 'heading'], enumValues: null, example: 'Revenue' },
    { path: 'delta.reference', label: 'Delta Reference', tier: 'B', description: 'Sets the reference value for computing the delta', keywords: ['delta', 'reference', 'comparison'], enumValues: null, example: 400 },
    { path: 'gauge.axis.range', label: 'Gauge Range', tier: 'B', description: 'Sets the gauge axis range [min, max]', keywords: ['gauge', 'range', 'min', 'max'], enumValues: null, example: [0, 1000] },
    { path: 'number.prefix', label: 'Number Prefix', tier: 'B', description: 'Sets a string shown before the number', keywords: ['prefix', 'currency', 'symbol'], enumValues: null, example: '$' },
  ],

  treemap: [
    { path: 'labels', label: 'Labels', tier: 'A', description: 'Sets the labels of each sector', keywords: ['labels', 'names', 'categories'], enumValues: null, example: ['Total', 'A', 'B'] },
    { path: 'parents', label: 'Parents', tier: 'A', description: 'Sets the parent sector for each sector', keywords: ['parents', 'hierarchy', 'tree'], enumValues: null, example: ['', 'Total', 'Total'] },
    { path: 'values', label: 'Values', tier: 'A', description: 'Sets the values associated with each sector', keywords: ['values', 'size', 'area'], enumValues: null, example: [0, 10, 20] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Treemap' },
    { path: 'branchvalues', label: 'Branch Values', tier: 'B', description: 'Determines how the items in `values` are summed', keywords: ['branch', 'values', 'total', 'remainder'], enumValues: ['remainder', 'total'], example: 'remainder' },
    { path: 'textinfo', label: 'Text Info', tier: 'B', description: 'Determines which text is shown on each sector', keywords: ['text', 'label', 'info'], enumValues: ['label', 'text', 'value', 'current path', 'percent root', 'percent entry', 'percent parent', 'none'], example: 'label+value' },
  ],

  sunburst: [
    { path: 'labels', label: 'Labels', tier: 'A', description: 'Sets the labels of each sector', keywords: ['labels', 'names', 'categories'], enumValues: null, example: ['Total', 'A', 'B'] },
    { path: 'parents', label: 'Parents', tier: 'A', description: 'Sets the parent sector for each sector', keywords: ['parents', 'hierarchy', 'tree'], enumValues: null, example: ['', 'Total', 'Total'] },
    { path: 'values', label: 'Values', tier: 'A', description: 'Sets the values of each sector', keywords: ['values', 'size', 'area'], enumValues: null, example: [0, 10, 20] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Sunburst' },
    { path: 'branchvalues', label: 'Branch Values', tier: 'B', description: 'Determines how values in `values` are summed', keywords: ['branch', 'values', 'total', 'remainder'], enumValues: ['remainder', 'total'], example: 'remainder' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  sankey: [
    { path: 'node', label: 'Nodes', tier: 'A', description: 'Configuration of the nodes in the Sankey diagram', keywords: ['nodes', 'vertices', 'points'], enumValues: null, example: { label: ['A', 'B', 'C'] } },
    { path: 'link', label: 'Links', tier: 'A', description: 'Configuration of the links (flows) between nodes', keywords: ['links', 'flows', 'connections'], enumValues: null, example: { source: [0, 1], target: [1, 2], value: [5, 3] } },
    { path: 'orientation', label: 'Orientation', tier: 'B', description: 'Sets the orientation of the Sankey diagram', keywords: ['orientation', 'horizontal', 'vertical'], enumValues: ['h', 'v'], example: 'h' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Flow' },
    { path: 'arrangement', label: 'Node Arrangement', tier: 'B', description: 'Sets how the nodes are arranged', keywords: ['arrangement', 'layout', 'snap', 'freeform'], enumValues: ['snap', 'perpendicular', 'freeform', 'fixed'], example: 'snap' },
  ],

  candlestick: [
    { path: 'x', label: 'X Axis (Time)', tier: 'A', description: 'Sets the x coordinates (typically date/time)', keywords: ['x', 'time', 'date', 'axis'], enumValues: null, example: ['2023-01-01', '2023-01-02'] },
    { path: 'open', label: 'Open', tier: 'A', description: 'Sets the open values', keywords: ['open', 'price', 'ohlc'], enumValues: null, example: [100, 105] },
    { path: 'high', label: 'High', tier: 'A', description: 'Sets the high values', keywords: ['high', 'price', 'ohlc'], enumValues: null, example: [110, 115] },
    { path: 'low', label: 'Low', tier: 'A', description: 'Sets the low values', keywords: ['low', 'price', 'ohlc'], enumValues: null, example: [95, 100] },
    { path: 'close', label: 'Close', tier: 'A', description: 'Sets the close values', keywords: ['close', 'price', 'ohlc'], enumValues: null, example: [108, 112] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'AAPL' },
    { path: 'increasing.line.color', label: 'Increasing Color', tier: 'B', description: 'Sets the color of increasing candles', keywords: ['color', 'increasing', 'up', 'bullish'], enumValues: null, example: '#00cc96' },
    { path: 'decreasing.line.color', label: 'Decreasing Color', tier: 'B', description: 'Sets the color of decreasing candles', keywords: ['color', 'decreasing', 'down', 'bearish'], enumValues: null, example: '#ef553b' },
  ],

  waterfall: [
    { path: 'x', label: 'X Categories', tier: 'A', description: 'Sets the x categories for each waterfall bar', keywords: ['x', 'categories', 'labels'], enumValues: null, example: ['Q1', 'Q2', 'Q3', 'Total'] },
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y values (changes) for each bar', keywords: ['y', 'values', 'changes', 'delta'], enumValues: null, example: [100, -20, 50, 130] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Revenue' },
    { path: 'increasing.marker.color', label: 'Increasing Color', tier: 'B', description: 'Sets the color of increasing bars', keywords: ['color', 'increasing', 'positive'], enumValues: null, example: '#00cc96' },
    { path: 'decreasing.marker.color', label: 'Decreasing Color', tier: 'B', description: 'Sets the color of decreasing bars', keywords: ['color', 'decreasing', 'negative'], enumValues: null, example: '#ef553b' },
    { path: 'textposition', label: 'Text Position', tier: 'B', description: 'Specifies the text label position', keywords: ['text', 'label', 'position'], enumValues: ['inside', 'outside', 'auto', 'none'], example: 'outside' },
  ],

  contour: [
    { path: 'z', label: 'Z Values', tier: 'A', description: 'Sets the z values (2D array)', keywords: ['z', 'values', 'data', 'matrix'], enumValues: null, example: [[1, 2], [3, 4]] },
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'coordinates', 'axis'], enumValues: null, example: [1, 2] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'coordinates', 'axis'], enumValues: null, example: [1, 2] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Greys', 'YlGnBu', 'Greens', 'Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Contour' },
    { path: 'ncontours', label: 'Number of Contours', tier: 'B', description: 'Sets the maximum number of contour levels', keywords: ['contours', 'levels', 'count'], enumValues: null, example: 15 },
    { path: 'contours.showlabels', label: 'Show Contour Labels', tier: 'B', description: 'Determines whether to label the contour lines with their values', keywords: ['labels', 'contour', 'text'], enumValues: null, example: false },
  ],

  histogram2d: [
    { path: 'x', label: 'X Values', tier: 'A', description: 'Sets the x sample data', keywords: ['x', 'data', 'sample'], enumValues: null, example: [1, 2, 2, 3] },
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y sample data', keywords: ['y', 'data', 'sample'], enumValues: null, example: [4, 5, 5, 6] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Viridis', 'Hot', 'Greys', 'YlOrRd', 'Blues'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: '2D Histogram' },
    { path: 'nbinsx', label: 'X Bins', tier: 'B', description: 'Maximum number of desired bins in x', keywords: ['bins', 'x', 'resolution'], enumValues: null, example: 20 },
    { path: 'nbinsy', label: 'Y Bins', tier: 'B', description: 'Maximum number of desired bins in y', keywords: ['bins', 'y', 'resolution'], enumValues: null, example: 20 },
  ],

  ohlc: [
    { path: 'x', label: 'X Axis (Time)', tier: 'A', description: 'Sets the x coordinates (time)', keywords: ['x', 'time', 'date', 'axis'], enumValues: null, example: ['2023-01-01', '2023-01-02'] },
    { path: 'open', label: 'Open', tier: 'A', description: 'Sets the open values', keywords: ['open', 'price', 'ohlc'], enumValues: null, example: [100, 105] },
    { path: 'high', label: 'High', tier: 'A', description: 'Sets the high values', keywords: ['high', 'price', 'ohlc'], enumValues: null, example: [110, 115] },
    { path: 'low', label: 'Low', tier: 'A', description: 'Sets the low values', keywords: ['low', 'price', 'ohlc'], enumValues: null, example: [95, 100] },
    { path: 'close', label: 'Close', tier: 'A', description: 'Sets the close values', keywords: ['close', 'price', 'ohlc'], enumValues: null, example: [108, 112] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'AAPL' },
    { path: 'increasing.line.color', label: 'Increasing Color', tier: 'B', description: 'Sets the color of increasing ticks', keywords: ['color', 'increasing', 'up'], enumValues: null, example: '#00cc96' },
    { path: 'line.dash', label: 'Line Dash', tier: 'B', description: 'Sets the dash style of the tick lines', keywords: ['dash', 'line', 'style'], enumValues: ['solid', 'dot', 'dash', 'longdash', 'longdashdot'], example: 'solid' },
  ],

  // ─── 3D Charts ───────────────────────────────────────────────────────────────

  scatter3d: [
    { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'axis', 'data', '3d'], enumValues: null, example: [1, 2, 3] },
    { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'axis', 'data', '3d'], enumValues: null, example: [4, 5, 6] },
    { path: 'z', label: 'Z Axis', tier: 'A', description: 'Sets the z coordinates', keywords: ['z', 'axis', 'data', '3d'], enumValues: null, example: [7, 8, 9] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'lines', 'markers', 'text'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: '3D Scatter' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 0.8 },
    { path: 'line.dash', label: 'Line Dash', tier: 'B', description: 'Sets the dash style', keywords: ['dash', 'line', 'style'], enumValues: ['solid', 'dot', 'dash', 'longdash', 'longdashdot'], example: 'solid' },
  ],

  surface: [
    { path: 'z', label: 'Z Values', tier: 'A', description: 'Sets the z surface values (2D array)', keywords: ['z', 'values', 'data', 'surface'], enumValues: null, example: [[1, 2], [3, 4]] },
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'coordinates', '3d'], enumValues: null, example: [0, 1] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'coordinates', '3d'], enumValues: null, example: [0, 1] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Viridis', 'Hot', 'RdBu', 'Earth', 'Electric'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Surface' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the surface', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'showscale', label: 'Show Color Bar', tier: 'B', description: 'Determines whether or not a colorbar is displayed', keywords: ['colorbar', 'scale', 'legend'], enumValues: null, example: true },
  ],

  mesh3d: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the mesh vertices', keywords: ['x', 'coordinates', 'vertices', '3d'], enumValues: null, example: [0, 1, 2] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the mesh vertices', keywords: ['y', 'coordinates', 'vertices', '3d'], enumValues: null, example: [0, 1, 0] },
    { path: 'z', label: 'Z Coordinates', tier: 'A', description: 'Sets the z coordinates of the mesh vertices', keywords: ['z', 'coordinates', 'vertices', '3d'], enumValues: null, example: [0, 0, 1] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Mesh' },
    { path: 'color', label: 'Color', tier: 'B', description: 'Sets the color of the whole mesh', keywords: ['color', 'fill', 'surface'], enumValues: null, example: '#7fc97f' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the surface', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'intensity', label: 'Intensity', tier: 'B', description: 'Sets the vertex intensity values, used for coloring the mesh', keywords: ['intensity', 'color', 'value'], enumValues: null, example: [0, 0.5, 1] },
  ],

  cone: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the vector field', keywords: ['x', 'coordinates', '3d', 'vector'], enumValues: null, example: [1, 2] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the vector field', keywords: ['y', 'coordinates', '3d', 'vector'], enumValues: null, example: [1, 2] },
    { path: 'z', label: 'Z Coordinates', tier: 'A', description: 'Sets the z coordinates of the vector field', keywords: ['z', 'coordinates', '3d', 'vector'], enumValues: null, example: [1, 2] },
    { path: 'u', label: 'U (X Component)', tier: 'A', description: 'Sets the x components of the vector field', keywords: ['u', 'vector', 'x', 'direction'], enumValues: null, example: [1, 0] },
    { path: 'v', label: 'V (Y Component)', tier: 'A', description: 'Sets the y components of the vector field', keywords: ['v', 'vector', 'y', 'direction'], enumValues: null, example: [0, 1] },
    { path: 'w', label: 'W (Z Component)', tier: 'A', description: 'Sets the z components of the vector field', keywords: ['w', 'vector', 'z', 'direction'], enumValues: null, example: [0, 0] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'sizemode', label: 'Size Mode', tier: 'B', description: 'Determines whether sizeref is set as absolute or scaled', keywords: ['size', 'scale', 'mode'], enumValues: ['scaled', 'absolute'], example: 'scaled' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  streamtube: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the vector field', keywords: ['x', 'coordinates', '3d', 'field'], enumValues: null, example: [0, 1, 2] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the vector field', keywords: ['y', 'coordinates', '3d', 'field'], enumValues: null, example: [0, 1, 2] },
    { path: 'z', label: 'Z Coordinates', tier: 'A', description: 'Sets the z coordinates of the vector field', keywords: ['z', 'coordinates', '3d', 'field'], enumValues: null, example: [0, 1, 2] },
    { path: 'u', label: 'U (X Component)', tier: 'A', description: 'Sets the x components of the vector field', keywords: ['u', 'vector', 'x'], enumValues: null, example: [0, 1, 0] },
    { path: 'v', label: 'V (Y Component)', tier: 'A', description: 'Sets the y components of the vector field', keywords: ['v', 'vector', 'y'], enumValues: null, example: [1, 0, 0] },
    { path: 'w', label: 'W (Z Component)', tier: 'A', description: 'Sets the z components of the vector field', keywords: ['w', 'vector', 'z'], enumValues: null, example: [0, 0, 1] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'sizeref', label: 'Size Reference', tier: 'B', description: 'The scaling factor for the streamtubes', keywords: ['size', 'scale', 'width'], enumValues: null, example: 1 },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  volume: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the volume', keywords: ['x', 'coordinates', '3d', 'volume'], enumValues: null, example: [0, 1, 0, 1] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the volume', keywords: ['y', 'coordinates', '3d', 'volume'], enumValues: null, example: [0, 0, 1, 1] },
    { path: 'z', label: 'Z Coordinates', tier: 'A', description: 'Sets the z coordinates of the volume', keywords: ['z', 'coordinates', '3d', 'volume'], enumValues: null, example: [0, 0, 0, 0] },
    { path: 'value', label: 'Values', tier: 'A', description: 'Sets the 4th dimension of the data (scalar field)', keywords: ['value', 'scalar', 'data', '3d'], enumValues: null, example: [0.1, 0.5, 0.8, 1.0] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu', 'Blues'], example: 'Viridis' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the volume', keywords: ['opacity', 'transparency'], enumValues: null, example: 0.1 },
    { path: 'isomin', label: 'Iso Min', tier: 'B', description: 'Sets the minimum boundary for the iso-surface', keywords: ['isomin', 'threshold', 'min'], enumValues: null, example: 0 },
    { path: 'isomax', label: 'Iso Max', tier: 'B', description: 'Sets the maximum boundary for the iso-surface', keywords: ['isomax', 'threshold', 'max'], enumValues: null, example: 1 },
  ],

  isosurface: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the volume', keywords: ['x', 'coordinates', '3d', 'isosurface'], enumValues: null, example: [0, 1, 0, 1] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the volume', keywords: ['y', 'coordinates', '3d', 'isosurface'], enumValues: null, example: [0, 0, 1, 1] },
    { path: 'z', label: 'Z Coordinates', tier: 'A', description: 'Sets the z coordinates of the volume', keywords: ['z', 'coordinates', '3d', 'isosurface'], enumValues: null, example: [0, 0, 0, 0] },
    { path: 'value', label: 'Values', tier: 'A', description: 'Sets the 4th dimension of the data (scalar field)', keywords: ['value', 'scalar', 'data'], enumValues: null, example: [0.1, 0.5, 0.8, 1.0] },
    { path: 'isomin', label: 'Iso Min', tier: 'B', description: 'Sets the minimum boundary for the iso-surface', keywords: ['isomin', 'threshold', 'min'], enumValues: null, example: 0 },
    { path: 'isomax', label: 'Iso Max', tier: 'B', description: 'Sets the maximum boundary for the iso-surface', keywords: ['isomax', 'threshold', 'max'], enumValues: null, example: 1 },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity', 'transparency'], enumValues: null, example: 0.5 },
  ],

  pointcloud: [
    { path: 'x', label: 'X Coordinates', tier: 'A', description: 'Sets the x coordinates of the point cloud', keywords: ['x', 'coordinates', 'points', 'cloud'], enumValues: null, example: [1, 2, 3] },
    { path: 'y', label: 'Y Coordinates', tier: 'A', description: 'Sets the y coordinates of the point cloud', keywords: ['y', 'coordinates', 'points', 'cloud'], enumValues: null, example: [4, 5, 6] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Point Cloud' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'marker.sizemin', label: 'Min Point Size', tier: 'B', description: 'Sets the minimum size of each point', keywords: ['size', 'marker', 'min'], enumValues: null, example: 0.5 },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  // ─── Maps ────────────────────────────────────────────────────────────────────

  scattergeo: [
    { path: 'lat', label: 'Latitude', tier: 'A', description: 'Sets the latitude coordinates', keywords: ['lat', 'latitude', 'geo', 'map'], enumValues: null, example: [40.7, 34.0] },
    { path: 'lon', label: 'Longitude', tier: 'A', description: 'Sets the longitude coordinates', keywords: ['lon', 'longitude', 'geo', 'map'], enumValues: null, example: [-74.0, -118.2] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines', 'text'], enumValues: ['markers', 'lines', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Cities' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'marker.size', label: 'Marker Size', tier: 'B', description: 'Sets the marker size', keywords: ['size', 'marker', 'radius'], enumValues: null, example: 8 },
  ],

  choropleth: [
    { path: 'locations', label: 'Locations', tier: 'A', description: 'Sets the location codes (country codes, state codes, etc.)', keywords: ['locations', 'countries', 'regions', 'codes'], enumValues: null, example: ['USA', 'CAN', 'MEX'] },
    { path: 'z', label: 'Values', tier: 'A', description: 'Sets the color values associated with each location', keywords: ['z', 'values', 'data', 'color'], enumValues: null, example: [100, 200, 150] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors', 'palette'], enumValues: ['Viridis', 'Hot', 'Blues', 'Reds', 'RdBu', 'YlOrRd'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Choropleth' },
    { path: 'locationmode', label: 'Location Mode', tier: 'B', description: 'Determines the set of locations used to match entries in `locations`', keywords: ['location', 'mode', 'iso', 'country', 'state'], enumValues: ['ISO-3', 'USA-states', 'country names', 'geojson-id'], example: 'ISO-3' },
    { path: 'zmin', label: 'Z Min', tier: 'B', description: 'Sets the minimum color value', keywords: ['zmin', 'min', 'scale'], enumValues: null, example: 0 },
  ],

  scattermap: [
    { path: 'lat', label: 'Latitude', tier: 'A', description: 'Sets the latitude coordinates', keywords: ['lat', 'latitude', 'map'], enumValues: null, example: [40.7, 34.0] },
    { path: 'lon', label: 'Longitude', tier: 'A', description: 'Sets the longitude coordinates', keywords: ['lon', 'longitude', 'map'], enumValues: null, example: [-74.0, -118.2] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['markers', 'lines', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Locations' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'marker.size', label: 'Marker Size', tier: 'B', description: 'Sets the marker size', keywords: ['size', 'marker'], enumValues: null, example: 8 },
  ],

  densitymap: [
    { path: 'lat', label: 'Latitude', tier: 'A', description: 'Sets the latitude coordinates of each point', keywords: ['lat', 'latitude', 'map', 'density'], enumValues: null, example: [40.7, 34.0] },
    { path: 'lon', label: 'Longitude', tier: 'A', description: 'Sets the longitude coordinates of each point', keywords: ['lon', 'longitude', 'map', 'density'], enumValues: null, example: [-74.0, -118.2] },
    { path: 'z', label: 'Values', tier: 'B', description: 'Sets the points weight (density value)', keywords: ['z', 'weight', 'density', 'value'], enumValues: null, example: [1, 2] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Density' },
    { path: 'radius', label: 'Point Radius', tier: 'B', description: 'Sets the radius of influence of one point in pixels', keywords: ['radius', 'size', 'influence'], enumValues: null, example: 30 },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
  ],

  choroplethmap: [
    { path: 'geojson', label: 'GeoJSON', tier: 'A', description: 'Sets the GeoJSON data associated with the locations', keywords: ['geojson', 'geometry', 'map', 'boundaries'], enumValues: null, example: {} },
    { path: 'locations', label: 'Locations', tier: 'A', description: 'Sets which features in the GeoJSON are matched to data points', keywords: ['locations', 'features', 'ids', 'map'], enumValues: null, example: ['region1', 'region2'] },
    { path: 'z', label: 'Values', tier: 'A', description: 'Sets the color values associated with each location', keywords: ['z', 'values', 'data', 'color'], enumValues: null, example: [100, 200] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Blues', 'Reds', 'RdBu'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Region Map' },
    { path: 'featureidkey', label: 'Feature ID Key', tier: 'B', description: 'Sets the key in GeoJSON features used for matching', keywords: ['feature', 'id', 'key', 'geojson'], enumValues: null, example: 'id' },
  ],

  scattermapbox: [
    { path: 'lat', label: 'Latitude', tier: 'A', description: 'Sets the latitude coordinates', keywords: ['lat', 'latitude', 'mapbox'], enumValues: null, example: [40.7, 34.0] },
    { path: 'lon', label: 'Longitude', tier: 'A', description: 'Sets the longitude coordinates', keywords: ['lon', 'longitude', 'mapbox'], enumValues: null, example: [-74.0, -118.2] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['markers', 'lines', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Locations' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'marker.size', label: 'Marker Size', tier: 'B', description: 'Sets the marker size', keywords: ['size', 'marker'], enumValues: null, example: 8 },
  ],

  densitymapbox: [
    { path: 'lat', label: 'Latitude', tier: 'A', description: 'Sets the latitude coordinates of each point', keywords: ['lat', 'latitude', 'mapbox', 'density'], enumValues: null, example: [40.7, 34.0] },
    { path: 'lon', label: 'Longitude', tier: 'A', description: 'Sets the longitude coordinates of each point', keywords: ['lon', 'longitude', 'mapbox', 'density'], enumValues: null, example: [-74.0, -118.2] },
    { path: 'z', label: 'Values', tier: 'B', description: 'Sets the points weight (density value)', keywords: ['z', 'weight', 'density', 'value'], enumValues: null, example: [1, 2] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Density' },
    { path: 'radius', label: 'Point Radius', tier: 'B', description: 'Sets the radius of influence of one point in pixels', keywords: ['radius', 'size', 'influence'], enumValues: null, example: 30 },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
  ],

  choroplethmapbox: [
    { path: 'geojson', label: 'GeoJSON', tier: 'A', description: 'Sets the GeoJSON data with the features matching the locations', keywords: ['geojson', 'geometry', 'map', 'boundaries'], enumValues: null, example: {} },
    { path: 'locations', label: 'Locations', tier: 'A', description: 'Sets which features in the GeoJSON are matched to data', keywords: ['locations', 'features', 'ids', 'map'], enumValues: null, example: ['region1', 'region2'] },
    { path: 'z', label: 'Values', tier: 'A', description: 'Sets the color values associated with each location', keywords: ['z', 'values', 'data', 'color'], enumValues: null, example: [100, 200] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Blues', 'Reds', 'RdBu'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Region Map' },
    { path: 'featureidkey', label: 'Feature ID Key', tier: 'B', description: 'Sets the key in GeoJSON features used for matching', keywords: ['feature', 'id', 'key', 'geojson'], enumValues: null, example: 'id' },
  ],

  // ─── Polar Charts ─────────────────────────────────────────────────────────────

  scatterpolar: [
    { path: 'r', label: 'R (Radius)', tier: 'A', description: 'Sets the radial coordinates', keywords: ['r', 'radius', 'polar', 'radial'], enumValues: null, example: [1, 2, 3] },
    { path: 'theta', label: 'Theta (Angle)', tier: 'A', description: 'Sets the angular coordinates', keywords: ['theta', 'angle', 'polar', 'angular'], enumValues: null, example: [0, 90, 180] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Polar Series' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'fill', label: 'Fill', tier: 'B', description: 'Sets the area to fill', keywords: ['fill', 'area', 'shade'], enumValues: ['none', 'toself', 'tonext'], example: 'none' },
  ],

  barpolar: [
    { path: 'r', label: 'R (Radius)', tier: 'A', description: 'Sets the radial coordinates', keywords: ['r', 'radius', 'polar', 'bar'], enumValues: null, example: [1, 2, 3] },
    { path: 'theta', label: 'Theta (Angle)', tier: 'A', description: 'Sets the angular coordinates', keywords: ['theta', 'angle', 'polar', 'bar'], enumValues: null, example: [0, 90, 180] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Polar Bar' },
    { path: 'marker.color', label: 'Bar Color', tier: 'B', description: 'Sets the bar color', keywords: ['color', 'bar', 'fill'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'width', label: 'Bar Width', tier: 'B', description: 'Sets the bar angular width (in degrees)', keywords: ['width', 'bar', 'angular'], enumValues: null, example: null },
  ],

  scatterpolargl: [
    { path: 'r', label: 'R (Radius)', tier: 'A', description: 'Sets the radial coordinates', keywords: ['r', 'radius', 'polar', 'gl'], enumValues: null, example: [1, 2, 3] },
    { path: 'theta', label: 'Theta (Angle)', tier: 'A', description: 'Sets the angular coordinates', keywords: ['theta', 'angle', 'polar', 'gl'], enumValues: null, example: [0, 90, 180] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines', 'gl'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Polar GL' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  // ─── Ternary / Smith ─────────────────────────────────────────────────────────

  scatterternary: [
    { path: 'a', label: 'A Coordinates', tier: 'A', description: 'Sets the a-axis coordinates', keywords: ['a', 'ternary', 'coordinates', 'axis'], enumValues: null, example: [0.1, 0.2, 0.3] },
    { path: 'b', label: 'B Coordinates', tier: 'A', description: 'Sets the b-axis coordinates', keywords: ['b', 'ternary', 'coordinates', 'axis'], enumValues: null, example: [0.6, 0.5, 0.3] },
    { path: 'c', label: 'C Coordinates', tier: 'A', description: 'Sets the c-axis coordinates', keywords: ['c', 'ternary', 'coordinates', 'axis'], enumValues: null, example: [0.3, 0.3, 0.4] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Ternary' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
  ],

  scattersmith: [
    { path: 'real', label: 'Real (Resistance)', tier: 'A', description: 'Sets the real part of the complex coordinates', keywords: ['real', 'resistance', 'smith', 'impedance'], enumValues: null, example: [0.5, 1, 2] },
    { path: 'imag', label: 'Imaginary (Reactance)', tier: 'A', description: 'Sets the imaginary part of the complex coordinates', keywords: ['imag', 'reactance', 'smith', 'impedance'], enumValues: null, example: [0.5, -0.5, 1] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Smith' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'line.dash', label: 'Line Dash', tier: 'B', description: 'Sets the dash style of lines', keywords: ['dash', 'line', 'style'], enumValues: ['solid', 'dot', 'dash', 'longdash', 'longdashdot'], example: 'solid' },
  ],

  // ─── Carpet Charts ───────────────────────────────────────────────────────────

  carpet: [
    { path: 'a', label: 'A Coordinates', tier: 'A', description: 'An array containing values of the first parameter value', keywords: ['a', 'carpet', 'parameter', 'axis'], enumValues: null, example: [1, 2, 3] },
    { path: 'b', label: 'B Coordinates', tier: 'A', description: 'An array containing values of the second parameter value', keywords: ['b', 'carpet', 'parameter', 'axis'], enumValues: null, example: [1, 2, 3] },
    { path: 'carpet', label: 'Carpet ID', tier: 'B', description: 'An identifier for this carpet trace, referenced by scatter and contour carpet traces', keywords: ['carpet', 'id', 'reference'], enumValues: null, example: 'carpet1' },
    { path: 'x', label: 'X Coordinates', tier: 'B', description: 'A 2D array of x coordinates at each carpet point', keywords: ['x', 'coordinates', 'carpet'], enumValues: null, example: [[0, 1], [2, 3]] },
    { path: 'y', label: 'Y Coordinates', tier: 'B', description: 'A 2D array of y coordinates at each carpet point', keywords: ['y', 'coordinates', 'carpet'], enumValues: null, example: [[0, 1], [2, 3]] },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  scattercarpet: [
    { path: 'a', label: 'A Coordinates', tier: 'A', description: 'Sets the a-axis coordinates', keywords: ['a', 'carpet', 'coordinates'], enumValues: null, example: [1, 2, 3] },
    { path: 'b', label: 'B Coordinates', tier: 'A', description: 'Sets the b-axis coordinates', keywords: ['b', 'carpet', 'coordinates'], enumValues: null, example: [1, 2, 3] },
    { path: 'carpet', label: 'Carpet ID', tier: 'B', description: 'The `carpet` ID of the carpet trace this trace belongs to', keywords: ['carpet', 'id', 'reference'], enumValues: null, example: 'carpet1' },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Carpet Scatter' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
  ],

  contourcarpet: [
    { path: 'a', label: 'A Coordinates', tier: 'A', description: 'Sets the a-axis coordinates', keywords: ['a', 'carpet', 'coordinates'], enumValues: null, example: [1, 2, 3] },
    { path: 'b', label: 'B Coordinates', tier: 'A', description: 'Sets the b-axis coordinates', keywords: ['b', 'carpet', 'coordinates'], enumValues: null, example: [1, 2, 3] },
    { path: 'z', label: 'Z Values', tier: 'A', description: 'Sets the z contour values', keywords: ['z', 'values', 'contour'], enumValues: null, example: [[1, 2], [3, 4]] },
    { path: 'carpet', label: 'Carpet ID', tier: 'B', description: 'The `carpet` ID of the carpet trace this trace belongs to', keywords: ['carpet', 'id', 'reference'], enumValues: null, example: 'carpet1' },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'RdBu'], example: 'Viridis' },
    { path: 'ncontours', label: 'Number of Contours', tier: 'B', description: 'Sets the maximum number of contour levels', keywords: ['contours', 'levels', 'count'], enumValues: null, example: 15 },
  ],

  // ─── Parallel Axes & SPLOM ───────────────────────────────────────────────────

  parcats: [
    { path: 'dimensions', label: 'Dimensions', tier: 'A', description: 'The list of dimensions that define the parallel categories', keywords: ['dimensions', 'categories', 'axes', 'parallel'], enumValues: null, example: [{ label: 'Cat', values: ['A', 'B'] }] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Categories' },
    { path: 'line.color', label: 'Line Color', tier: 'B', description: 'Sets the line color (can be a colorscale array)', keywords: ['color', 'line', 'flow'], enumValues: null, example: '#636efa' },
    { path: 'arrangement', label: 'Category Arrangement', tier: 'B', description: 'Sets the drag interaction mode for categories', keywords: ['arrangement', 'drag', 'sort'], enumValues: ['perpendicular', 'freeform', 'fixed'], example: 'perpendicular' },
    { path: 'bundlecolors', label: 'Bundle Colors', tier: 'B', description: 'Sort paths so that like colors are bundled together', keywords: ['bundle', 'color', 'group'], enumValues: null, example: true },
  ],

  parcoords: [
    { path: 'dimensions', label: 'Dimensions', tier: 'A', description: 'The dimensions of the parallel coordinate chart', keywords: ['dimensions', 'axes', 'parallel', 'coordinates'], enumValues: null, example: [{ label: 'Dim 1', values: [1, 2, 3] }] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Parallel Coords' },
    { path: 'line.color', label: 'Line Color', tier: 'B', description: 'Sets the line color', keywords: ['color', 'line'], enumValues: null, example: '#636efa' },
    { path: 'line.colorscale', label: 'Line Color Scale', tier: 'B', description: 'Sets the colorscale for the line color', keywords: ['colorscale', 'color', 'line'], enumValues: null, example: 'Viridis' },
    { path: 'unselected.line.opacity', label: 'Unselected Opacity', tier: 'B', description: 'Sets the opacity of unselected lines', keywords: ['opacity', 'unselected', 'filter'], enumValues: null, example: 0.3 },
  ],

  splom: [
    { path: 'dimensions', label: 'Dimensions', tier: 'A', description: 'The dimensions of the scatter plot matrix', keywords: ['dimensions', 'axes', 'matrix', 'splom'], enumValues: null, example: [{ label: 'Dim 1', values: [1, 2, 3] }] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'SPLOM' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'marker.size', label: 'Marker Size', tier: 'B', description: 'Sets the marker size', keywords: ['size', 'marker'], enumValues: null, example: 5 },
    { path: 'diagonal.visible', label: 'Show Diagonal', tier: 'B', description: 'Determines whether or not subplots on the diagonal are displayed', keywords: ['diagonal', 'visible', 'subplots'], enumValues: null, example: true },
  ],

  // ─── Hierarchical (remaining) ─────────────────────────────────────────────────

  icicle: [
    { path: 'labels', label: 'Labels', tier: 'A', description: 'Sets the labels of each sector', keywords: ['labels', 'names', 'categories'], enumValues: null, example: ['Total', 'A', 'B'] },
    { path: 'parents', label: 'Parents', tier: 'A', description: 'Sets the parent sector for each sector', keywords: ['parents', 'hierarchy', 'tree'], enumValues: null, example: ['', 'Total', 'Total'] },
    { path: 'values', label: 'Values', tier: 'A', description: 'Sets the values associated with each sector', keywords: ['values', 'size', 'area'], enumValues: null, example: [0, 10, 20] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Icicle' },
    { path: 'branchvalues', label: 'Branch Values', tier: 'B', description: 'Determines how the items in `values` are summed', keywords: ['branch', 'values', 'total'], enumValues: ['remainder', 'total'], example: 'remainder' },
    { path: 'tiling.orientation', label: 'Tiling Orientation', tier: 'B', description: 'Sets the orientation of the tiling', keywords: ['orientation', 'tiling', 'direction'], enumValues: ['v', 'h'], example: 'h' },
  ],

  funnelarea: [
    { path: 'values', label: 'Values', tier: 'A', description: 'Sets the values of each funnel area sector', keywords: ['values', 'data', 'size'], enumValues: null, example: [100, 80, 60] },
    { path: 'labels', label: 'Labels', tier: 'A', description: 'Sets the sector labels', keywords: ['labels', 'categories', 'names'], enumValues: null, example: ['Step 1', 'Step 2', 'Step 3'] },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Funnel Area' },
    { path: 'textposition', label: 'Text Position', tier: 'B', description: 'Specifies the location of the text labels', keywords: ['text', 'label', 'position'], enumValues: ['inside', 'outside', 'auto', 'none'], example: 'inside' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'hole', label: 'Hole Size', tier: 'B', description: 'Sets the fraction of the radius to cut out (0–1)', keywords: ['hole', 'donut', 'inner'], enumValues: null, example: 0 },
  ],

  // ─── Image ────────────────────────────────────────────────────────────────────

  image: [
    { path: 'z', label: 'Image Data', tier: 'A', description: 'A 2D array of uint8 RGBA/RGB/YCbCr values or a 3D array for the pixel image', keywords: ['z', 'image', 'pixels', 'data'], enumValues: null, example: [[[255, 0, 0]]] },
    { path: 'source', label: 'Image Source', tier: 'A', description: 'Specifies the data URI of the image to be visualized', keywords: ['source', 'url', 'uri', 'image'], enumValues: null, example: 'data:image/png;base64,...' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'Image' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the image', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
    { path: 'colormodel', label: 'Color Model', tier: 'B', description: 'Color model used to map the numerical color components', keywords: ['color', 'model', 'rgb', 'rgba'], enumValues: ['rgb', 'rgba', 'hsl', 'hsla'], example: 'rgb' },
    { path: 'zsmooth', label: 'Z Smooth', tier: 'B', description: 'Picks a smoothing algorithm for image z values', keywords: ['smooth', 'interpolation', 'zoom'], enumValues: ['fast', 'best', 'false'], example: 'fast' },
  ],

  // ─── GL (WebGL-accelerated) ───────────────────────────────────────────────────

  scattergl: [
    { path: 'x', label: 'X Axis', tier: 'A', description: 'Sets the x coordinates', keywords: ['x', 'axis', 'data', 'gl'], enumValues: null, example: [1, 2, 3] },
    { path: 'y', label: 'Y Axis', tier: 'A', description: 'Sets the y coordinates', keywords: ['y', 'axis', 'data', 'gl'], enumValues: null, example: [4, 5, 6] },
    { path: 'mode', label: 'Display Mode', tier: 'B', description: 'Determines the drawing mode', keywords: ['mode', 'markers', 'lines', 'gl'], enumValues: ['lines', 'markers', 'lines+markers', 'text', 'none'], example: 'markers' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: 'GL Scatter' },
    { path: 'marker.color', label: 'Marker Color', tier: 'B', description: 'Sets the marker color', keywords: ['color', 'marker'], enumValues: null, example: '#636efa' },
    { path: 'opacity', label: 'Opacity', tier: 'B', description: 'Sets the opacity of the trace', keywords: ['opacity', 'transparency'], enumValues: null, example: 1 },
  ],

  // ─── Contour variants ────────────────────────────────────────────────────────

  histogram2dcontour: [
    { path: 'x', label: 'X Values', tier: 'A', description: 'Sets the x sample data to be binned', keywords: ['x', 'data', 'sample'], enumValues: null, example: [1, 2, 2, 3] },
    { path: 'y', label: 'Y Values', tier: 'A', description: 'Sets the y sample data to be binned', keywords: ['y', 'data', 'sample'], enumValues: null, example: [4, 5, 5, 6] },
    { path: 'colorscale', label: 'Color Scale', tier: 'B', description: 'Sets the colorscale', keywords: ['colorscale', 'colors'], enumValues: ['Viridis', 'Hot', 'Blues', 'YlOrRd'], example: 'Viridis' },
    { path: 'name', label: 'Trace Name', tier: 'B', description: 'Sets the trace name', keywords: ['name', 'legend'], enumValues: null, example: '2D Histogram Contour' },
    { path: 'nbinsx', label: 'X Bins', tier: 'B', description: 'Maximum number of desired bins in x', keywords: ['bins', 'x', 'resolution'], enumValues: null, example: 20 },
    { path: 'ncontours', label: 'Number of Contours', tier: 'B', description: 'Sets the maximum number of contour levels', keywords: ['contours', 'levels', 'count'], enumValues: null, example: 15 },
  ],
};

export default tracePropCatalog;
