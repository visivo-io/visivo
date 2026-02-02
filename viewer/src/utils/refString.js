/**
 * Centralized utilities for ref string parsing and formatting.
 *
 * Ref strings come in two formats:
 *   - Bare:    ref(name)          or  ref(name).property
 *   - Context: ${ref(name)}       or  ${ref(name).property}
 *              ${ ref( name ) }   (with flexible whitespace)
 *
 * Use `formatRef` for bare format, `formatRefExpression` for context string format.
 * Use `parseRefValue` to extract the name from any format.
 */

/**
 * Extract name from a ref string.
 * Handles: ${ref(name)}, ${ ref( name ) }, ref(name), or raw name (returned as-is).
 * Returns null for falsy or non-string input.
 */
export const parseRefValue = value => {
  if (!value) return null;
  if (typeof value !== 'string') return null;

  // Match ${ ref(name) } pattern (context string format)
  const contextRefMatch = value.match(/^\$\{\s*ref\(\s*([^)]+)\s*\)\s*\}$/);
  if (contextRefMatch) {
    return contextRefMatch[1].trim();
  }

  // Match ref(name) pattern (bare format)
  const refMatch = value.match(/^ref\(\s*([^)]+)\s*\)$/);
  if (refMatch) {
    return refMatch[1].trim();
  }

  // Return as-is if not a ref format (could be raw name)
  return value;
};

/**
 * Format a ref string in bare form (no ${} wrapper).
 * Returns: ref(name) or ref(name).property
 */
export const formatRef = (name, property = null) => {
  const cleanName = name.trim();
  return property ? `ref(${cleanName}).${property.trim()}` : `ref(${cleanName})`;
};

/**
 * Format a complete ref expression with ${} wrapper.
 * Returns: ${ref(name)} or ${ref(name).property}
 */
export const formatRefExpression = (name, property = null) => {
  return `\${${formatRef(name, property)}}`;
};

/**
 * Parse multiple ref values (for multi-select).
 * Input can be: array of refs, comma-separated string, or single ref.
 * Returns array of extracted names.
 */
export const parseMultiRefValue = value => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(parseRefValue).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(v => parseRefValue(v.trim()))
      .filter(Boolean);
  }
  return [];
};

/**
 * Format multiple names as array of ref expressions (${ref(name)} format).
 * Returns null if empty.
 */
export const formatMultiRefValue = names => {
  if (!names || names.length === 0) return null;
  return names.map(name => formatRefExpression(name));
};
