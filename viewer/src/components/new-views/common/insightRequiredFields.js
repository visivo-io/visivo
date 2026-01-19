/**
 * Required fields configuration for each insight/chart type
 * These fields are extracted from schemas and shown as explicit form inputs
 * rather than being part of the generic SchemaEditor
 */

/**
 * Required fields per chart type
 * Each entry contains an array of field configurations
 */
export const REQUIRED_FIELDS = {
  // 2D Charts
  scatter: [
    { name: 'x', label: 'X Axis', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Sets the y coordinates' },
  ],

  bar: [
    { name: 'x', label: 'X Axis', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Sets the y coordinates' },
  ],

  line: [
    { name: 'x', label: 'X Axis', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Sets the y coordinates' },
  ],

  area: [
    { name: 'x', label: 'X Axis', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Sets the y coordinates' },
  ],

  // Pie/Donut
  pie: [
    { name: 'values', label: 'Values', type: 'dataArray', description: 'Sets the values of the sectors' },
    { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Sets the sector labels', optional: true },
  ],

  // Statistical
  box: [
    { name: 'y', label: 'Y Values', type: 'dataArray', description: 'Sets the y sample data' },
    { name: 'x', label: 'X Categories', type: 'dataArray', description: 'Sets the x categories', optional: true },
  ],

  violin: [
    { name: 'y', label: 'Y Values', type: 'dataArray', description: 'Sets the y sample data' },
    { name: 'x', label: 'X Categories', type: 'dataArray', description: 'Sets the x categories', optional: true },
  ],

  histogram: [
    { name: 'x', label: 'X Values', type: 'dataArray', description: 'Sets the sample data to be binned' },
  ],

  histogram2d: [
    { name: 'x', label: 'X Values', type: 'dataArray', description: 'Sets the x sample data' },
    { name: 'y', label: 'Y Values', type: 'dataArray', description: 'Sets the y sample data' },
  ],

  // Heatmaps
  heatmap: [
    { name: 'z', label: 'Z Values', type: 'dataArray', description: 'Sets the z values (2D array)' },
    { name: 'x', label: 'X Labels', type: 'dataArray', description: 'Sets the x axis labels', optional: true },
    { name: 'y', label: 'Y Labels', type: 'dataArray', description: 'Sets the y axis labels', optional: true },
  ],

  heatmapgl: [
    { name: 'z', label: 'Z Values', type: 'dataArray', description: 'Sets the z values (2D array)' },
    { name: 'x', label: 'X Labels', type: 'dataArray', description: 'Sets the x axis labels', optional: true },
    { name: 'y', label: 'Y Labels', type: 'dataArray', description: 'Sets the y axis labels', optional: true },
  ],

  contour: [
    { name: 'z', label: 'Z Values', type: 'dataArray', description: 'Sets the z values (2D array)' },
    { name: 'x', label: 'X Coordinates', type: 'dataArray', description: 'Sets the x coordinates', optional: true },
    { name: 'y', label: 'Y Coordinates', type: 'dataArray', description: 'Sets the y coordinates', optional: true },
  ],

  // 3D Charts
  scatter3d: [
    { name: 'x', label: 'X Axis', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Axis', type: 'dataArray', description: 'Sets the y coordinates' },
    { name: 'z', label: 'Z Axis', type: 'dataArray', description: 'Sets the z coordinates' },
  ],

  surface: [
    { name: 'z', label: 'Z Values', type: 'dataArray', description: 'Sets the z values (2D array)' },
    { name: 'x', label: 'X Coordinates', type: 'dataArray', description: 'Sets the x coordinates', optional: true },
    { name: 'y', label: 'Y Coordinates', type: 'dataArray', description: 'Sets the y coordinates', optional: true },
  ],

  mesh3d: [
    { name: 'x', label: 'X Coordinates', type: 'dataArray', description: 'Sets the x coordinates' },
    { name: 'y', label: 'Y Coordinates', type: 'dataArray', description: 'Sets the y coordinates' },
    { name: 'z', label: 'Z Coordinates', type: 'dataArray', description: 'Sets the z coordinates' },
  ],

  // Financial
  candlestick: [
    { name: 'x', label: 'X Axis (Time)', type: 'dataArray', description: 'Sets the x coordinates (time)' },
    { name: 'open', label: 'Open', type: 'dataArray', description: 'Sets the open values' },
    { name: 'high', label: 'High', type: 'dataArray', description: 'Sets the high values' },
    { name: 'low', label: 'Low', type: 'dataArray', description: 'Sets the low values' },
    { name: 'close', label: 'Close', type: 'dataArray', description: 'Sets the close values' },
  ],

  ohlc: [
    { name: 'x', label: 'X Axis (Time)', type: 'dataArray', description: 'Sets the x coordinates (time)' },
    { name: 'open', label: 'Open', type: 'dataArray', description: 'Sets the open values' },
    { name: 'high', label: 'High', type: 'dataArray', description: 'Sets the high values' },
    { name: 'low', label: 'Low', type: 'dataArray', description: 'Sets the low values' },
    { name: 'close', label: 'Close', type: 'dataArray', description: 'Sets the close values' },
  ],

  waterfall: [
    { name: 'x', label: 'X Categories', type: 'dataArray', description: 'Sets the x categories' },
    { name: 'y', label: 'Y Values', type: 'dataArray', description: 'Sets the y values' },
  ],

  // Hierarchical
  treemap: [
    { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Sets the labels of each sector' },
    { name: 'parents', label: 'Parents', type: 'dataArray', description: 'Sets the parent sectors' },
    { name: 'values', label: 'Values', type: 'dataArray', description: 'Sets the values', optional: true },
  ],

  sunburst: [
    { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Sets the labels of each sector' },
    { name: 'parents', label: 'Parents', type: 'dataArray', description: 'Sets the parent sectors' },
    { name: 'values', label: 'Values', type: 'dataArray', description: 'Sets the values', optional: true },
  ],

  icicle: [
    { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Sets the labels of each sector' },
    { name: 'parents', label: 'Parents', type: 'dataArray', description: 'Sets the parent sectors' },
    { name: 'values', label: 'Values', type: 'dataArray', description: 'Sets the values', optional: true },
  ],

  // Flow
  sankey: [
    { name: 'node', label: 'Nodes', type: 'object', description: 'Node configuration',
      fields: [
        { name: 'label', label: 'Labels', type: 'dataArray', description: 'Node labels' },
      ]
    },
    { name: 'link', label: 'Links', type: 'object', description: 'Link configuration',
      fields: [
        { name: 'source', label: 'Source', type: 'dataArray', description: 'Source node indices' },
        { name: 'target', label: 'Target', type: 'dataArray', description: 'Target node indices' },
        { name: 'value', label: 'Value', type: 'dataArray', description: 'Link values' },
      ]
    },
  ],

  // Specialized
  indicator: [
    { name: 'value', label: 'Value', type: 'number', description: 'Sets the indicator value' },
    { name: 'mode', label: 'Mode', type: 'flaglist', description: 'Display mode',
      options: ['number', 'delta', 'gauge'], default: 'number' },
  ],

  // Maps
  scattergeo: [
    { name: 'lat', label: 'Latitude', type: 'dataArray', description: 'Sets the latitude coordinates' },
    { name: 'lon', label: 'Longitude', type: 'dataArray', description: 'Sets the longitude coordinates' },
  ],

  choropleth: [
    { name: 'locations', label: 'Locations', type: 'dataArray', description: 'Sets the locations (country codes, state codes, etc.)' },
    { name: 'z', label: 'Values', type: 'dataArray', description: 'Sets the color values' },
  ],

  scattermapbox: [
    { name: 'lat', label: 'Latitude', type: 'dataArray', description: 'Sets the latitude coordinates' },
    { name: 'lon', label: 'Longitude', type: 'dataArray', description: 'Sets the longitude coordinates' },
  ],

  // Polar
  scatterpolar: [
    { name: 'r', label: 'R (Radius)', type: 'dataArray', description: 'Sets the radial coordinates' },
    { name: 'theta', label: 'Theta (Angle)', type: 'dataArray', description: 'Sets the angular coordinates' },
  ],

  barpolar: [
    { name: 'r', label: 'R (Radius)', type: 'dataArray', description: 'Sets the radial coordinates' },
    { name: 'theta', label: 'Theta (Angle)', type: 'dataArray', description: 'Sets the angular coordinates' },
  ],

  // Advanced
  funnel: [
    { name: 'y', label: 'Y Values', type: 'dataArray', description: 'Sets the y values' },
    { name: 'x', label: 'X Values', type: 'dataArray', description: 'Sets the x values' },
  ],

  funnelarea: [
    { name: 'values', label: 'Values', type: 'dataArray', description: 'Sets the values' },
    { name: 'labels', label: 'Labels', type: 'dataArray', description: 'Sets the labels' },
  ],

  parcats: [
    { name: 'dimensions', label: 'Dimensions', type: 'array', description: 'Dimension configurations' },
  ],

  parcoords: [
    { name: 'dimensions', label: 'Dimensions', type: 'array', description: 'Dimension configurations' },
  ],

  splom: [
    { name: 'dimensions', label: 'Dimensions', type: 'array', description: 'Dimension configurations' },
  ],

  // Other chart types can use default (no required fields)
  // Will fall back to showing all fields in SchemaEditor
};

/**
 * Get required fields for a chart type
 * @param {string} chartType - The chart type
 * @returns {Array} Array of required field configurations
 */
export function getRequiredFields(chartType) {
  return REQUIRED_FIELDS[chartType] || [];
}

/**
 * Check if a field is required for a chart type
 * @param {string} chartType - The chart type
 * @param {string} fieldName - The field name
 * @returns {boolean} True if the field is required
 */
export function isFieldRequired(chartType, fieldName) {
  const fields = getRequiredFields(chartType);
  return fields.some(f => f.name === fieldName && !f.optional);
}

/**
 * Get all field names (required and optional) for a chart type
 * @param {string} chartType - The chart type
 * @returns {Array<string>} Array of field names
 */
export function getAllFieldNames(chartType) {
  const fields = getRequiredFields(chartType);
  const names = [];

  fields.forEach(field => {
    if (field.fields) {
      // Nested fields (like sankey node/link)
      names.push(field.name);
    } else {
      names.push(field.name);
    }
  });

  return names;
}