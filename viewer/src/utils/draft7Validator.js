import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Create Ajv instance with Draft 7 support
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  $data: true,
  strict: false,
});

// Add format validation
addFormats(ajv);

// Cache for compiled validators
const validatorCache = new Map();

/**
 * Get a compiled validator for a schema
 * @param {Object} schema - The JSON Schema
 * @param {string} path - Path to the subschema (e.g., "#/$defs/Chart")
 * @returns {Function} - Compiled validator function
 */
export const getValidator = (schema, path) => {
  if (!schema) return null;
  
  // Use cached validator if available
  const cacheKey = path || 'root';
  if (validatorCache.has(cacheKey)) {
    return validatorCache.get(cacheKey);
  }

  // Get the subschema at the specified path
  let subschema = schema;
  if (path) {
    // Handle $defs paths
    if (path.startsWith('#/$defs/')) {
      const defPath = path.replace('#/$defs/', '');
      subschema = schema.$defs?.[defPath];
    }
  }

  if (!subschema) return null;

  // Compile the validator
  try {
    const validate = ajv.compile(subschema);
    validatorCache.set(cacheKey, validate);
    return validate;
  } catch (error) {
    console.error('Error compiling schema validator:', error);
    return null;
  }
};

/**
 * Resolve a $ref in the schema
 * @param {Object} schema - The full JSON Schema
 * @param {string} ref - The $ref path
 * @returns {Object} - The resolved schema
 */
export const resolveRef = (schema, ref) => {
  if (!ref || !ref.startsWith('#/$defs/')) return null;
  const defPath = ref.replace('#/$defs/', '');
  return schema.$defs?.[defPath];
};

/**
 * Check if a property references a top-level object
 * @param {Object} schema - The full JSON Schema
 * @param {string} ref - The $ref path
 * @returns {boolean} - Whether the ref is a top-level object
 */
export const isTopLevelRef = (schema, ref) => {
  if (!ref || !ref.startsWith('#/$defs/')) return false;
  const type = ref.replace('#/$defs/', '');
  
  // Check if this type is referenced in any of the top-level array properties
  const topLevelArrayProps = [
    'models', 'traces', 'charts', 'dashboards', 'tables', 'selectors'
  ];
  
  return topLevelArrayProps.some(propName => {
    const prop = schema.properties?.[propName];
    if (prop?.items?.oneOf) {
      return prop.items.oneOf.some(item => item.$ref === `#/$defs/${type}`);
    }
    if (prop?.items?.$ref === `#/$defs/${type}`) {
      return true;
    }
    return false;
  });
};

/**
 * Get the schema for a specific path
 * @param {Object} schema - The full JSON Schema
 * @param {string} objectType - The type of the root object
 * @param {Array} path - Path to the property
 * @param {Object} value - Current value at the path
 * @returns {Object} - The schema at the path
 */
export const getSchemaAtPath = (schema, objectType, path = [], value = null) => {
  if (!schema || !objectType) return null;

  // Start with the root type
  let currentSchema = schema.$defs?.[objectType];
  let currentValue = value;

  // No path means we're looking at the root level
  if (!path || path.length === 0) {
    return currentSchema;
  }

  // Follow the path to get the correct schema
  for (const key of path) {
    if (!currentSchema) return null;

    // Handle array indices
    if (typeof key === 'number') {
      currentSchema = currentSchema.items;
      currentValue = currentValue?.[key];
      continue;
    }

    // Handle object properties
    if (currentSchema.properties?.[key]) {
      const prop = currentSchema.properties[key];
      currentSchema = prop.$ref ? resolveRef(schema, prop.$ref) : prop;
      currentValue = currentValue?.[key];
    } else if (currentSchema.type === 'object' && currentSchema.additionalProperties) {
      currentSchema = currentSchema.additionalProperties;
      currentValue = currentValue?.[key];
    } else {
      return null;
    }

    // Handle discriminator if present
    if (currentSchema?.discriminator) {
      currentSchema = getDiscriminatedSchema(schema, currentSchema, currentValue);
    }
  }

  return currentSchema;
};

/**
 * Get the discriminated type schema
 * @param {Object} schema - The full JSON Schema
 * @param {Object} currentSchema - The current schema with discriminator
 * @param {Object} value - The current value
 * @returns {Object} - The discriminated schema
 */
export const getDiscriminatedSchema = (schema, currentSchema, value) => {
  if (!currentSchema?.discriminator) return currentSchema;

  const discriminatorProp = currentSchema.discriminator.propertyName;
  let discriminatorValue = value?.[discriminatorProp] || currentSchema.default?.[discriminatorProp];

  if (discriminatorValue && currentSchema.discriminator.mapping) {
    const ref = currentSchema.discriminator.mapping[discriminatorValue];
    if (ref) {
      return resolveRef(schema, ref) || currentSchema;
    }
  }

  // If no matching discriminator, try the first oneOf schema
  if (currentSchema.oneOf?.[0]?.$ref) {
    return resolveRef(schema, currentSchema.oneOf[0].$ref) || currentSchema;
  }

  return currentSchema;
};

/**
 * Get available properties for an object type at a specific path
 * @param {Object} schema - The full JSON Schema
 * @param {string} objectType - The type of the root object
 * @param {Array} path - Path to the object
 * @param {Object} value - Current value at the path
 * @returns {Array} - Array of property metadata
 */
export const getAvailableProperties = (schema, objectType, path = [], value = null) => {
  const currentSchema = getSchemaAtPath(schema, objectType, path, value);
  if (!currentSchema) return [];

  // Handle discriminated types
  const resolvedSchema = currentSchema.discriminator 
    ? getDiscriminatedSchema(schema, currentSchema, value)
    : currentSchema;
    
  if (!resolvedSchema?.properties) return [];

  return Object.entries(resolvedSchema.properties).map(([key, prop]) => {
    // Handle $ref, anyOf, oneOf
    const resolvedProp = prop.$ref ? resolveRef(schema, prop.$ref) :
                        prop.anyOf ? prop.anyOf.find(p => p.type !== 'null') || prop.anyOf[0] :
                        prop.oneOf ? prop.oneOf[0] :
                        prop;

    return {
      key,
      type: resolvedProp.type || 'any',
      description: prop.description || resolvedProp.description,
      required: resolvedSchema.required?.includes(key) || false,
      enum: resolvedProp.enum,
      default: resolvedProp.default,
      format: resolvedProp.format,
      pattern: resolvedProp.pattern,
      minimum: resolvedProp.minimum,
      maximum: resolvedProp.maximum,
      minLength: resolvedProp.minLength,
      maxLength: resolvedProp.maxLength,
      isTopLevelRef: prop.$ref ? isTopLevelRef(schema, prop.$ref) : false
    };
  });
};

/**
 * Get default value for a property
 * @param {Object} schema - The full JSON Schema
 * @param {string} objectType - The type of the root object
 * @param {Array} path - Path to the property
 * @returns {*} - Default value for the property
 */
export const getDefaultValue = (schema, objectType, path = []) => {
  const propertySchema = getSchemaAtPath(schema, objectType, path);
  if (!propertySchema) return null;

  // Use schema default if available
  if ('default' in propertySchema) {
    return propertySchema.default;
  }

  // Otherwise create based on type
  switch (propertySchema.type) {
    case 'string': return '';
    case 'number': return 0;
    case 'integer': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
};

/**
 * Validate a value against its schema
 * @param {Object} schema - The full JSON Schema
 * @param {string} objectType - The type of the root object
 * @param {*} value - The value to validate
 * @param {Array} path - Path to the property
 * @returns {Object} - Validation result with errors
 */
export const validateValue = (schema, objectType, value, path = []) => {
  const propertySchema = getSchemaAtPath(schema, objectType, path);
  if (!propertySchema) {
    return { valid: true, errors: [] };
  }

  // Get validator for this schema
  const validate = getValidator(propertySchema);
  if (!validate) {
    return { valid: true, errors: [] };
  }

  // Validate the value
  const valid = validate(value);
  
  if (!valid) {
    // Format error messages
    const errors = (validate.errors || []).map(err => {
      const { keyword, message, params } = err;
      
      switch (keyword) {
        case 'type':
          return `Must be a ${params.type}`;
        case 'enum':
          return `Must be one of: ${params.allowedValues.join(', ')}`;
        case 'pattern':
          return `Must match pattern: ${params.pattern}`;
        case 'required':
          return `Missing required property: ${params.missingProperty}`;
        case 'format':
          return `Must be a valid ${params.format}`;
        case 'minimum':
          return `Must be greater than or equal to ${params.limit}`;
        case 'maximum':
          return `Must be less than or equal to ${params.limit}`;
        case 'minLength':
          return `Must be at least ${params.limit} characters`;
        case 'maxLength':
          return `Must be at most ${params.limit} characters`;
        default:
          return message;
      }
    });

    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
};

/**
 * Validate an entire object against its schema
 * @param {Object} schema - The full JSON Schema
 * @param {string} objectType - The type of the root object
 * @param {Object} value - The object to validate
 * @returns {Object} - Validation result with errors by path
 */
export const validateObject = (schema, objectType, value) => {
  if (!schema || !objectType || !value) {
    return { valid: true, errors: {} };
  }

  const rootSchema = schema.$defs?.[objectType];
  if (!rootSchema) {
    return { valid: true, errors: {} };
  }

  const validate = getValidator(rootSchema);
  if (!validate) {
    return { valid: true, errors: {} };
  }

  const valid = validate(value);
  
  if (!valid) {
    // Group errors by property path
    const errorsByPath = {};
    
    (validate.errors || []).forEach(err => {
      const path = err.instancePath.split('/').filter(Boolean);
      const pathKey = path.join('.');
      
      if (!errorsByPath[pathKey]) {
        errorsByPath[pathKey] = [];
      }
      
      const { keyword, message, params } = err;
      let errorMessage = message;
      
      switch (keyword) {
        case 'type':
          errorMessage = `Must be a ${params.type}`;
          break;
        case 'enum':
          errorMessage = `Must be one of: ${params.allowedValues.join(', ')}`;
          break;
        case 'pattern':
          errorMessage = `Must match pattern: ${params.pattern}`;
          break;
        case 'required':
          // For required errors, add the missing property to the path
          const requiredPath = [...path, params.missingProperty].join('.');
          if (!errorsByPath[requiredPath]) {
            errorsByPath[requiredPath] = [];
          }
          errorsByPath[requiredPath].push('This field is required');
          return;
        case 'format':
          errorMessage = `Must be a valid ${params.format}`;
          break;
        default:
          break;
      }
      
      errorsByPath[pathKey].push(errorMessage);
    });
    
    return { valid: false, errors: errorsByPath };
  }

  return { valid: true, errors: {} };
}; 