/**
 * Parse a nested prop path and return the parts
 * Example: "props.marker.colorscale[0]" -> ["props", "marker", "colorscale", "0"]
 * @param {string} path - The prop path
 * @returns {string[]} Array of path parts
 */
function parsePropPath(path) {
  // Replace array indices with dots: "foo[0]" -> "foo.0"
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  // Split on dots
  return normalized.split('.');
}

/**
 * Set a value in an object using a nested path
 * @param {Object} obj - The object to set in
 * @param {string[]} pathParts - Array of path parts
 * @param {*} value - The value to set
 */
function setNestedValue(obj, pathParts, value) {
  let current = obj;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];

    if (!(part in current)) {
      // Determine if next part is a number (array index) or not (object key)
      const nextPart = pathParts[i + 1];
      current[part] = /^\d+$/.test(nextPart) ? [] : {};
    }

    current = current[part];
  }

  const lastPart = pathParts[pathParts.length - 1];
  current[lastPart] = value;
}

/**
 * Map query results to props using props_mapping
 *
 * Takes query results (array of objects) and a props_mapping (map of prop paths to column names)
 * and returns a Plotly-compatible props object with arrays of data.
 *
 * Example:
 *   results: [{date: '2024-01', amount: 100}, {date: '2024-02', amount: 200}]
 *   props_mapping: {"props.x": "date", "props.y": "amount"}
 *   returns: {x: ['2024-01', '2024-02'], y: [100, 200]}
 *
 * @param {Array<Object>} results - Query results (array of row objects)
 * @param {Object} propsMapping - Map of prop paths to column aliases
 * @returns {Object} Props object with mapped data arrays
 */
export function mapQueryResultsToProps(results, propsMapping) {
  if (!results || results.length === 0) {
    console.warn('No results to map');
    return {};
  }

  if (!propsMapping || Object.keys(propsMapping).length === 0) {
    console.warn('No props_mapping provided');
    return {};
  }

  // Build data arrays from results
  const dataArrays = {};
  const firstRow = results[0];

  // Initialize arrays for each column
  for (const columnName of Object.keys(firstRow)) {
    dataArrays[columnName] = results.map(row => {
      const value = row[columnName];
      // Convert BigInt to string (DuckDB returns bigints)
      return typeof value === 'bigint' ? value.toString() : value;
    });
  }

  // Build props object using props_mapping
  const props = {};

  for (const [propPath, columnAlias] of Object.entries(propsMapping)) {
    // Skip "props." prefix if present
    const cleanPath = propPath.startsWith('props.') ? propPath.substring(6) : propPath;

    // Get the data array for this column
    const dataArray = dataArrays[columnAlias];

    if (!dataArray) {
      console.warn(`Column '${columnAlias}' not found in query results for prop '${propPath}'`);
      continue;
    }

    // Parse the prop path and set the value
    const pathParts = parsePropPath(cleanPath);
    setNestedValue(props, pathParts, dataArray);
  }

  return props;
}

/**
 * Transform insights data into chart-ready format
 *
 * Takes the insightsData object (from Zustand store) and converts it to an array
 * of Plotly-compatible trace objects.
 *
 * @param {Object} insightsData - Map of insight names to insight objects
 * @returns {Array<Object>} Array of Plotly trace objects
 */
export function chartDataFromInsightData(insightsData) {
  if (!insightsData) {
    console.warn('No insightsData provided');
    return [];
  }

  const traces = [];

  for (const [insightName, insightObj] of Object.entries(insightsData)) {
    if (!insightObj) {
      console.warn(`Insight '${insightName}' is null or undefined`);
      continue;
    }

    const { data, props_mapping } = insightObj;

    if (!data || data.length === 0) {
      console.warn(`Insight '${insightName}' has no data`);
      continue;
    }

    if (!props_mapping || Object.keys(props_mapping).length === 0) {
      console.warn(`Insight '${insightName}' has no props_mapping`);
      continue;
    }

    // Map query results to props
    const traceProps = mapQueryResultsToProps(data, props_mapping);

    // Add insight name
    traceProps.name = insightName;

    traces.push(traceProps);
  }

  console.debug(`Converted ${traces.length} insights to chart traces`);
  return traces;
}

/**
 * Convert query results to table-ready format
 *
 * @param {Array<Object>} results - Query results
 * @returns {Object} Table data with headers and rows
 */
export function tableDataFromQueryResults(results) {
  if (!results || results.length === 0) {
    return { headers: [], rows: [] };
  }

  const firstRow = results[0];
  const headers = Object.keys(firstRow);

  const rows = results.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Convert BigInt to string
      return typeof value === 'bigint' ? value.toString() : value;
    });
  });

  return { headers, rows };
}
