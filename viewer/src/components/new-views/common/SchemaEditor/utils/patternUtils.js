/**
 * Pattern-based multi-select utilities
 * Handles parsing and serialization of pattern values like "lines+markers"
 */

/**
 * Parse a pattern value string into an array of options
 * @param {string|undefined} value - Pattern string like "lines+markers"
 * @returns {string[]} Array of options like ["lines", "markers"]
 * @example
 * parsePatternValue("lines+markers") // ["lines", "markers"]
 * parsePatternValue("lines") // ["lines"]
 * parsePatternValue("") // []
 * parsePatternValue(undefined) // []
 */
export function parsePatternValue(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  return value
    .split('+')
    .map(opt => opt.trim())
    .filter(opt => opt.length > 0);
}

/**
 * Serialize an array of options into a pattern value string
 * Always sorts alphabetically to ensure order-independence
 * @param {string[]} options - Array of selected options
 * @returns {string} Pattern string like "lines+markers"
 * @example
 * serializePatternValue(["markers", "lines"]) // "lines+markers"
 * serializePatternValue(["lines"]) // "lines"
 * serializePatternValue([]) // ""
 */
export function serializePatternValue(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return '';
  }

  // Sort alphabetically to normalize order
  return options
    .filter(opt => opt && typeof opt === 'string')
    .sort()
    .join('+');
}

/**
 * Check if a value is a valid pattern value (combination of allowed options)
 * @param {string} value - Value to check
 * @param {string[]} allowedOptions - Array of valid options
 * @returns {boolean} True if value is a valid pattern combination
 * @example
 * isPatternValue("lines+markers", ["lines", "markers", "text"]) // true
 * isPatternValue("lines", ["lines", "markers"]) // true
 * isPatternValue("invalid", ["lines", "markers"]) // false
 */
export function isPatternValue(value, allowedOptions) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  if (!Array.isArray(allowedOptions) || allowedOptions.length === 0) {
    return false;
  }

  const parts = parsePatternValue(value);

  // Empty is valid (nothing selected)
  if (parts.length === 0) {
    return true;
  }

  // All parts must be in allowed options
  return parts.every(part => allowedOptions.includes(part));
}

/**
 * Check if a value is from the enum set
 * @param {string} value - Value to check
 * @param {string[]} enumOptions - Array of enum values
 * @returns {boolean} True if value is in enum set
 * @example
 * isEnumValue("none", ["none", "skip"]) // true
 * isEnumValue("lines", ["none", "skip"]) // false
 */
export function isEnumValue(value, enumOptions) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  if (!Array.isArray(enumOptions) || enumOptions.length === 0) {
    return false;
  }

  return enumOptions.includes(value);
}

/**
 * Extract allowed options from a pattern regex
 * Parses patterns like: ^(lines|markers|text)(\\+(lines|markers|text))*$
 * @param {string} pattern - Regex pattern string
 * @returns {string[]} Array of allowed options
 * @example
 * extractPatternOptions("^(lines|markers|text)(\\+(lines|markers|text))*$")
 * // ["lines", "markers", "text"]
 */
export function extractPatternOptions(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return [];
  }

  // Match the first group: ^(option1|option2|option3)
  const match = pattern.match(/^\^?\(([^)]+)\)/);

  if (!match || !match[1]) {
    return [];
  }

  // Split by | and clean up
  return match[1]
    .split('|')
    .map(opt => opt.trim())
    .filter(opt => opt.length > 0);
}
