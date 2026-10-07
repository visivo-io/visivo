import { withAlpha } from './colorUtils';
import { deepMerge } from './deepMerge';
import { BUILTIN_THEMES } from './builtinThemes';

const font = (t, extra = {}) => ({ family: t.font_family, size: t.font_size, color: t.text, ...extra });
const mutedFont = (t, extra = {}) => font(t, { color: t.muted_text, ...extra });
// Family and colour, deliberately no size. Plotly sizes an indicator's number
// and delta to fill the space it is given; naming a size opts out of that, and
// a KPI then renders at body-text size in the middle of a large empty card.
const autoSizedFont = (t, extra = {}) => ({ family: t.font_family, color: t.text, ...extra });

const cartesianAxis = t => ({
  gridcolor: t.grid,
  linecolor: t.border,
  zerolinecolor: t.border,
  tickcolor: t.border,
  tickfont: mutedFont(t),
  title: { font: mutedFont(t), standoff: 12 },
  automargin: true,
  showline: false,
  zeroline: false,
  ticks: '',
});

const sceneAxis = t => ({
  backgroundcolor: t.surface,
  showbackground: true,
  gridcolor: t.grid,
  linecolor: t.border,
  zerolinecolor: t.border,
  tickfont: mutedFont(t),
  title: { font: mutedFont(t) },
});

const radialStyleAxis = t => ({
  gridcolor: t.grid,
  linecolor: t.border,
  tickcolor: t.border,
  tickfont: mutedFont(t),
});

const ternaryAxis = t => ({
  ...radialStyleAxis(t),
  title: { font: mutedFont(t) },
});

const colorbar = t => ({
  outlinewidth: 0,
  thickness: 12,
  tickfont: mutedFont(t),
  title: { font: mutedFont(t) },
  tickcolor: t.border,
});

const controlStyle = t => ({
  bgcolor: t.surface,
  bordercolor: t.border,
  font: font(t),
});

const baseLayout = t => ({
  font: font(t),
  title: { font: font(t, { size: Math.round(t.font_size * 1.35) }), x: 0, xanchor: 'left', pad: { l: 8 } },
  paper_bgcolor: t.surface,
  plot_bgcolor: t.surface,
  colorway: t.colorway,
  hovermode: 'closest',
  hoverlabel: {
    bgcolor: t.surface,
    bordercolor: t.border,
    font: font(t),
    align: 'left',
  },
  legend: {
    bgcolor: 'rgba(0,0,0,0)',
    bordercolor: t.border,
    font: font(t),
    title: { font: mutedFont(t) },
  },
  xaxis: cartesianAxis(t),
  yaxis: cartesianAxis(t),
  polar: {
    bgcolor: t.surface,
    angularaxis: radialStyleAxis(t),
    radialaxis: radialStyleAxis(t),
  },
  ternary: {
    bgcolor: t.surface,
    aaxis: ternaryAxis(t),
    baxis: ternaryAxis(t),
    caxis: ternaryAxis(t),
  },
  smith: {
    bgcolor: t.surface,
    realaxis: radialStyleAxis(t),
    imaginaryaxis: radialStyleAxis(t),
  },
  geo: {
    bgcolor: t.surface,
    showland: true,
    landcolor: t.mode === 'dark' ? '#262b45' : '#efede6',
    showocean: true,
    oceancolor: t.mode === 'dark' ? '#161a30' : '#f7f9fa',
    showlakes: true,
    lakecolor: t.mode === 'dark' ? '#161a30' : '#f7f9fa',
    countrycolor: t.border,
    coastlinecolor: t.border,
    subunitcolor: t.border,
    framecolor: t.border,
  },
  map: { style: t.map_style },
  mapbox: { style: t.map_style },
  scene: {
    xaxis: sceneAxis(t),
    yaxis: sceneAxis(t),
    zaxis: sceneAxis(t),
  },
  colorscale: {
    sequential: t.colorscale_sequential,
    sequentialminus: t.colorscale_sequential,
    diverging: t.colorscale_diverging,
  },
  coloraxis: { colorbar: colorbar(t) },
  annotationdefaults: {
    font: font(t),
    arrowcolor: t.muted_text,
    bgcolor: 'rgba(0,0,0,0)',
  },
  shapedefaults: { line: { color: t.muted_text } },
  updatemenudefaults: controlStyle(t),
  sliderdefaults: {
    ...controlStyle(t),
    activebgcolor: t.accent,
    tickcolor: t.border,
  },
});

const sliceBorder = t => ({ marker: { line: { color: t.surface, width: 1 } } });

const colorbarTraces = [
  'heatmap',
  'contour',
  'histogram2d',
  'histogram2dcontour',
  'surface',
  'densitymap',
  'densitymapbox',
  'choropleth',
  'choroplethmap',
  'choroplethmapbox',
  'volume',
  'isosurface',
  'cone',
  'streamtube',
  'contourcarpet',
  'mesh3d',
];

const carpetAxis = t => ({
  gridcolor: t.grid,
  linecolor: t.border,
  endlinecolor: t.border,
  minorgridcolor: t.grid,
  color: t.muted_text,
  tickfont: mutedFont(t),
  title: { font: mutedFont(t) },
});

const traceDefaults = t => {
  const data = {
    bar: { textfont: font(t), insidetextfont: font(t), outsidetextfont: font(t) },
    histogram: { textfont: font(t) },
    barpolar: { marker: { line: { color: t.surface, width: 0.5 } } },
    pie: { ...sliceBorder(t), textfont: font(t), outsidetextfont: font(t) },
    sunburst: { ...sliceBorder(t), textfont: font(t), outsidetextfont: font(t) },
    treemap: {
      ...sliceBorder(t),
      textfont: font(t),
      pathbar: { textfont: font(t) },
    },
    icicle: {
      ...sliceBorder(t),
      textfont: font(t),
      pathbar: { textfont: font(t) },
    },
    funnelarea: { ...sliceBorder(t), textfont: font(t) },
    funnel: { textfont: font(t), connector: { fillcolor: withAlpha(t.muted_text, 0.12) } },
    waterfall: {
      textfont: font(t),
      increasing: { marker: { color: t.increasing } },
      decreasing: { marker: { color: t.decreasing } },
      totals: { marker: { color: t.accent } },
      connector: { line: { color: t.border } },
    },
    candlestick: {
      increasing: { line: { color: t.increasing }, fillcolor: t.increasing },
      decreasing: { line: { color: t.decreasing }, fillcolor: t.decreasing },
    },
    ohlc: {
      increasing: { line: { color: t.increasing } },
      decreasing: { line: { color: t.decreasing } },
    },
    sankey: {
      node: { line: { color: t.surface, width: 1 } },
      link: { color: withAlpha(t.muted_text, 0.25) },
      textfont: font(t),
    },
    parcoords: {
      labelfont: font(t),
      tickfont: mutedFont(t),
      rangefont: mutedFont(t),
      line: { colorbar: colorbar(t), colorscale: t.colorscale_sequential },
    },
    parcats: {
      labelfont: font(t),
      tickfont: mutedFont(t),
    },
    table: {
      header: {
        fill: { color: t.mode === 'dark' ? '#252a45' : '#f1efea' },
        line: { color: t.border },
        font: font(t, { weight: 600 }),
      },
      cells: {
        fill: { color: t.surface },
        line: { color: t.border },
        font: font(t),
      },
    },
    indicator: {
      title: { font: autoSizedFont(t, { color: t.muted_text }) },
      number: { font: autoSizedFont(t) },
      delta: {
        font: autoSizedFont(t),
        increasing: { color: t.increasing },
        decreasing: { color: t.decreasing },
      },
      gauge: {
        bgcolor: t.surface,
        bordercolor: t.border,
        bar: { color: t.accent },
        axis: { tickcolor: t.border, tickfont: mutedFont(t) },
      },
    },
    carpet: { aaxis: carpetAxis(t), baxis: carpetAxis(t) },
  };

  // Most colorscaled traces default to their own built-in scale rather than layout.colorscale.
  for (const type of colorbarTraces) {
    data[type] = deepMerge(data[type] || {}, {
      colorbar: colorbar(t),
      colorscale: t.colorscale_sequential,
    });
  }

  return Object.fromEntries(Object.entries(data).map(([type, defaults]) => [type, [defaults]]));
};

export const TEMPLATED_TRACE_TYPES = Object.freeze(Object.keys(traceDefaults(BUILTIN_THEMES.light)));

export const buildPlotlyTemplate = (tokens, extraLayout = []) => {
  const layout = [baseLayout(tokens), ...extraLayout.filter(Boolean)].reduce(
    (acc, next) => deepMerge(acc, next),
    {}
  );
  return { layout, data: traceDefaults(tokens) };
};
