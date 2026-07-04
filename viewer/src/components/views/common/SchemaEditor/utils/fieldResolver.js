/**
 * Field resolver - determines which field component to render based on schema
 */

import { resolveRef, getStaticSchema } from './schemaUtils';

/**
 * Known $def types that map to specific field components
 */
const DEF_TYPE_MAP = {
  color: 'color',
  colorscale: 'colorscale',
  'query-string': 'query-string',
};

/**
 * Check if schema is a pattern-based multi-select
 * Detects patterns like: ^(a|b|c)(\\+(a|b|c))*$
 * @param {object} schema - The JSON schema
 * @param {object} defs - The $defs object
 * @returns {boolean} True if this is a pattern multi-select schema
 */
export function isPatternMultiSelect(schema, defs = {}) {
  if (!schema) return false;

  // Check if any option in oneOf/anyOf (including nested) has the pattern
  // Note: Don't use getStaticSchema here as it collapses oneOf structures
  const hasPatternOption = (schemaToCheck) => {
    // Check oneOf or anyOf
    const options = schemaToCheck.oneOf || schemaToCheck.anyOf;
    if (!options) return false;

    return options.some((opt) => {
      // Skip query-string refs
      if (opt.$ref === '#/$defs/query-string') return false;

      // Check nested oneOf/anyOf
      if (opt.oneOf || opt.anyOf) {
        return hasPatternOption(opt);
      }

      // Resolve $ref if needed
      let resolvedOpt = opt;
      if (opt.$ref) {
        resolvedOpt = resolveRef(opt.$ref, defs) || opt;
      }

      // Check if this option has the multi-select pattern
      if (resolvedOpt.type === 'string' && resolvedOpt.pattern) {
        // Pattern looks like: ^(a|b|c)(\+(a|b|c))*$
        // Need to match: backslash, plus, so use \\\+ (3 backslashes)
        const regex = /^\^?\([^)]+\)\(\\\+\([^)]+\)/;
        return regex.test(resolvedOpt.pattern);
      }

      return false;
    });
  };

  return hasPatternOption(schema);
}

/**
 * Extract optional enum values from pattern schema
 * @param {object} schema - The JSON schema
 * @param {object} defs - The $defs object
 * @returns {string[]} Array of enum values or empty array
 */
export function getPatternEnumValues(schema, defs = {}) {
  if (!schema) return [];

  // Search for enum option in oneOf/anyOf (including nested)
  // Note: Don't use getStaticSchema here as it collapses oneOf structures
  const findEnumOption = (schemaToCheck) => {
    const options = schemaToCheck.oneOf || schemaToCheck.anyOf;
    if (!options) return [];

    for (const opt of options) {
      // Skip query-string refs
      if (opt.$ref === '#/$defs/query-string') continue;

      // Check nested oneOf/anyOf
      if (opt.oneOf || opt.anyOf) {
        const nestedEnum = findEnumOption(opt);
        if (nestedEnum.length > 0) return nestedEnum;
      }

      // Resolve $ref if needed
      let resolvedOpt = opt;
      if (opt.$ref) {
        resolvedOpt = resolveRef(opt.$ref, defs) || opt;
      }

      // Check if this option has enum
      if (resolvedOpt.enum && resolvedOpt.type === 'string') {
        return resolvedOpt.enum;
      }
    }
    return [];
  };

  return findEnumOption(schema);
}

/**
 * Resolve the field type from a JSON schema
 * @param {object} schema - The JSON schema for the property
 * @param {object} defs - The $defs object from the root schema
 * @returns {string} The field type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'colorscale' | 'array' | 'object' | 'unknown'
 */
export function resolveFieldType(schema, defs = {}) {
  if (!schema) return 'unknown';

  // Check for pattern multi-select BEFORE other checks
  if (isPatternMultiSelect(schema, defs)) {
    return 'patternMultiselect';
  }

  // Get the static (non-query-string) schema
  const staticSchema = getStaticSchema(schema, defs);
  if (!staticSchema) {
    // Only query-string option available
    return 'query-string';
  }

  // Check for $ref to known types
  if (schema.$ref) {
    const defName = schema.$ref.replace('#/$defs/', '');
    if (DEF_TYPE_MAP[defName]) {
      return DEF_TYPE_MAP[defName];
    }
    // Resolve the ref and continue analyzing
    const resolved = resolveRef(schema.$ref, defs);
    if (resolved) {
      return resolveFieldType(resolved, defs);
    }
  }

  // Check oneOf/anyOf for specific types (non-query-string)
  if (schema.oneOf || schema.anyOf) {
    const options = schema.oneOf || schema.anyOf;
    for (const option of options) {
      if (option.$ref === '#/$defs/query-string') continue;

      if (option.$ref) {
        const defName = option.$ref.replace('#/$defs/', '');
        if (DEF_TYPE_MAP[defName]) {
          return DEF_TYPE_MAP[defName];
        }
        const resolved = resolveRef(option.$ref, defs);
        if (resolved) {
          return resolveFieldType(resolved, defs);
        }
      }

      // If it's an inline schema, analyze it
      const inlineType = resolveFieldType(option, defs);
      if (inlineType !== 'unknown') {
        return inlineType;
      }
    }
  }

  // Check for enum
  if (staticSchema.enum) {
    return 'enum';
  }

  // Check for const (treat as enum with single value)
  if (staticSchema.const !== undefined) {
    return 'enum';
  }

  // Check explicit type
  const schemaType = staticSchema.type;

  if (schemaType === 'string') {
    return 'string';
  }

  if (schemaType === 'number' || schemaType === 'integer') {
    return 'number';
  }

  if (schemaType === 'boolean') {
    return 'boolean';
  }

  if (schemaType === 'array') {
    return 'array';
  }

  if (schemaType === 'object') {
    return 'object';
  }

  // Handle array of types
  if (Array.isArray(schemaType)) {
    // Prioritize based on common patterns
    if (schemaType.includes('string')) return 'string';
    if (schemaType.includes('number') || schemaType.includes('integer')) return 'number';
    if (schemaType.includes('boolean')) return 'boolean';
    if (schemaType.includes('array')) return 'array';
    if (schemaType.includes('object')) return 'object';
  }

  // If schema only has description/default but no type, treat as string (accepts any value)
  if (staticSchema.description || staticSchema.default !== undefined) {
    return 'string';
  }

  // Empty schema {} or schema with only unknown keys - treat as string (accepts any value)
  // This handles edge cases like impliedEdits: {} or autorangeoptions.include
  return 'string';
}

/**
 * Get the field component name for a resolved type
 * @param {string} fieldType - The resolved field type
 * @returns {string} The component name to use
 */
export function getFieldComponentName(fieldType) {
  const componentMap = {
    string: 'StringField',
    number: 'NumberField',
    boolean: 'BooleanField',
    enum: 'EnumField',
    color: 'ColorField',
    colorscale: 'ColorscaleField',
    array: 'ArrayField',
    patternMultiselect: 'PatternMultiSelectField',
    'query-string': 'QueryStringField',
    unknown: 'StringField', // Fallback to string input
  };

  return componentMap[fieldType] || 'StringField';
}

/**
 * Extract enum values from a schema
 * @param {object} schema - The JSON schema
 * @param {object} defs - The $defs object
 * @returns {Array} Array of enum values or empty array
 */
export function getEnumValues(schema, defs = {}) {
  const staticSchema = getStaticSchema(schema, defs);
  if (!staticSchema) return [];

  if (staticSchema.enum) {
    return staticSchema.enum;
  }

  if (staticSchema.const !== undefined) {
    return [staticSchema.const];
  }

  return [];
}

/**
 * Get number constraints from schema
 * @param {object} schema - The JSON schema
 * @param {object} defs - The $defs object
 * @returns {object} Object with min, max, step properties
 */
export function getNumberConstraints(schema, defs = {}) {
  const staticSchema = getStaticSchema(schema, defs);
  if (!staticSchema) return {};

  return {
    min: staticSchema.minimum,
    max: staticSchema.maximum,
    exclusiveMin: staticSchema.exclusiveMinimum,
    exclusiveMax: staticSchema.exclusiveMaximum,
    step: staticSchema.multipleOf,
    isInteger: staticSchema.type === 'integer',
  };
}

/**
 * Get array item schema
 * @param {object} schema - The array schema
 * @param {object} defs - The $defs object
 * @returns {object|null} The items schema or null
 */
export function getArrayItemSchema(schema, defs = {}) {
  const staticSchema = getStaticSchema(schema, defs);
  if (!staticSchema || staticSchema.type !== 'array') return null;

  return staticSchema.items || null;
}

/**
 * Get default value for a schema
 * @param {object} schema - The JSON schema
 * @param {object} defs - The $defs object
 * @returns {any} The default value or undefined
 */
export function getDefaultValue(schema, defs = {}) {
  if (!schema) return undefined;

  // Check direct default
  if (schema.default !== undefined) {
    return schema.default;
  }

  // Check resolved schema default
  const staticSchema = getStaticSchema(schema, defs);
  if (staticSchema?.default !== undefined) {
    return staticSchema.default;
  }

  return undefined;
}
