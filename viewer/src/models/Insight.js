/**
 * Deep merge source object into target object.
 * Target values take precedence over source values (source is the base).
 * This is used to merge static props (base) with dynamic props (override).
 *
 * @param {Object} target - Target object (dynamic props)
 * @param {Object} source - Source object (static props)
 * @returns {Object} The merged target object
 */
function deepMergeStaticProps(target, source) {
  if (!source || typeof source !== 'object') {
    return target;
  }

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];

    // Skip if target already has this key (dynamic props override static)
    if (key in target) {
      // If both are objects (not arrays), recursively merge
      if (
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key]) &&
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue)
      ) {
        deepMergeStaticProps(target[key], sourceValue);
      }
      // Otherwise, keep target value (dynamic overrides static)
      continue;
    }

    // Key doesn't exist in target, add from source
    if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
      // Deep clone objects
      target[key] = {};
      deepMergeStaticProps(target[key], sourceValue);
    } else {
      // Arrays and primitives are copied directly
      target[key] = sourceValue;
    }
  }

  return target;
}

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
 * Group data rows by unique values in a split column
 * @param {Array<Object>} data - Query results
 * @param {string} splitKey - Column name to group by
 * @returns {Object} Map of split values to arrays of rows
 */
function groupDataBySplitKey(data, splitKey) {
  const groups = {};

  for (const row of data) {
    const splitValue = row[splitKey];
    const key = splitValue !== null && splitValue !== undefined ? String(splitValue) : 'null';

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(row);
  }

  return groups;
}

/**
 * Transform insights data into chart-ready format
 *
 * Takes the insightsData object (from Zustand store) and converts it to an array
 * of Plotly-compatible trace objects. If an insight has a split_key, the data
 * will be grouped by unique split values and multiple traces will be created.
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

    const { data, props_mapping, split_key, type, static_props } = insightObj;

    if (!data || data.length === 0) {
      console.warn(`Insight '${insightName}' has no data`);
      continue;
    }

    if (!props_mapping || Object.keys(props_mapping).length === 0) {
      console.warn(`Insight '${insightName}' has no props_mapping`);
      continue;
    }

    // Check if this insight has a split interaction
    if (split_key && data[0] && data[0][split_key] !== undefined) {
      // Group data by split values
      const groupedData = groupDataBySplitKey(data, split_key);

      for (const [splitValue, groupRows] of Object.entries(groupedData)) {
        // Map each group to props (dynamic props from query results)
        const traceProps = mapQueryResultsToProps(groupRows, props_mapping);

        // Merge static props (non-query props like marker.color: ["red", "green"])
        // Static props are the base, dynamic props override them
        if (static_props) {
          deepMergeStaticProps(traceProps, static_props);
        }

        // Set trace type from insight definition
        if (type) {
          traceProps.type = type;
        }

        // Set trace name to include split value
        traceProps.name = `${insightName} - ${splitValue}`;
        traceProps.legendgroup = splitValue;

        traces.push(traceProps);
      }
    } else {
      // No split - create single trace (existing behavior)
      const traceProps = mapQueryResultsToProps(data, props_mapping);

      // Merge static props (non-query props like marker.color: ["red", "green"])
      // Static props are the base, dynamic props override them
      if (static_props) {
        deepMergeStaticProps(traceProps, static_props);
      }

      // Set trace type from insight definition
      if (type) {
        traceProps.type = type;
      }

      traceProps.name = insightName;
      traces.push(traceProps);
    }
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
