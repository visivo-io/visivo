// Helper to resolve $ref paths in the schema
const resolveRef = (schema, ref) => {
  if (!ref || !ref.startsWith('#/$defs/')) return null;
  const defPath = ref.replace('#/$defs/', '');
  return schema.$defs?.[defPath];
};

// Check if a property references a top-level object
const isTopLevelRef = (schema, ref) => {
  if (!ref || !ref.startsWith('#/$defs/')) return false;
  const type = ref.replace('#/$defs/', '');
  const isTopLevel = Object.keys(schema.properties || {}).some(key => {
    const prop = schema.properties[key];
    if (prop.items?.oneOf) {
      return prop.items.oneOf.some(item => item.$ref === `#/$defs/${type}`);
    }
    return false;
  });
  console.log('Checking top level ref:', { ref, isTopLevel });
  return isTopLevel;
};

// Get the discriminated type schema
const getDiscriminatedSchema = (schema, currentSchema, value) => {
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

// Get the schema for a specific path
const getSchemaAtPath = (schema, objectType, path = [], value = null) => {
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
    currentSchema = getDiscriminatedSchema(schema, currentSchema, currentValue);
  }

  return currentSchema;
};

// Get available properties for an object type at a specific path
export const getAvailableProperties = (schema, objectType, path = [], value = null) => {
  const currentSchema = getSchemaAtPath(schema, objectType, path, value);
  if (!currentSchema) return [];

  // Handle discriminated types
  const resolvedSchema = getDiscriminatedSchema(schema, currentSchema, value);
  if (!resolvedSchema?.properties) return [];

  return Object.entries(resolvedSchema.properties).map(([key, prop]) => {
    // Handle $ref, anyOf, oneOf
    const resolvedProp = prop.$ref ? resolveRef(schema, prop.$ref) :
                        prop.anyOf ? prop.anyOf.find(p => p.type !== 'null') || prop.anyOf[0] :
                        prop.oneOf ? prop.oneOf[0] :
                        prop;

    const result = {
      key,
      type: resolvedProp.type || 'any',
      description: prop.description || resolvedProp.description,
      required: resolvedSchema.required?.includes(key) || false,
      enum: resolvedProp.enum,
      default: resolvedProp.default,
      isTopLevelRef: prop.$ref ? isTopLevelRef(schema, prop.$ref) : false
    };

    console.log('Property details:', { key, result });
    return result;
  });
};

// Get default value for a property
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
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
};

// Validate a value against its schema
export const validateValue = (schema, objectType, value, path = []) => {
  const propertySchema = getSchemaAtPath(schema, objectType, path);
  if (!propertySchema) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Basic type validation
  if (propertySchema.type) {
    const typeValid = validateType(value, propertySchema.type);
    if (!typeValid.valid) {
      errors.push(typeValid.error);
    }
  }

  // Enum validation
  if (propertySchema.enum && !propertySchema.enum.includes(value)) {
    errors.push(`Must be one of: ${propertySchema.enum.join(', ')}`);
  }

  // Pattern validation for strings
  if (propertySchema.type === 'string' && propertySchema.pattern) {
    const regex = new RegExp(propertySchema.pattern);
    if (!regex.test(value)) {
      errors.push(`Must match pattern: ${propertySchema.pattern}`);
    }
  }

  // Required properties for objects
  if (propertySchema.type === 'object' && propertySchema.required) {
    const missingRequired = propertySchema.required.filter(prop => !(prop in value));
    if (missingRequired.length > 0) {
      errors.push(`Missing required properties: ${missingRequired.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Helper for type validation
const validateType = (value, expectedType) => {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string' 
        ? { valid: true }
        : { valid: false, error: 'Must be a string' };
    case 'number':
      return typeof value === 'number'
        ? { valid: true }
        : { valid: false, error: 'Must be a number' };
    case 'boolean':
      return typeof value === 'boolean'
        ? { valid: true }
        : { valid: false, error: 'Must be a boolean' };
    case 'array':
      return Array.isArray(value)
        ? { valid: true }
        : { valid: false, error: 'Must be an array' };
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { valid: true }
        : { valid: false, error: 'Must be an object' };
    default:
      return { valid: true };
  }
}; 