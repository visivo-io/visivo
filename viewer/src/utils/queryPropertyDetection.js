/**
 * Utility for detecting and extracting query-affecting properties from insight configs.
 *
 * Query-affecting properties are those that contain "?{}" patterns which are passed
 * to the backend query execution and change the data that is displayed. These properties
 * often (but not always) also contain input placeholders like "${input.accessor}".
 */

const QUERY_PATTERN = /\?\{[^}]*\}/;

/**
 * Check if a value contains query placeholders (?{...})
 *
 * @param {*} value - Value to check
 * @returns {boolean} - True if value contains ?{...} pattern
 */
export function hasQueryPattern(value) {
  if (typeof value !== 'string') return false;
  return QUERY_PATTERN.test(value);
}

/**
 * Recursively extract properties containing ?{} patterns from an object.
 *
 * @param {Object} obj - Object to search
 * @param {string} [prefix=''] - Key prefix for nested properties
 * @returns {Object} - Object containing only properties with ?{} patterns
 */
export function extractQueryAffectingProps(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return {};

  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (hasQueryPattern(value)) {
      result[fullKey] = value;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (hasQueryPattern(item)) {
          result[`${fullKey}[${index}]`] = item;
        } else if (typeof item === 'object' && item !== null) {
          const nestedProps = extractQueryAffectingProps(item, `${fullKey}[${index}]`);
          Object.assign(result, nestedProps);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      const nestedProps = extractQueryAffectingProps(value, fullKey);
      Object.assign(result, nestedProps);
    }
  }

  return result;
}

/**
 * Compare two configs and determine if their query-affecting properties have changed.
 *
 * @param {Object} config1 - First config to compare
 * @param {Object} config2 - Second config to compare
 * @returns {boolean} - True if query-affecting properties differ
 */
export function queryPropsHaveChanged(config1, config2) {
  const queryProps1 = extractQueryAffectingProps(config1);
  const queryProps2 = extractQueryAffectingProps(config2);

  const keys1 = Object.keys(queryProps1).sort();
  const keys2 = Object.keys(queryProps2).sort();

  if (keys1.length !== keys2.length) return true;
  if (JSON.stringify(keys1) !== JSON.stringify(keys2)) return true;

  for (const key of keys1) {
    if (queryProps1[key] !== queryProps2[key]) return true;
  }

  return false;
}

/**
 * Recursively walk a props object and remove leaf string values matching ?{...}.
 * Returns only the non-query (static) properties, suitable for direct store updates.
 *
 * @param {Object} obj - Props object to filter
 * @returns {Object} - Object with query-pattern values removed
 */
export function extractNonQueryProps(obj) {
  if (!obj || typeof obj !== 'object') return {};

  function recurse(value) {
    if (typeof value === 'string') {
      return QUERY_PATTERN.test(value) ? undefined : value;
    }
    if (Array.isArray(value)) {
      if (value.some(item => typeof item === 'string' && QUERY_PATTERN.test(item))) {
        return undefined;
      }
      const result = value.map(item => recurse(item)).filter(item => item !== undefined);
      return result.length > 0 ? result : undefined;
    }
    if (typeof value === 'object' && value !== null) {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        const filtered = recurse(val);
        if (filtered !== undefined) result[key] = filtered;
      }
      return Object.keys(result).length > 0 ? result : undefined;
    }
    return value;
  }

  const result = recurse(obj);
  return result !== undefined ? result : {};
}

/**
 * Create a hash of query-affecting properties for comparison/caching.
 *
 * @param {Object} config - Config to hash
 * @returns {string} - Hash string
 */
export function hashQueryProps(config) {
  const queryProps = extractQueryAffectingProps(config);
  const sortedKeys = Object.keys(queryProps).sort();
  const normalized = sortedKeys.map(key => `${key}:${queryProps[key]}`).join('|');
  return normalized;
}
