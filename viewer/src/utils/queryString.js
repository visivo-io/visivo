/**
 * Query string helpers.
 *
 * The `?{ }` grammar itself now lives in `./expressionCodec` — that module is
 * the single owner of the wrapper, and this one is the compatibility surface
 * plus the slice-presentation helpers (`isScalarSlice`, `describeSlice`) and
 * the legacy `QueryString` class. New code should import from
 * `expressionCodec` directly, and save paths should call
 * `canonicalizeQueryString` rather than hand-rolling a wrap.
 *
 * `serializeQueryString` is re-exported from the codec, so it is IDEMPOTENT:
 * handing it a body that already carries a wrapper no longer produces
 * `?{?{ ... }}` (M24).
 *
 * Mirrors the canonical grammar in
 * `visivo/visivo/query/patterns.py:QUERY_STRING_VALUE_PATTERN` and the
 * vendored JSON-schema definition in
 * `visivo/visivo/schema/<trace>.schema.json#/$defs/query-string`.
 */

import {
  QUERY_BRACKET_PATTERN,
  PARSER_QUERY_STRING_PATTERN,
  QUERY_FUNCTION_PATTERN,
  QUERY_COLUMN_PATTERN,
  SLICE_PATTERN,
  decodeQueryString,
  encodeQueryString,
  canonicalizeQueryString,
  isParserReadableQueryString,
  isQueryStringValue,
  parseQueryString,
} from './expressionCodec';

export {
  QUERY_BRACKET_PATTERN,
  PARSER_QUERY_STRING_PATTERN,
  QUERY_FUNCTION_PATTERN,
  QUERY_COLUMN_PATTERN,
  SLICE_PATTERN,
  decodeQueryString,
  encodeQueryString,
  canonicalizeQueryString,
  isParserReadableQueryString,
  isQueryStringValue,
  parseQueryString,
};

/**
 * Serialize a `{body, slice}` shape back into the canonical
 * `?{body}[slice]` form. Alias of the codec's `encodeQueryString`, kept
 * because six call sites already import this name.
 */
export const serializeQueryString = encodeQueryString;

/**
 * Check whether a slice expression (`"[0]"`, `"[1:5]"`, ...) yields a
 * single value (single-index form). Sub-array slices return false.
 *
 * @param {string|null} slice
 * @returns {boolean}
 */
export function isScalarSlice(slice) {
  if (!slice) return false;
  const inner = slice.trim().slice(1, -1).trim();
  if (!inner) return false;
  if (inner.includes(':') || inner.includes(',')) return false;
  return /^-?\d+$/.test(inner);
}

/**
 * Format a slice expression as a human-readable label for the slice
 * badge.
 *
 *     "[0]"       -> "First (0)"
 *     "[-1]"      -> "Last (-1)"
 *     "[N]"       -> "Row N"
 *     "[a:b]"     -> "Rows a-b"
 *     other       -> the slice expression as-is (e.g. "[a:b:c]" or "[0,2]")
 *     null/empty  -> "All values"
 *
 * @param {string|null} slice
 * @returns {string}
 */
export function describeSlice(slice) {
  if (!slice) return 'All values';
  const inner = slice.trim().slice(1, -1).trim();
  if (inner === '0') return 'First (0)';
  if (inner === '-1') return 'Last (-1)';
  if (/^-?\d+$/.test(inner)) return `Row ${inner}`;
  if (/^-?\d*:-?\d*$/.test(inner)) {
    const [a, b] = inner.split(':');
    return `Rows ${a || '0'}-${b || 'end'}`;
  }
  return slice;
}

export class QueryString {
  // Pattern with named capture group for getValue() extraction.
  // Aligned with QUERY_BRACKET_PATTERN above so a value carrying a
  // slice suffix still resolves its body cleanly.
  static QUERY_STRING_VALUE_PATTERN = QUERY_BRACKET_PATTERN;

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }

  getValue() {
    const parsed = parseQueryString(this.value);
    return parsed ? parsed.body.trim() : null;
  }

  getSlice() {
    const parsed = parseQueryString(this.value);
    return parsed ? parsed.slice : null;
  }

  static isQueryString(obj) {
    return (
      obj instanceof QueryString ||
      (typeof obj === 'string' && QUERY_BRACKET_PATTERN.test(obj))
    );
  }
}
