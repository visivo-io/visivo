/**
 * Utility functions for embedded object editing
 *
 * Embedded objects (like sources in models, or insights in charts/tables)
 * are edited in-place. When saved, they update the parent's config in the
 * edit stack (not the backend). The backend save happens when the parent saves.
 */

/**
 * Check if an object is embedded
 * @param {Object} object - Object to check
 * @returns {boolean} True if the object has embedded metadata
 */
export const isEmbeddedObject = (object) => {
  return object?._embedded != null;
};

/**
 * Set a value at a path in an object (immutably)
 * Supports simple keys ('source') and array notation ('insights[0]')
 * @param {Object} obj - The object to update
 * @param {string} path - Path to set (e.g., 'source' or 'insights[0]')
 * @param {*} value - Value to set
 * @returns {Object} New object with the value set
 */
export const setAtPath = (obj, path, value) => {
  // Handle array notation like 'insights[0]'
  const arrayMatch = path.match(/^(\w+)\[(\d+)\]$/);

  if (arrayMatch) {
    const [, arrayKey, indexStr] = arrayMatch;
    const index = parseInt(indexStr, 10);
    const array = [...(obj[arrayKey] || [])];
    array[index] = value;
    return { ...obj, [arrayKey]: array };
  }

  // Simple key
  return { ...obj, [path]: value };
};
