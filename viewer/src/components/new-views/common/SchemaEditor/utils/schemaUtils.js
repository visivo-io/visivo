/**
 * Schema utilities for parsing and working with JSON Schema 2020-12
 */

/**
 * Query-string patterns used in Visivo schemas
 */
const QUERY_STRING_PATTERNS = [
  /^\?\{.*\}$/, // ?{column}
  /^query\(.*\)$/, // query(...)
  /^column\(.*\)(?:\[-?\d+\])?$/, // column(...) or column(...)[n]
];

/**
 * Check if a value is a query-string value
 * @param {any} val - The value to check
 * @returns {boolean} True if the value matches query-string patterns
 */
export function isQueryStringValue(val) {
  if (typeof val !== 'string') return false;
  return QUERY_STRING_PATTERNS.some(pattern => pattern.test(val));
}

/**
 * Check if a schema supports query-string values
 * Looks for $ref to #/$defs/query-string in oneOf arrays
 * @param {object} schema - The JSON schema
 * @returns {boolean} True if query-string is supported
 */
export function supportsQueryString(schema) {
  if (!schema) return false;

  if (schema.$ref === '#/$defs/query-string') {
    return true;
  }

  if (schema.oneOf) {
    return schema.oneOf.some(opt => opt.$ref === '#/$defs/query-string' || supportsQueryString(opt));
  }

  if (schema.anyOf) {
    return schema.anyOf.some(opt => opt.$ref === '#/$defs/query-string' || supportsQueryString(opt));
  }

  return false;
}

/**
 * Resolve a $ref to its definition
 * @param {string} ref - The $ref string (e.g., "#/$defs/color")
 * @param {object} defs - The $defs object from the schema
 * @returns {object|null} The resolved definition or null
 */
export function resolveRef(ref, defs) {
  if (!ref || !ref.startsWith('#/$defs/')) return null;
  const defName = ref.replace('#/$defs/', '');
  return defs[defName] || null;
}

/**
 * Get the non-query-string schema from a property
 * Used to determine what static field type to render
 * @param {object} schema - The property schema
 * @param {object} defs - The $defs object from the schema
 * @returns {object|null} The static schema without query-string option
 */
export function getStaticSchema(schema, defs = {}) {
  if (!schema) return null;

  // If it's a direct $ref, resolve it
  if (schema.$ref) {
    if (schema.$ref === '#/$defs/query-string') {
      return null; // query-string only, no static option
    }
    return resolveRef(schema.$ref, defs) || schema;
  }

  // Handle oneOf - find first non-query-string option
  if (schema.oneOf) {
    const staticOption = schema.oneOf.find(opt => opt.$ref !== '#/$defs/query-string');
    if (staticOption) {
      // Recursively resolve if it's a $ref
      if (staticOption.$ref) {
        return resolveRef(staticOption.$ref, defs) || staticOption;
      }
      return staticOption;
    }
    return null;
  }

  // Handle anyOf similarly
  if (schema.anyOf) {
    const staticOption = schema.anyOf.find(opt => opt.$ref !== '#/$defs/query-string');
    if (staticOption) {
      if (staticOption.$ref) {
        return resolveRef(staticOption.$ref, defs) || staticOption;
      }
      return staticOption;
    }
    return null;
  }

  return schema;
}

/**
 * Flatten nested property paths from a schema
 * @param {object} schema - The JSON schema
 * @param {string} prefix - Path prefix for nested properties
 * @param {object} defs - The $defs object from the schema
 * @returns {Array<{path: string, schema: object, description: string, isObject: boolean}>}
 */
export function flattenSchemaProperties(schema, prefix = '', defs = {}) {
  const result = [];
  const properties = schema?.properties || {};

  Object.entries(properties).forEach(([propName, propSchema]) => {
    const path = prefix ? `${prefix}.${propName}` : propName;

    // Skip the 'type' property as it's handled separately
    if (propName === 'type' && !prefix) {
      return;
    }

    // Get the resolved schema for type detection
    const resolvedSchema = getStaticSchema(propSchema, defs);

    // Check if this is a nested object with properties
    const isNestedObject =
      resolvedSchema?.type === 'object' &&
      resolvedSchema.properties &&
      Object.keys(resolvedSchema.properties).length > 0;

    result.push({
      path,
      schema: propSchema,
      resolvedSchema,
      description: propSchema.description || resolvedSchema?.description || '',
      isObject: isNestedObject,
      supportsQueryString: supportsQueryString(propSchema),
    });

    // If it's a nested object, recursively flatten its properties
    if (isNestedObject) {
      result.push(...flattenSchemaProperties(resolvedSchema, path, defs));
    }
  });

  return result;
}

/**
 * Get value at a nested path
 * @param {object} obj - The object to get value from
 * @param {string} path - Dot-separated path (e.g., "marker.color")
 * @returns {any} The value at the path or undefined
 */
export function getValueAtPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/**
 * Set value at a nested path (immutably)
 * @param {object} obj - The source object
 * @param {string} path - Dot-separated path
 * @param {any} value - The value to set (undefined to delete)
 * @returns {object} New object with the value set
 */
export function setValueAtPath(obj, path, value) {
  const keys = path.split('.');
  const result = { ...(obj || {}) };

  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...(current[key] || {}) };
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }

  return cleanEmptyObjects(result);
}

/**
 * Remove empty nested objects
 * @param {object} obj - The object to clean
 * @returns {object|undefined} Cleaned object or undefined if empty
 */
export function cleanEmptyObjects(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleaned = cleanEmptyObjects(value);
    if (
      cleaned !== undefined &&
      (typeof cleaned !== 'object' || Array.isArray(cleaned) || Object.keys(cleaned).length > 0)
    ) {
      result[key] = cleaned;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Group properties by their parent object
 * @param {Array} properties - Flattened properties array
 * @returns {object} Properties grouped by parent path
 */
export function groupPropertiesByParent(properties) {
  const groups = {
    '': [], // Top-level properties
  };

  properties.forEach(prop => {
    const parts = prop.path.split('.');
    if (parts.length === 1) {
      groups[''].push(prop);
    } else {
      const parent = parts.slice(0, -1).join('.');
      if (!groups[parent]) {
        groups[parent] = [];
      }
      groups[parent].push(prop);
    }
  });

  return groups;
}

/**
 * Search/filter properties by query
 * @param {Array} properties - Flattened properties array
 * @param {string} query - Search query
 * @returns {Array} Filtered properties
 */
export function filterProperties(properties, query) {
  if (!query || !query.trim()) {
    return properties;
  }

  const lowerQuery = query.toLowerCase().trim();
  return properties.filter(prop => {
    const pathMatch = prop.path.toLowerCase().includes(lowerQuery);
    const descMatch = prop.description?.toLowerCase().includes(lowerQuery);
    return pathMatch || descMatch;
  });
}
