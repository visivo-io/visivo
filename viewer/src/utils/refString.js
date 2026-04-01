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

// Shared regex patterns for ref string matching
// Matches ${ref(name).field} globally — captures the field name
export const REF_FIELD_PATTERN = /\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}/g;
// Matches a single ${ref(name).field} — captures the field name
export const SINGLE_REF_FIELD_PATTERN = /^\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}$/;
// Matches ${ref(name)} — captures the name
export const CONTEXT_REF_PATTERN = /^\$\{\s*ref\(\s*([^)]+)\s*\)\s*\}$/;
// Matches ${ref(name)...} anywhere — captures the name (global)
export const REF_NAME_PATTERN = /\$\{\s*ref\(\s*([^)]+)\s*\)/g;

/**
 * Extract name from a ref string.
 * Handles: ${ref(name)}, ${ ref( name ) }, ref(name), or raw name (returned as-is).
 * Returns null for falsy or non-string input.
 */
export const parseRefValue = value => {
  if (!value) return null;
  if (typeof value !== 'string') return null;

  // Match ${ ref(name) } pattern (context string format)
  const contextRefMatch = value.match(CONTEXT_REF_PATTERN);
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

/**
 * Extract all ref names from a single string that may contain
 * ${ref(name).field} patterns (including inside expressions like "sum(${ref(name).field})").
 *
 * Unlike parseRefValue which expects the entire string to be a ref,
 * this finds refs embedded anywhere in the string.
 *
 * @param {string} str - String possibly containing ref patterns
 * @returns {string[]} Ref names found (may contain duplicates)
 */
export const extractRefNames = (str) => {
  if (!str || typeof str !== 'string') return [];
  const names = [];
  const pattern = new RegExp(REF_NAME_PATTERN.source, REF_NAME_PATTERN.flags);
  let match;
  while ((match = pattern.exec(str)) !== null) {
    names.push(match[1].trim());
  }
  return names;
};

/**
 * Extract all unique ref names from an array of strings.
 *
 * @param {string[]} strings - Array of strings possibly containing ref patterns
 * @returns {string[]} Unique ref names found
 */
export const extractRefNamesFromStrings = (strings) => {
  if (!strings || !Array.isArray(strings)) return [];
  const names = new Set();
  for (const str of strings) {
    extractRefNames(str).forEach(n => names.add(n));
  }
  return [...names];
};
