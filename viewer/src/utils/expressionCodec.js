/**
 * expressionCodec — the single owner of the `?{ }` wrapper grammar.
 *
 * Every viewer surface that turns a user gesture (a dropped column, a picked
 * ref, a typed expression, a sort direction) into a stored expression value
 * must go through `encodeQueryString`, and every surface that pulls a stored
 * value apart for editing must go through `decodeQueryString`. Ad-hoc
 * `` `?{${body}}` `` template literals are how M6/M24 happened: one surface
 * wrapped, another didn't, a third wrapped what was already wrapped.
 *
 * ## The grammar
 *
 * Mirrors `visivo/query/patterns.py:QUERY_STRING_VALUE_PATTERN` and the
 * `$defs/query-string` definition in the vendored trace schemas:
 *
 *     ?{ expr }                   whole array
 *     ?{ expr }[N]                single positive or negative index (scalar)
 *     ?{ expr }[a:b]              slice (sub-array)
 *     ?{ expr }[a:b:c]            strided slice
 *     ?{ expr }[a,b,c]            multi-index pick
 *     query( ... )                legacy function form (no slice support)
 *     column( ... )               legacy column reference
 *     column( ... )[n]            legacy indexed column reference
 *
 * The body itself is SQL that may embed context refs (`${ref(model).column}`,
 * `${ref(metric)}`, `${ref(input).value}`); the codec is deliberately blind to
 * the body's contents — it only owns the wrapper and the slice suffix.
 *
 * ## The invariant
 *
 * `encodeQueryString(decodeQueryString(v))` is IDEMPOTENT: applying it twice
 * gives the same string as applying it once, for every value shape the app can
 * produce — bare bodies, already-wrapped values, doubly-wrapped values, values
 * carrying a slice, legacy forms, malformed wrappers, and empty/blank input.
 * That is the property that makes "the UI wrote YAML the parser rejects"
 * unrepresentable, so it is tested as a property over a table of inputs rather
 * than example-by-example.
 *
 * `canonicalizeQueryString` is that composition, and is what save paths should
 * call.
 *
 * ## Totality
 *
 * The codec is TOTAL and NON-DESTRUCTIVE. A value it cannot parse as a wrapper
 * but which is plainly wrapper-SHAPED (`?{}`, `?{x}[a]`, `?{unbalanced`) is
 * reported as `malformed` and handed back byte-identical rather than wrapped a
 * second time. Wrapping an unparseable value is how a LOUD parser rejection
 * turns into a silently-accepted `?{?{ ... }}` that nests one layer deeper on
 * every subsequent save — M24, arriving through the back door.
 */

// ── Grammar ────────────────────────────────────────────────────────────────

// The PARSER's grammar, mirrored from
// `visivo/query/patterns.py:QUERY_STRING_VALUE_PATTERN`. `.` excludes newlines
// in both languages, so a body carrying an INTERIOR newline is NOT a value the
// backend can read: `QueryString.get_value()` returns None for it and the
// interaction pipeline then fails with an opaque TypeError. Use this to answer
// "would the parser accept what we are about to store" — never to unwrap.
export const PARSER_QUERY_STRING_PATTERN =
  /^\?\{\s*(?<body>.+?)\s*\}(?<slice>\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\])?\s*$/;

// Bracket form `?{ expr }` plus optional indexing/slicing suffix. Body uses
// non-greedy matching so a trailing [...] is left for the slice group rather
// than absorbed.
//
// Deliberately WIDER than `PARSER_QUERY_STRING_PATTERN`: `[\s\S]` where the
// parser has `.`. A stored multi-line value must be recognised as the wrapper
// it is and unwrapped for editing; treating it as a bare body would wrap it a
// second time on the next save, and again on the one after that. Whether the
// result is a value the parser accepts is a separate question, answered by
// `isParserReadableQueryString`.
export const QUERY_BRACKET_PATTERN =
  /^\?\{\s*(?<body>[\s\S]+?)\s*\}(?<slice>\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\])?\s*$/;

// An empty wrapper. `?{}` and `?{   }` carry no expression at all: the parser
// rejects them outright (the body group needs at least one character), so they
// decode as EMPTY and the interaction they belong to is dropped rather than
// stored.
const EMPTY_WRAPPER_PATTERN = /^\?\{\s*\}$/;

// Legacy `query(...)` function syntax — with a capture group for the content.
export const QUERY_FUNCTION_PATTERN = /^query\((.*)\)$/;

// Legacy `column(...)` / `column(...)[n]` syntax.
export const QUERY_COLUMN_PATTERN = /^column\(.*\)(?:\[-?\d+\])?$/;

// Slice-only pattern (no surrounding `?{}`). Useful for validating a raw slice
// expression like "[0]" / "[1:5]" coming from the SliceMenu.
export const SLICE_PATTERN =
  /^\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\]$/;

// Eval strings (`>{ ... }`) are a DIFFERENT grammar — `EvalString` in
// `visivo/models/base/eval_string.py`, used by Test.assertions and Alert.if.
// They never belong in a query-string slot, so the codec recognises them only
// in order to refuse to rewrite them into `?{>{ ... }}`.
export const EVAL_STRING_PATTERN = /^>\{[\s\S]*\}$/;

/**
 * The form a decoded value arrived in.
 *
 *   'empty'   — null/undefined/non-string/blank.
 *   'query'   — a well-formed `?{ ... }` (possibly sliced) value.
 *   'eval'    — a `>{ ... }` eval string: a different grammar entirely, passed
 *               through untouched rather than wrapped into nonsense.
 *   'legacy'  — a `query(...)` / `column(...)` form. Kept as an opaque body:
 *               whether these should still be accepted is an open product
 *               question, so the codec neither rewrites nor rejects them here.
 *   'malformed' — wrapper-SHAPED but not parseable as one: `?{x}[a]`,
 *               `?{a}[0][1]`, `?{unbalanced`. The body is the whole value,
 *               verbatim, and `encodeQueryString` hands it back untouched.
 *               These values are rejected by the QueryString validator today;
 *               wrapping them again would make them *pass* validation as
 *               `?{?{ ... }}` and quietly nest one layer deeper per save.
 *   'bare'    — anything else: a body the user typed with no wrapper, which
 *               includes a plain context string like `${ref(orders).month}`.
 *               This is the M6 case — the value the parser would reject.
 */
export const EXPRESSION_FORMS = Object.freeze({
  EMPTY: 'empty',
  QUERY: 'query',
  EVAL: 'eval',
  LEGACY: 'legacy',
  MALFORMED: 'malformed',
  BARE: 'bare',
});

/** Strip one `?{ }` layer, returning `{body, slice}` or null. */
function unwrapOnce(value) {
  const match = value.match(QUERY_BRACKET_PATTERN);
  if (!match) return null;
  return { body: match.groups.body, slice: match.groups.slice ?? null };
}

/**
 * Pull a stored expression value apart into its editable pieces.
 *
 * Unwraps NESTED wrappers to a fixpoint, so a value that a double-wrapping
 * write already corrupted (`?{?{ x }}` — blank charts today) decodes to the
 * body the author meant and reports `repaired: true`.
 *
 * @param {any} value
 * @returns {{ body: string, slice: string|null, form: string, repaired: boolean }}
 */
export function decodeQueryString(value) {
  if (typeof value !== 'string') {
    return { body: '', slice: null, form: EXPRESSION_FORMS.EMPTY, repaired: false };
  }
  const trimmed = value.trim();
  if (!trimmed || EMPTY_WRAPPER_PATTERN.test(trimmed)) {
    return { body: '', slice: null, form: EXPRESSION_FORMS.EMPTY, repaired: false };
  }

  let unwrapped = unwrapOnce(trimmed);
  if (!unwrapped) {
    let form = EXPRESSION_FORMS.BARE;
    if (EVAL_STRING_PATTERN.test(trimmed)) {
      form = EXPRESSION_FORMS.EVAL;
    } else if (QUERY_FUNCTION_PATTERN.test(trimmed) || QUERY_COLUMN_PATTERN.test(trimmed)) {
      form = EXPRESSION_FORMS.LEGACY;
    } else if (trimmed.startsWith('?{')) {
      // Wrapper-shaped but unparseable. Not a bare body — wrapping it would
      // nest, and nesting is the failure this module exists to prevent.
      form = EXPRESSION_FORMS.MALFORMED;
    }
    return { body: trimmed, slice: null, form, repaired: false };
  }

  let { body, slice } = unwrapped;
  let layers = 1;
  // Fixpoint: `?{?{ x }}` and deeper. A slice found on an INNER layer is
  // promoted only when the outer layer carried none — the outermost slice is
  // the one the SliceMenu last wrote, so it wins.
  while ((unwrapped = unwrapOnce(body))) {
    body = unwrapped.body;
    slice = slice ?? unwrapped.slice;
    layers += 1;
    // Defensive: `unwrapOnce` always shrinks the string (it removes at least
    // `?{` and `}`), so this cannot spin — but never trust that in a loop that
    // runs on user input.
    if (layers > 32) break;
  }

  // `?{?{}}` and deeper: an empty wrapper wrapped again. There is no expression
  // in there at any depth, so it is the same nothing as `?{}` — and reporting
  // it as a QUERY whose body is the literal text `?{}` would put that text back
  // out on the next save.
  if (!body.trim() || EMPTY_WRAPPER_PATTERN.test(body)) {
    return { body: '', slice: null, form: EXPRESSION_FORMS.EMPTY, repaired: false };
  }

  return { body, slice, form: EXPRESSION_FORMS.QUERY, repaired: layers > 1 };
}

/**
 * Serialize a `{body, slice}` shape into the canonical `?{body}[slice]` form.
 *
 * IDEMPOTENT: a body that already carries its own wrapper (because a caller
 * handed back a whole stored value, or the user typed the documented
 * `?{ ${ref(m).col} }` into a field the editor wraps for them) is unwrapped
 * before being wrapped once. An empty body serializes to `''` — an interaction
 * with no expression is dropped, not stored as `?{}`.
 *
 * The slice is appended OUTSIDE the `?{}` wrap so the server-side runtime sees
 * it as metadata rather than literal SQL text.
 *
 * @param {{ body?: string, slice?: string|null }} parts
 * @returns {string}
 */
export function encodeQueryString({ body, slice } = {}) {
  const decoded = decodeQueryString(body);
  if (!decoded.body) return '';
  // A `>{ ... }` eval string belongs to a different grammar. Wrapping it would
  // manufacture `?{>{ ... }}` — syntactically a query string, semantically
  // garbage. Hand it back unchanged and let validation speak.
  //
  // Same rule, same reason, for a MALFORMED wrapper: `?{}` / `?{x}[a]` /
  // `?{unbalanced` are values the QueryString validator refuses TODAY. Wrapping
  // one produces `?{?{x}[a]}`, which the validator ACCEPTS and whose body then
  // reaches SQL as literal `?{x}[a]` — a loud rejection traded for silent
  // nonsense that nests one layer deeper on every save.
  if (
    decoded.form === EXPRESSION_FORMS.EVAL ||
    decoded.form === EXPRESSION_FORMS.MALFORMED
  ) {
    return decoded.body;
  }
  // A slice recovered from inside `body` survives only when the caller passed
  // none of its own (`undefined`/`null`); a caller that passes a slice is
  // choosing it, so theirs wins.
  const effectiveSlice = slice ?? decoded.slice;
  const wrapped = `?{${decoded.body}}`;
  return effectiveSlice ? `${wrapped}${effectiveSlice}` : wrapped;
}

/**
 * `encode ∘ decode` — take any expression value the app can produce and return
 * the canonical stored form. This is what save paths call: it wraps a bare
 * body (M6), leaves an already-canonical value byte-identical, and repairs a
 * double-wrapped one (M24).
 *
 * @param {any} value
 * @returns {string}
 */
export function canonicalizeQueryString(value) {
  const decoded = decodeQueryString(value);
  return encodeQueryString({ body: decoded.body, slice: decoded.slice });
}

/**
 * Would the BACKEND be able to read this value?
 *
 * The exact mirror of `QueryString.validate_and_create`: the pattern must match
 * AND the body must be non-blank. Note that this is a NARROWER question than
 * `isQueryStringValue`, which asks only whether the value carries a wrapper of
 * some kind — `?{}` and any body with an interior newline carry one and are
 * still values `get_value()` cannot read.
 *
 * So this is the predicate a save path needs: not "does it look wrapped" but
 * "will the parser get an expression out of it". A `>{ }` eval string is not a
 * query string at all, so it answers false.
 *
 * @param {any} value
 * @returns {boolean}
 */
export function isParserReadableQueryString(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(PARSER_QUERY_STRING_PATTERN);
  // `?{ }` matches the pattern — the body group swallows the space — but
  // `get_value()` hands back the empty string, which is the same empty
  // expression as `?{}` by a different spelling. The Python gate applies the
  // same `.strip()` check.
  return match !== null && match.groups.body.trim().length > 0;
}

/**
 * Check if a value is a query-string value (any supported form).
 *
 * @param {any} val
 * @returns {boolean}
 */
export function isQueryStringValue(val) {
  if (typeof val !== 'string') return false;
  return (
    QUERY_BRACKET_PATTERN.test(val) ||
    QUERY_FUNCTION_PATTERN.test(val) ||
    QUERY_COLUMN_PATTERN.test(val)
  );
}

/**
 * Split a `?{ body }[slice]` value into its components, or null when `value`
 * is not a `?{...}` query string.
 *
 * Unlike `decodeQueryString` this is a STRICT single-layer parse: it is the
 * shape editors use to decide "is there a wrapper here at all". Prefer
 * `decodeQueryString` on save paths.
 *
 * @param {any} value
 * @returns {{ body: string, slice: string|null } | null}
 */
export function parseQueryString(value) {
  if (typeof value !== 'string') return null;
  return unwrapOnce(value);
}
