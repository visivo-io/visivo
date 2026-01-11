/**
 * Query string patterns used in Visivo schemas
 *
 * These patterns match the various query-string syntaxes:
 * - ?{column} - bracket syntax
 * - query(...) - function syntax
 * - column(...) or column(...)[n] - column reference syntax
 */

// Pattern for ?{...} bracket syntax - with capture group for content extraction
export const QUERY_BRACKET_PATTERN = /^\?\{(.*)\}$/;

// Pattern for query(...) function syntax - with capture group for content extraction
export const QUERY_FUNCTION_PATTERN = /^query\((.*)\)$/;

// Pattern for column(...) or column(...)[n] syntax
export const QUERY_COLUMN_PATTERN = /^column\(.*\)(?:\[-?\d+\])?$/;

// All patterns for simple match testing (no capture groups needed)
const QUERY_STRING_PATTERNS = [QUERY_BRACKET_PATTERN, QUERY_FUNCTION_PATTERN, QUERY_COLUMN_PATTERN];

/**
 * Check if a value is a query-string value
 * @param {any} val - The value to check
 * @returns {boolean} True if the value matches any query-string pattern
 */
export function isQueryStringValue(val) {
  if (typeof val !== 'string') return false;
  return QUERY_STRING_PATTERNS.some(pattern => pattern.test(val));
}

export class QueryString {
  // Pattern with named capture group for getValue() extraction
  static QUERY_STRING_VALUE_PATTERN = /^\?\{\s*(?<query_string>.+)\s*\}\s*$/;

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }

  getValue() {
    const match = this.value.match(QueryString.QUERY_STRING_VALUE_PATTERN);
    return match?.groups?.query_string?.trim() ?? null;
  }

  static isQueryString(obj) {
    return (
      obj instanceof QueryString ||
      (typeof obj === 'string' && QueryString.QUERY_STRING_VALUE_PATTERN.test(obj))
    );
  }
}
