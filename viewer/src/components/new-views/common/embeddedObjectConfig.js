/**
 * Configuration for embedded objects within parent objects
 * Defines how to handle nested objects that can be edited independently
 */

import { setAtPath } from './embeddedObjectUtils';

/**
 * Configuration for each type of embedded object relationship
 * Each config defines:
 * - parentTypes: Array of parent object types that can contain this embedded type
 * - embeddedType: The type of the embedded object
 * - pathGetter: Function to get the path to the embedded object within the parent
 * - configGetter: Function to extract the embedded config from the parent data
 * - applyToParent: Function to apply changes back to the parent config
 * - nameFormatter: Function to format the display name for the embedded object
 */
export const EMBEDDED_OBJECT_CONFIGS = [
  {
    // Models can have embedded sources
    parentTypes: ['model'],
    embeddedType: 'source',
    pathGetter: () => 'source',
    configGetter: (parentData) => parentData.source,
    applyToParent: (parentConfig, newConfig) => ({
      ...parentConfig,
      source: newConfig,
    }),
    nameFormatter: (parentName) => `(embedded in ${parentName})`,
  },
  {
    // Charts can have embedded insights
    parentTypes: ['chart'],
    embeddedType: 'insight',
    pathGetter: (index) => `insights[${index}]`,
    configGetter: (parentData, index) => parentData.chart?.insights?.[index],
    applyToParent: (parentConfig, newConfig, index) =>
      setAtPath(parentConfig, `insights[${index}]`, newConfig),
    nameFormatter: (parentName, index) => `(embedded insight ${index + 1} in ${parentName})`,
    isArray: true, // Indicates this is an array of embedded objects
  },
  {
    // Tables can have embedded insights
    parentTypes: ['table'],
    embeddedType: 'insight',
    pathGetter: (index) => `insights[${index}]`,
    configGetter: (parentData, index) => parentData.table?.insights?.[index],
    applyToParent: (parentConfig, newConfig, index) =>
      setAtPath(parentConfig, `insights[${index}]`, newConfig),
    nameFormatter: (parentName, index) => `(embedded insight ${index + 1} in ${parentName})`,
    isArray: true,
  },
];

/**
 * Get embedded object configuration for a parent-embedded type combination
 * @param {string} parentType - The type of the parent object
 * @param {string} embeddedType - The type of the embedded object
 * @returns {Object|null} The configuration for this relationship, or null if not found
 */
export const getEmbeddedConfig = (parentType, embeddedType) => {
  return EMBEDDED_OBJECT_CONFIGS.find(
    config => config.parentTypes.includes(parentType) && config.embeddedType === embeddedType
  ) || null;
};

/**
 * Check if a parent type can have embedded objects of a specific type
 * @param {string} parentType - The type of the parent object
 * @param {string} embeddedType - The type of the embedded object
 * @returns {boolean} True if the parent can contain this embedded type
 */
export const canHaveEmbedded = (parentType, embeddedType) => {
  return getEmbeddedConfig(parentType, embeddedType) !== null;
};

/**
 * Get all embedded types that a parent type can contain
 * @param {string} parentType - The type of the parent object
 * @returns {Array<string>} Array of embedded types this parent can contain
 */
export const getEmbeddedTypesForParent = (parentType) => {
  return EMBEDDED_OBJECT_CONFIGS
    .filter(config => config.parentTypes.includes(parentType))
    .map(config => config.embeddedType);
};

/**
 * Create a generic handler for editing embedded objects
 * @param {Function} clearEdit - Function to clear the edit stack
 * @param {Function} pushEdit - Function to push to the edit stack
 * @param {string} parentType - The type of the parent object
 * @param {Object} parentData - The parent object's data
 * @param {string} embeddedType - The type of the embedded object
 * @returns {Function|undefined} Handler function or undefined if not applicable
 */
export const createEmbeddedEditHandler = (clearEdit, pushEdit, parentType, parentData, embeddedType) => {
  const config = getEmbeddedConfig(parentType, embeddedType);
  if (!config) return undefined;

  // For array-based embedded objects (like insights in charts/tables)
  if (config.isArray) {
    return (embeddedConfig, index) => {
      const parentName = parentData[parentType]?.name || parentData.name;
      const parentObj = parentData[parentType] || parentData;

      // Create a synthetic object with embedded marker
      const syntheticObject = {
        name: config.nameFormatter(parentName, index),
        config: embeddedConfig,
        _embedded: {
          parentType,
          parentName,
          path: config.pathGetter(index),
        },
      };

      // Clear stack and push parent first, then embedded object with applyToParent
      clearEdit();
      pushEdit(parentType, parentObj);
      pushEdit(embeddedType, syntheticObject, {
        applyToParent: (parentConfig, newConfig) =>
          config.applyToParent(parentConfig, newConfig, index),
      });
    };
  }

  // For single embedded objects (like source in model)
  return () => {
    const embeddedConfig = config.configGetter(parentData);
    if (!embeddedConfig) return;

    const parentName = parentData[parentType]?.name || parentData.name;
    const parentObj = parentData[parentType] || parentData;

    // Create a synthetic object with embedded marker
    const syntheticObject = {
      name: config.nameFormatter(parentName),
      config: embeddedConfig,
      _embedded: {
        parentType,
        parentName,
        path: config.pathGetter(),
      },
    };

    // Clear stack and push parent first, then embedded object with applyToParent
    clearEdit();
    pushEdit(parentType, parentObj);
    pushEdit(embeddedType, syntheticObject, {
      applyToParent: (parentConfig, newConfig) =>
        config.applyToParent(parentConfig, newConfig),
    });
  };
};