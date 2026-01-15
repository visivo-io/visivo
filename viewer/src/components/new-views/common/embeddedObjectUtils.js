/**
 * Utility functions for embedded object editing
 *
 * Embedded objects (like sources in models, or insights in charts/tables)
 * use a unified metadata structure to identify their parent relationship.
 */

/**
 * Create embedded metadata for an object
 * @param {string} parentType - 'model' | 'chart' | 'table'
 * @param {string} parentName - Name of the parent object
 * @param {string} path - Property path in parent config (e.g., 'source' or 'insights[0]')
 * @returns {Object} Embedded metadata object
 */
export const createEmbeddedMeta = (parentType, parentName, path) => ({
  parentType,
  parentName,
  path,
});

/**
 * Create a synthetic object for editing an embedded config
 * @param {string} type - Object type ('source' | 'insight')
 * @param {Object} config - The embedded config to edit
 * @param {Object} embeddedMeta - Result from createEmbeddedMeta
 * @param {string} displayName - Optional display name for the object
 * @returns {Object} Synthetic object suitable for the edit stack
 */
export const createSyntheticObject = (type, config, embeddedMeta, displayName) => ({
  name: displayName || `(embedded ${type})`,
  status: 'published',
  child_item_names: [],
  config,
  _embedded: embeddedMeta,
});

/**
 * Check if an object is embedded
 * @param {Object} object - Object to check
 * @returns {boolean} True if the object has embedded metadata
 */
export const isEmbeddedObject = (object) => {
  return object?._embedded != null;
};

/**
 * Get the embedded metadata from an object
 * @param {Object} object - Object with potential embedded metadata
 * @returns {Object|null} Embedded metadata or null
 */
export const getEmbeddedMeta = (object) => {
  return object?._embedded || null;
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

/**
 * Save an embedded object by updating its parent
 * @param {Object} config - The new config for the embedded object
 * @param {Object} embeddedMeta - Embedded metadata (parentType, parentName, path)
 * @param {Object} stores - Object containing store functions and data
 * @returns {Promise<Object>} Result object with success/error
 */
export const saveEmbeddedObject = async (config, embeddedMeta, stores) => {
  const { parentType, parentName, path } = embeddedMeta;
  const { models, charts, tables, saveModel, saveChartConfig, saveTableConfig } = stores;

  // Find the parent object
  let parent;
  let saveParent;
  let parentConfig;

  switch (parentType) {
    case 'model':
      parent = models?.find(m => m.name === parentName);
      saveParent = saveModel;
      break;
    case 'chart':
      parent = charts?.find(c => c.name === parentName);
      saveParent = saveChartConfig;
      break;
    case 'table':
      parent = tables?.find(t => t.name === parentName);
      saveParent = saveTableConfig;
      break;
    default:
      return { success: false, error: `Unknown parent type: ${parentType}` };
  }

  if (!parent) {
    return { success: false, error: `Parent ${parentType} "${parentName}" not found` };
  }

  // Build updated config with the embedded object
  parentConfig = {
    ...parent.config,
    name: parent.name,
  };

  // Preserve sql for models
  if (parentType === 'model' && parent.config?.sql) {
    parentConfig.sql = parent.config.sql;
  }

  // Update at the specified path
  parentConfig = setAtPath(parentConfig, path, config);

  // Save the parent
  const result = await saveParent(parentName, parentConfig);

  return result;
};

/**
 * Save a standalone object directly
 * @param {string} type - Object type ('source', 'model', 'insight', etc.)
 * @param {string} name - Object name
 * @param {Object} config - Object config
 * @param {Object} stores - Object containing store functions
 * @returns {Promise<Object>} Result object with success/error
 */
export const saveStandaloneObject = async (type, name, config, stores) => {
  const {
    saveSource,
    saveModel,
    saveDimension,
    saveMetric,
    saveRelation,
    saveInsightConfig,
    saveMarkdownConfig,
    saveChartConfig,
    saveTableConfig,
  } = stores;

  switch (type) {
    case 'source':
      return await saveSource(name, config);
    case 'model':
      return await saveModel(name, config);
    case 'dimension':
      return await saveDimension(name, config);
    case 'metric':
      return await saveMetric(name, config);
    case 'relation':
      return await saveRelation(name, config);
    case 'insight':
      return await saveInsightConfig(name, config);
    case 'markdown':
      return await saveMarkdownConfig(name, config);
    case 'chart':
      return await saveChartConfig(name, config);
    case 'table':
      return await saveTableConfig(name, config);
    default:
      return { success: false, error: `Unknown object type: ${type}` };
  }
};
