/**
 * Schema Registry - Lazy loads JSON schemas for chart types on demand
 */

// Cache for loaded schemas
const schemaCache = {};

// Loading state tracker
const loadingPromises = {};

/**
 * Dynamically import a schema file
 * @param {string} chartType - The chart type to load
 * @returns {Promise<object>} The loaded schema
 */
async function loadSchema(chartType) {
  // Return cached schema if already loaded
  if (schemaCache[chartType]) {
    return schemaCache[chartType];
  }

  // Return existing loading promise if already in progress
  if (loadingPromises[chartType]) {
    return loadingPromises[chartType];
  }

  // Start loading the schema
  loadingPromises[chartType] = (async () => {
    try {
      let schema;

      // Dynamic import based on chart type
      switch (chartType) {
        case 'area':
          schema = await import('./area.schema.json');
          break;
        case 'bar':
          schema = await import('./bar.schema.json');
          break;
        case 'barpolar':
          schema = await import('./barpolar.schema.json');
          break;
        case 'box':
          schema = await import('./box.schema.json');
          break;
        case 'candlestick':
          schema = await import('./candlestick.schema.json');
          break;
        case 'carpet':
          schema = await import('./carpet.schema.json');
          break;
        case 'choropleth':
          schema = await import('./choropleth.schema.json');
          break;
        case 'choroplethmap':
          schema = await import('./choroplethmap.schema.json');
          break;
        case 'choroplethmapbox':
          schema = await import('./choroplethmapbox.schema.json');
          break;
        case 'cone':
          schema = await import('./cone.schema.json');
          break;
        case 'contour':
          schema = await import('./contour.schema.json');
          break;
        case 'contourcarpet':
          schema = await import('./contourcarpet.schema.json');
          break;
        case 'densitymap':
          schema = await import('./densitymap.schema.json');
          break;
        case 'densitymapbox':
          schema = await import('./densitymapbox.schema.json');
          break;
        case 'funnel':
          schema = await import('./funnel.schema.json');
          break;
        case 'funnelarea':
          schema = await import('./funnelarea.schema.json');
          break;
        case 'heatmap':
          schema = await import('./heatmap.schema.json');
          break;
        case 'heatmapgl':
          schema = await import('./heatmapgl.schema.json');
          break;
        case 'histogram':
          schema = await import('./histogram.schema.json');
          break;
        case 'histogram2d':
          schema = await import('./histogram2d.schema.json');
          break;
        case 'histogram2dcontour':
          schema = await import('./histogram2dcontour.schema.json');
          break;
        case 'icicle':
          schema = await import('./icicle.schema.json');
          break;
        case 'image':
          schema = await import('./image.schema.json');
          break;
        case 'indicator':
          schema = await import('./indicator.schema.json');
          break;
        case 'isosurface':
          schema = await import('./isosurface.schema.json');
          break;
        case 'layout':
          schema = await import('./layout.schema.json');
          break;
        case 'mesh3d':
          schema = await import('./mesh3d.schema.json');
          break;
        case 'ohlc':
          schema = await import('./ohlc.schema.json');
          break;
        case 'parcats':
          schema = await import('./parcats.schema.json');
          break;
        case 'parcoords':
          schema = await import('./parcoords.schema.json');
          break;
        case 'pie':
          schema = await import('./pie.schema.json');
          break;
        case 'pointcloud':
          schema = await import('./pointcloud.schema.json');
          break;
        case 'sankey':
          schema = await import('./sankey.schema.json');
          break;
        case 'scatter':
          schema = await import('./scatter.schema.json');
          break;
        case 'scatter3d':
          schema = await import('./scatter3d.schema.json');
          break;
        case 'scattercarpet':
          schema = await import('./scattercarpet.schema.json');
          break;
        case 'scattergeo':
          schema = await import('./scattergeo.schema.json');
          break;
        case 'scattergl':
          schema = await import('./scattergl.schema.json');
          break;
        case 'scattermap':
          schema = await import('./scattermap.schema.json');
          break;
        case 'scattermapbox':
          schema = await import('./scattermapbox.schema.json');
          break;
        case 'scatterpolar':
          schema = await import('./scatterpolar.schema.json');
          break;
        case 'scatterpolargl':
          schema = await import('./scatterpolargl.schema.json');
          break;
        case 'scattersmith':
          schema = await import('./scattersmith.schema.json');
          break;
        case 'scatterternary':
          schema = await import('./scatterternary.schema.json');
          break;
        case 'splom':
          schema = await import('./splom.schema.json');
          break;
        case 'streamtube':
          schema = await import('./streamtube.schema.json');
          break;
        case 'sunburst':
          schema = await import('./sunburst.schema.json');
          break;
        case 'surface':
          schema = await import('./surface.schema.json');
          break;
        case 'treemap':
          schema = await import('./treemap.schema.json');
          break;
        case 'violin':
          schema = await import('./violin.schema.json');
          break;
        case 'volume':
          schema = await import('./volume.schema.json');
          break;
        case 'waterfall':
          schema = await import('./waterfall.schema.json');
          break;
        default:
          throw new Error(`Unknown chart type: ${chartType}`);
      }

      // Store in cache (handle both default export and direct export)
      const loadedSchema = schema.default || schema;
      schemaCache[chartType] = loadedSchema;

      // Clean up loading promise
      delete loadingPromises[chartType];

      return loadedSchema;
    } catch (error) {
      // Clean up loading promise on error
      delete loadingPromises[chartType];
      throw error;
    }
  })();

  return loadingPromises[chartType];
}

/**
 * Get schema for a chart type (async version)
 * @param {string} chartType - The chart type (e.g., 'scatter', 'bar')
 * @returns {Promise<object|null>} The JSON schema or null if not found
 */
export async function getSchema(chartType) {
  if (!chartType) return null;

  try {
    return await loadSchema(chartType);
  } catch (error) {
    console.error(`Failed to load schema for ${chartType}:`, error);
    return null;
  }
}

/**
 * Get schema for a chart type (synchronous version - only works if already cached)
 * @deprecated Use getSchema() instead for async loading
 * @param {string} chartType - The chart type
 * @returns {object|null} The JSON schema if cached, null otherwise
 */
export function getSchemaSync(chartType) {
  return schemaCache[chartType] || null;
}

/**
 * Preload schemas for better performance
 * @param {string[]} chartTypes - Array of chart types to preload
 * @returns {Promise<void>}
 */
export async function preloadSchemas(chartTypes) {
  await Promise.all(chartTypes.map(type => getSchema(type)));
}

/**
 * Check if a schema is already loaded
 * @param {string} chartType - The chart type
 * @returns {boolean} True if schema is in cache
 */
export function isSchemaLoaded(chartType) {
  return chartType in schemaCache;
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
  { value: 'heatmapgl', label: 'Heatmap GL' },
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
  { value: 'pointcloud', label: 'Point Cloud' },
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
  return CHART_TYPES.map(type => type.value).filter(type => type !== 'layout');
}

// Backwards compatibility - export empty SCHEMAS object that gets populated as schemas load
export const SCHEMAS = new Proxy({}, {
  get(target, prop) {
    // Return cached schema if available
    return schemaCache[prop] || null;
  },
  has(target, prop) {
    return prop in schemaCache;
  },
  ownKeys(target) {
    return Object.keys(schemaCache);
  },
});