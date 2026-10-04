/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` example strings, not template-literal mistakes */
/**
 * Help text for the three insight interaction fields — filter, split, sort.
 *
 * ## Why this file exists
 *
 * The sort field used to advertise the literal example `"date DESC"`. That is
 * not a value this grammar accepts: `InsightInteraction.sort` is a
 * `QueryString`, so the parser rejects anything that is not `?{ ... }`, and
 * even wrapped, a BARE identifier like `date` dies at run time with a binder
 * error because the semantic layer resolves refs, not loose column names. The
 * UI was teaching a form the product rejects, and users copied it.
 *
 * The fix is not a better hand-written string — a hand-written string drifts
 * from the model the moment someone edits `visivo/models/interaction.py`. Every
 * `description` and `example` below is COPIED VERBATIM from the Pydantic model,
 * and `interactionHelp.test.js` re-derives all six strings from the vendored
 * `visivo_project_schema.json` (`$defs/InsightInteraction`) and fails if any of
 * them has drifted. `tests/models/test_interaction_help_parity.py` closes the
 * loop on the Python side, checking this file against
 * `InsightInteraction.model_fields` directly — so a stale vendored schema
 * cannot hide a drift either.
 *
 * Regenerate the vendored schema with `python -m visivo.generate_project_schema_json`
 * and re-copy it here when the models change; if these strings then need
 * updating, the two tests will say so by name.
 *
 * ## The `?{ }` wrapper
 *
 * `example` holds the expression BODY, not the stored YAML value: the editors
 * wrap what the user types via `expressionCodec.encodeQueryString`, so showing
 * `?{ ... }` in the hint would teach people to type a wrapper that then gets
 * wrapped again. `yamlExample` keeps the full stored form for anywhere that
 * documents the file rather than the field.
 */

import {
  EXPRESSION_FORMS,
  decodeQueryString,
  encodeQueryString,
  isParserReadableQueryString,
} from '../utils/expressionCodec';

export const INTERACTION_TYPES = ['filter', 'split', 'sort'];

export const INTERACTION_HELP = Object.freeze({
  filter: Object.freeze({
    label: 'Filter',
    // InsightInteraction.filter — Field(description=...)
    description:
      'Boolean expression evaluated per row in the viewer; only rows where it is true are kept.',
    // From the InsightInteraction docstring's YAML example block.
    yamlExample: '?{ ${ref(orders).region} = ${ref(region-input).value} }',
    example: '${ref(orders).region} = ${ref(region-input).value}',
  }),
  split: Object.freeze({
    label: 'Split',
    // InsightInteraction.split — Field(description=...)
    description:
      'Column or expression whose distinct values break the insight into multiple plotly series.',
    yamlExample: '?{ ${ref(orders).product_line} }',
    example: '${ref(orders).product_line}',
  }),
  sort: Object.freeze({
    label: 'Sort',
    // InsightInteraction.sort — Field(description=...)
    description:
      'Column or expression to sort rows by; append `ASC` or `DESC` to control direction.',
    yamlExample: '?{ ${ref(orders).month} ASC }',
    example: '${ref(orders).month} ASC',
  }),
});

/**
 * The model's descriptions are markdown (they are published to the docs site),
 * so `sort`'s reads "append `ASC` or `DESC`". A helper line is plain text in a
 * plain <p>; leaving the backticks in shows them literally. Strip the code
 * fences for display only — `INTERACTION_HELP` keeps the model's exact bytes,
 * which is what the two parity tests pin.
 */
function asPlainText(markdown) {
  return markdown.replace(/`([^`]+)`/g, '$1');
}

/**
 * The hint shown under an interaction field: what the field means, then
 * anything the surface wants to add, and last — so it is the line's parting
 * thought and nothing runs into it — an example that works if you copy it.
 *
 * @param {string} type - 'filter' | 'split' | 'sort'
 * @param {string} [extra] - surface-specific guidance (e.g. the @-insert hint)
 * @returns {string} '' for an unknown type, so callers can render it blind.
 */
export function interactionHelpText(type, extra = '') {
  const entry = INTERACTION_HELP[type];
  if (!entry) return '';
  const middle = extra ? `${extra} ` : '';
  return `${asPlainText(entry.description)} ${middle}For example: ${entry.example}`;
}

/**
 * The example alone, for a narrow surface (the Explorer Build rail's one-line
 * interaction rows) where the full sentence would wrap three times. Same
 * source, less of it.
 *
 * @param {string} type - 'filter' | 'split' | 'sort'
 * @returns {string} '' for an unknown type.
 */
export function interactionExampleHint(type) {
  const entry = INTERACTION_HELP[type];
  if (!entry) return '';
  return `e.g. ${entry.example}`;
}

/**
 * Why this interaction body cannot be stored, or `null` when it can.
 *
 * `encodeQueryString` is total: it never mangles a value it does not
 * understand, which means it can hand back something the `QueryString`
 * validator will refuse — a `>{ }` eval string, a malformed wrapper, a body
 * with an interior newline. Wrapping those anyway is not an option (that is how
 * `?{?{ ... }}` gets manufactured), so the editor has to SAY so, at the field,
 * while the author is looking at it. The alternative is a round trip to a
 * server-side validation error, which is the M6 experience with extra steps.
 *
 * @param {string} body - the expression body as typed (no wrapper)
 * @param {string|null} [slice] - the slice suffix held aside by the editor
 * @returns {string|null} a message to show under the field, or null
 */
export function interactionValueProblem(body, slice = null) {
  const stored = encodeQueryString({ body, slice });
  // Empty is not a problem — an interaction with no expression is dropped.
  if (!stored || isParserReadableQueryString(stored)) return null;

  const { form } = decodeQueryString(body);
  if (form === EXPRESSION_FORMS.EVAL) {
    return 'Eval strings (>{ ... }) belong to tests and alerts. Use a ?{ } expression here.';
  }
  if (/[\r\n]/.test(String(body))) {
    return 'An interaction expression must be a single line.';
  }
  return 'This is not an expression the parser can read. Check the ?{ } wrapper and any [slice] suffix.';
}

/**
 * The interaction type options a `<Select>` renders, with their help text
 * attached — the shape both editors already expected, now sourced from the
 * model instead of retyped in each of them.
 */
export const INTERACTION_TYPE_OPTIONS = INTERACTION_TYPES.map(value => ({
  value,
  label: INTERACTION_HELP[value].label,
  helperText: interactionHelpText(value),
}));
