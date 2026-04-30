/**
 * Query string patterns used in Visivo schemas.
 *
 * Mirrors the canonical grammar in
 * `visivo/visivo/query/patterns.py:QUERY_STRING_VALUE_PATTERN` and the
 * vendored JSON-schema definition in
 * `visivo/visivo/schema/<trace>.schema.json#/$defs/query-string`.
 *
 * Supported forms (single source of truth — every consumer in the
 * viewer should route through `parseQueryString` rather than
 * hand-rolling a regex):
 *
 *     ?{ expr }                   whole array (existing)
 *     ?{ expr }[N]                single positive or negative index (scalar)
 *     ?{ expr }[a:b]              slice (sub-array)
 *     ?{ expr }[a:b:c]            strided slice
 *     ?{ expr }[a,b,c]            multi-index pick
 *     query( ... )                query() function form (no slice support)
 *     column( ... )               column reference
 *     column( ... )[n]            indexed column reference
 *
 * The slice suffix is captured by name so callers can split the body
 * from the slice without re-parsing.
 */

// Bracket form `?{ expr }` plus optional indexing/slicing suffix. Body
// uses non-greedy matching so a trailing [...] is left for the slice
// group rather than absorbed.
export const QUERY_BRACKET_PATTERN =
  /^\?\{\s*(?<body>.+?)\s*\}(?<slice>\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\])?\s*$/;

// Pattern for query(...) function syntax - with capture group for content extraction
export const QUERY_FUNCTION_PATTERN = /^query\((.*)\)$/;

// Pattern for column(...) or column(...)[n] syntax
export const QUERY_COLUMN_PATTERN = /^column\(.*\)(?:\[-?\d+\])?$/;

// Slice-only pattern (no surrounding ?{...}). Useful for validating a
// raw slice expression like "[0]" / "[1:5]" coming from the SliceMenu.
export const SLICE_PATTERN =
  /^\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\]$/;

// All patterns for simple match testing (no capture groups needed)
const QUERY_STRING_PATTERNS = [QUERY_BRACKET_PATTERN, QUERY_FUNCTION_PATTERN, QUERY_COLUMN_PATTERN];

/**
 * Check if a value is a query-string value (any supported form).
 *
 * @param {any} val - The value to check
 * @returns {boolean} True if the value matches any query-string pattern
 */
export function isQueryStringValue(val) {
  if (typeof val !== 'string') return false;
  return QUERY_STRING_PATTERNS.some(pattern => pattern.test(val));
}

/**
 * Split a `?{ body }[slice]` query-string value into its components.
 *
 * Returns null if `value` is not a `?{...}` query string. For values
 * with no slice suffix, `slice` is null. The body is returned without
 * surrounding whitespace and without `?{` / `}` markers.
 *
 * Use `serializeQueryString` for the inverse.
 *
 * @param {any} value
 * @returns {{ body: string, slice: string|null } | null}
 */
export function parseQueryString(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(QUERY_BRACKET_PATTERN);
  if (!match) return null;
  return {
    body: match.groups.body,
    slice: match.groups.slice ?? null,
  };
}

/**
 * Serialize a `{body, slice}` shape back into the canonical
 * `?{body}[slice]` form. The slice (if any) is appended OUTSIDE the
 * `?{}` wrap so the server-side runtime sees the slice as separate
 * metadata rather than literal SQL text.
 *
 * @param {{ body?: string, slice?: string|null }} parts
 * @returns {string}
 */
export function serializeQueryString({ body, slice } = {}) {
  if (!body) return '';
  const wrapped = `?{${body}}`;
  if (!slice) return wrapped;
  return `${wrapped}${slice}`;
}

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
