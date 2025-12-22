/**
 * Process input references in props, replacing ${input.accessor} patterns with actual values.
 *
 * Input refs use JavaScript template literal syntax: ${inputName.accessor}
 * where accessor can be: value, values, min, max, first, last
 *
 * @param {*} props - Props object (can be nested object, array, or primitive)
 * @param {Object} inputs - Map of input names to input objects with accessor values
 * @returns {*} Props with input refs replaced with actual values
 *
 * Example:
 *   props: { mode: "${show_markers.value}" }
 *   inputs: { show_markers: { value: "markers" } }
 *   returns: { mode: "markers" }
 */
export function processInputRefsInProps(props, inputs) {
  if (!props || !inputs || Object.keys(inputs).length === 0) {
    return props;
  }

  /**
   * Process a single value, replacing ${input.accessor} patterns
   */
  function processValue(value) {
    if (typeof value === 'string' && value.includes('${')) {
      // Check if this is an input ref pattern
      const inputRefPattern = /^\$\{(\w+)\.(\w+)\}$/;
      const match = value.match(inputRefPattern);

      if (match) {
        const [, inputName, accessor] = match;
        const input = inputs[inputName];

        if (input && input[accessor] !== undefined) {
          const result = input[accessor];
          // Return the actual type (number, string, array, etc.)
          return result;
        }
        // Input not found or accessor not available - return original
        return value;
      }

      // For more complex templates with embedded refs (e.g., "prefix_${input.value}_suffix")
      // Use regex replacement
      const embeddedPattern = /\$\{(\w+)\.(\w+)\}/g;
      let hasMatch = false;
      const replaced = value.replace(embeddedPattern, (fullMatch, inputName, accessor) => {
        hasMatch = true;
        const input = inputs[inputName];
        if (input && input[accessor] !== undefined) {
          return String(input[accessor]);
        }
        return fullMatch;
      });

      if (hasMatch) {
        // Try to convert to number if the result looks numeric
        const num = Number(replaced);
        return !isNaN(num) && replaced.trim() !== '' ? num : replaced;
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => processValue(item));
    }

    if (typeof value === 'object' && value !== null) {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = processValue(val);
      }
      return result;
    }

    return value;
  }

  return processValue(props);
}

/**
 * Extract input names referenced in static_props
 * Looks for ${inputName.accessor} patterns
 * @param {Object} props - Static props object
 * @returns {string[]} - Array of unique input names found in props
 */
export function extractInputDependenciesFromProps(props) {
  if (!props) return [];

  const inputNames = new Set();
  const pattern = /\$\{(\w+)\.\w+\}/g;

  function scanValue(value) {
    if (typeof value === 'string') {
      const matches = value.matchAll(pattern);
      for (const match of matches) {
        inputNames.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => scanValue(item));
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(val => scanValue(val));
    }
  }

  scanValue(props);
  return [...inputNames];
}

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
    return {};
  }

  if (!propsMapping || Object.keys(propsMapping).length === 0) {
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
 * Input refs in static_props (like ${input.value}) are replaced with actual values
 * if inputs are provided.
 *
 * @param {Object} insightsData - Map of insight names to insight objects
 * @param {Object} inputs - Optional map of input names to input objects with accessor values
 * @returns {Array<Object>} Array of Plotly trace objects
 */
export function chartDataFromInsightData(insightsData, inputs = {}) {
  if (!insightsData) {
    return [];
  }

  const traces = [];

  for (const [insightName, insightObj] of Object.entries(insightsData)) {
    if (!insightObj) {
      continue;
    }

    const { data, props_mapping, split_key, type, static_props } = insightObj;

    if (!data || data.length === 0) {
      continue;
    }

    if (!props_mapping || Object.keys(props_mapping).length === 0) {
      continue;
    }

    // Process static_props to replace input refs with actual values
    const processedStaticProps = static_props ? processInputRefsInProps(static_props, inputs) : null;

    // Check if this insight has a split interaction
    if (split_key && data[0] && data[0][split_key] !== undefined) {
      // Group data by split values
      const groupedData = groupDataBySplitKey(data, split_key);

      for (const [splitValue, groupRows] of Object.entries(groupedData)) {
        // Map each group to props (dynamic props from query results)
        const traceProps = mapQueryResultsToProps(groupRows, props_mapping);

        // Merge static props (non-query props like marker.color: ["red", "green"])
        // Static props are the base, dynamic props override them
        if (processedStaticProps) {
          deepMergeStaticProps(traceProps, processedStaticProps);
        }

        // Set trace type from insight definition
        if (type) {
          traceProps.type = type;
        }

        // Set trace name to split value only (for cleaner legend display)
        traceProps.name = splitValue;
        traceProps.sourceInsight = insightName; // Track original insight name for filtering
        traceProps.legendgroup = splitValue;

        traces.push(traceProps);
      }
    } else {
      // No split - create single trace (existing behavior)
      const traceProps = mapQueryResultsToProps(data, props_mapping);

      // Merge static props (non-query props like marker.color: ["red", "green"])
      // Static props are the base, dynamic props override them
      if (processedStaticProps) {
        deepMergeStaticProps(traceProps, processedStaticProps);
      }

      // Set trace type from insight definition
      if (type) {
        traceProps.type = type;
      }

      traceProps.name = insightName;
      traces.push(traceProps);
    }
  }

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
