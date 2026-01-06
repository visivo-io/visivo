/**
 * Schema Registry - Bundles all JSON schemas for chart types
 */

// Import all schemas
import areaSchema from './area.schema.json';
import barSchema from './bar.schema.json';
import barpolarSchema from './barpolar.schema.json';
import boxSchema from './box.schema.json';
import candlestickSchema from './candlestick.schema.json';
import carpetSchema from './carpet.schema.json';
import choroplethSchema from './choropleth.schema.json';
import choroplethmapSchema from './choroplethmap.schema.json';
import choroplethmapboxSchema from './choroplethmapbox.schema.json';
import coneSchema from './cone.schema.json';
import contourSchema from './contour.schema.json';
import contourcarpetSchema from './contourcarpet.schema.json';
import densitymapSchema from './densitymap.schema.json';
import densitymapboxSchema from './densitymapbox.schema.json';
import funnelSchema from './funnel.schema.json';
import funnelareaSchema from './funnelarea.schema.json';
import heatmapSchema from './heatmap.schema.json';
import histogramSchema from './histogram.schema.json';
import histogram2dSchema from './histogram2d.schema.json';
import histogram2dcontourSchema from './histogram2dcontour.schema.json';
import icicleSchema from './icicle.schema.json';
import imageSchema from './image.schema.json';
import indicatorSchema from './indicator.schema.json';
import isosurfaceSchema from './isosurface.schema.json';
import layoutSchema from './layout.schema.json';
import mesh3dSchema from './mesh3d.schema.json';
import ohlcSchema from './ohlc.schema.json';
import parcatsSchema from './parcats.schema.json';
import parcoordsSchema from './parcoords.schema.json';
import pieSchema from './pie.schema.json';
import sankeySchema from './sankey.schema.json';
import scatterSchema from './scatter.schema.json';
import scatter3dSchema from './scatter3d.schema.json';
import scattercarpetSchema from './scattercarpet.schema.json';
import scattergeoSchema from './scattergeo.schema.json';
import scatterglSchema from './scattergl.schema.json';
import scattermapSchema from './scattermap.schema.json';
import scattermapboxSchema from './scattermapbox.schema.json';
import scatterpolarSchema from './scatterpolar.schema.json';
import scatterpolarglSchema from './scatterpolargl.schema.json';
import scattersmithSchema from './scattersmith.schema.json';
import scatterternarySchema from './scatterternary.schema.json';
import splomSchema from './splom.schema.json';
import streamtubeSchema from './streamtube.schema.json';
import sunburstSchema from './sunburst.schema.json';
import surfaceSchema from './surface.schema.json';
import treemapSchema from './treemap.schema.json';
import violinSchema from './violin.schema.json';
import volumeSchema from './volume.schema.json';
import waterfallSchema from './waterfall.schema.json';

/**
 * Registry of all chart type schemas
 */
export const SCHEMAS = {
  area: areaSchema,
  bar: barSchema,
  barpolar: barpolarSchema,
  box: boxSchema,
  candlestick: candlestickSchema,
  carpet: carpetSchema,
  choropleth: choroplethSchema,
  choroplethmap: choroplethmapSchema,
  choroplethmapbox: choroplethmapboxSchema,
  cone: coneSchema,
  contour: contourSchema,
  contourcarpet: contourcarpetSchema,
  densitymap: densitymapSchema,
  densitymapbox: densitymapboxSchema,
  funnel: funnelSchema,
  funnelarea: funnelareaSchema,
  heatmap: heatmapSchema,
  histogram: histogramSchema,
  histogram2d: histogram2dSchema,
  histogram2dcontour: histogram2dcontourSchema,
  icicle: icicleSchema,
  image: imageSchema,
  indicator: indicatorSchema,
  isosurface: isosurfaceSchema,
  layout: layoutSchema,
  mesh3d: mesh3dSchema,
  ohlc: ohlcSchema,
  parcats: parcatsSchema,
  parcoords: parcoordsSchema,
  pie: pieSchema,
  sankey: sankeySchema,
  scatter: scatterSchema,
  scatter3d: scatter3dSchema,
  scattercarpet: scattercarpetSchema,
  scattergeo: scattergeoSchema,
  scattergl: scatterglSchema,
  scattermap: scattermapSchema,
  scattermapbox: scattermapboxSchema,
  scatterpolar: scatterpolarSchema,
  scatterpolargl: scatterpolarglSchema,
  scattersmith: scattersmithSchema,
  scatterternary: scatterternarySchema,
  splom: splomSchema,
  streamtube: streamtubeSchema,
  sunburst: sunburstSchema,
  surface: surfaceSchema,
  treemap: treemapSchema,
  violin: violinSchema,
  volume: volumeSchema,
  waterfall: waterfallSchema,
};

/**
 * Get schema for a chart type
 * @param {string} chartType - The chart type (e.g., 'scatter', 'bar')
 * @returns {object|null} The JSON schema or null if not found
 */
export function getSchema(chartType) {
  return SCHEMAS[chartType] || null;
}

/**
 * Get $defs from a schema for reference resolution
 * @param {object} schema - The JSON schema
 * @returns {object} The $defs object or empty object
 */
export function getSchemaDefs(schema) {
  return schema?.$defs || {};
}

/**
 * List of all available chart types with labels
 */
export const CHART_TYPES = [
  { value: 'scatter', label: 'Scatter / Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'pie', label: 'Pie' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'box', label: 'Box Plot' },
  { value: 'violin', label: 'Violin' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'indicator', label: 'Indicator' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'sunburst', label: 'Sunburst' },
  { value: 'sankey', label: 'Sankey' },
  { value: 'candlestick', label: 'Candlestick' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'area', label: 'Area' },
  { value: 'contour', label: 'Contour' },
  { value: 'histogram2d', label: '2D Histogram' },
  { value: 'histogram2dcontour', label: '2D Histogram Contour' },
  { value: 'ohlc', label: 'OHLC' },
  { value: 'scatter3d', label: 'Scatter 3D' },
  { value: 'surface', label: 'Surface' },
  { value: 'mesh3d', label: 'Mesh 3D' },
  { value: 'cone', label: 'Cone' },
  { value: 'streamtube', label: 'Streamtube' },
  { value: 'volume', label: 'Volume' },
  { value: 'isosurface', label: 'Isosurface' },
  { value: 'scattergeo', label: 'Scatter Geo' },
  { value: 'choropleth', label: 'Choropleth' },
  { value: 'scattermap', label: 'Scatter Map' },
  { value: 'densitymap', label: 'Density Map' },
  { value: 'choroplethmap', label: 'Choropleth Map' },
  { value: 'scattermapbox', label: 'Scatter Mapbox' },
  { value: 'densitymapbox', label: 'Density Mapbox' },
  { value: 'choroplethmapbox', label: 'Choropleth Mapbox' },
  { value: 'scatterpolar', label: 'Scatter Polar' },
  { value: 'barpolar', label: 'Bar Polar' },
  { value: 'scatterternary', label: 'Scatter Ternary' },
  { value: 'scattersmith', label: 'Scatter Smith' },
  { value: 'carpet', label: 'Carpet' },
  { value: 'scattercarpet', label: 'Scatter Carpet' },
  { value: 'contourcarpet', label: 'Contour Carpet' },
  { value: 'parcats', label: 'Parallel Categories' },
  { value: 'parcoords', label: 'Parallel Coordinates' },
  { value: 'splom', label: 'SPLOM' },
  { value: 'funnelarea', label: 'Funnel Area' },
  { value: 'icicle', label: 'Icicle' },
  { value: 'image', label: 'Image' },
  { value: 'scattergl', label: 'Scatter GL' },
  { value: 'scatterpolargl', label: 'Scatter Polar GL' },
];

/**
 * Get all available chart type values
 * @returns {string[]} Array of chart type values
 */
export function getChartTypeValues() {
  return Object.keys(SCHEMAS).filter(type => type !== 'layout');
}
