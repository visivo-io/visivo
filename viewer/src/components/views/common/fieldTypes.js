/**
 * fieldTypes — the one place that says how each field may be edited.
 *
 * WHY THIS EXISTS
 *
 * The rules for authoring a field are real and enforced, but they live in three
 * places the viewer can't read: Pydantic types (`QueryOrStringField` vs plain
 * `str`), Python validators (`sql_model.py`'s nested-ref prohibition,
 * `relation.py`'s two-model minimum, `accessor_validator.py`'s input accessors),
 * and a scatter of hardcoded literals across components. Every surface has been
 * re-deriving them, differently, and getting them subtly wrong.
 *
 * This is the schema's understudy. It is deliberately JavaScript rather than a
 * `$defs` change: the shape below maps 1:1 onto a future schema annotation, so
 * once we trust these entries they can move into `visivo/models/` and this file
 * becomes a thin reader. Until then, changing an authoring rule means changing
 * Python AND this file — the tests at the bottom of `fieldTypes.test.js` pin the
 * pairs that are checkable so they can't drift silently.
 *
 * TWO INDEPENDENT AXES
 *
 * The naive reading is that a field's grammar tells you its editor. It doesn't.
 * `?{ }` is a type DISCRIMINATOR — it exists only where a field's Pydantic type
 * is a union of literal-or-SQL, to say which branch a value is on. A field that
 * can only ever hold SQL (`metric.expression`, `relation.condition`) carries no
 * wrapper, and that says nothing about how it should be edited. So `editor`
 * (which control) and `refKinds`/`bareRefs`/`minRefs` (what's legal inside) are
 * declared separately.
 */

/**
 * The control a field is authored through.
 *
 * - `object-ref`   one whole-object pointer, `ref(name)`. Not an expression.
 * - `query-string` `?{ ... }` with an optional trailing `[index]`.
 * - `context-sql`  raw SQL that may contain `${ref(...)}` context strings.
 * - `plain-sql`    raw SQL where refs are a hard validation error.
 */
export const EDITORS = {
  OBJECT_REF: 'object-ref',
  QUERY_STRING: 'query-string',
  CONTEXT_SQL: 'context-sql',
  PLAIN_SQL: 'plain-sql',
};

/**
 * An input's "property" is not a column — it's one of a fixed set of accessors,
 * and which are legal depends on the input's type. Mirrors
 * `visivo/query/patterns.py`'s SINGLE_SELECT_ACCESSORS / MULTI_SELECT_ACCESSORS,
 * enforced by `accessor_validator.validate_input_accessor`.
 */
export const INPUT_ACCESSORS = {
  'single-select': ['value'],
  'multi-select': ['values', 'min', 'max', 'first', 'last'],
};

/** Every accessor, for the "input type unknown yet" case (fail open). */
export const ALL_INPUT_ACCESSORS = ['value', 'values', 'min', 'max', 'first', 'last'];

// The vocabulary shared by every `?{ }` slot: a model column, a semantic-layer
// field, or an input's runtime value. Named once so props and interactions
// can't drift apart — they are the same authoring surface.
const QUERY_STRING_REF_KINDS = ['model', 'dimension', 'metric', 'input'];

const DEFAULTS = {
  refKinds: [],
  bareRefs: false,
  minRefs: 0,
  maxRefs: null,
  slice: false,
};

/**
 * Keyed `<objectType>.<field>`. `field` is the schema field name, except for
 * `props`, which stands for the whole Plotly prop tree — every leaf under it
 * shares one rule.
 */
const FIELD_TYPES = {
  // ── Whole-object pointers ────────────────────────────────────────────────
  // Not expressions at all: exactly one object, chosen or dropped, never typed.
  'item.chart': {
    editor: EDITORS.OBJECT_REF,
    refKinds: ['chart', 'table', 'markdown', 'input'],
    minRefs: 1,
    maxRefs: 1,
    why: 'An item holds exactly one leaf object.',
  },
  'table.columns': {
    editor: EDITORS.CONTEXT_SQL,
    // A table column may render a whole insight, unlike every other expression
    // surface — the only place `insight` is a legal ref.
    refKinds: ['model', 'insight', 'dimension', 'metric'],
    bareRefs: true,
    why: 'A table column is an expression, or a whole insight rendered in the cell.',
  },
  'input.options': {
    editor: EDITORS.QUERY_STRING,
    // An input's options come from a model query. It cannot reference another
    // input (that would be circular) or a metric (an aggregate is not a list).
    refKinds: ['model'],
    bareRefs: false,
    why: 'The option list is a query against a model.',
  },
  'model.source': {
    editor: EDITORS.OBJECT_REF,
    refKinds: ['source'],
    minRefs: 1,
    maxRefs: 1,
    why: 'A model reads from exactly one source.',
  },

  // ── Query strings (`?{ }`) ───────────────────────────────────────────────
  'insight.props': {
    editor: EDITORS.QUERY_STRING,
    refKinds: QUERY_STRING_REF_KINDS,
    bareRefs: true,
    slice: true,
    why: 'A Plotly prop may be a literal or SQL; `?{ }` says which, and a trailing [index] slices the result.',
  },
  'interaction.filter': {
    editor: EDITORS.QUERY_STRING,
    refKinds: QUERY_STRING_REF_KINDS,
    bareRefs: true,
    slice: true,
    why: 'Boolean expression evaluated per row in the viewer.',
  },
  'interaction.split': {
    editor: EDITORS.QUERY_STRING,
    refKinds: QUERY_STRING_REF_KINDS,
    bareRefs: true,
    slice: true,
    why: 'Column or expression whose distinct values break the insight into series.',
  },
  'interaction.sort': {
    editor: EDITORS.QUERY_STRING,
    refKinds: QUERY_STRING_REF_KINDS,
    bareRefs: true,
    slice: true,
    why: 'Column or expression to sort rows by.',
  },

  // ── SQL carrying context strings ─────────────────────────────────────────
  'relation.condition': {
    editor: EDITORS.CONTEXT_SQL,
    // Only models. A dimension or metric ref would resolve to an aggregate or a
    // derived column, neither of which is a join key. NOTE: `relation.py`
    // documents "Cannot join on metrics (aggregated values)" in the field
    // description but does NOT enforce it — this list is the only thing
    // stopping a user from authoring one.
    refKinds: ['model'],
    // A bare `${ref(orders)}` names a table, not a column; it cannot be one
    // side of an `=`. Every ref here must carry a property.
    bareRefs: false,
    // Enforced by `relation.validate_condition_has_models`.
    minRefs: 2,
    why: 'A join predicate between two models; every ref names a column on one of them.',
  },
  'metric.expression': {
    editor: EDITORS.CONTEXT_SQL,
    refKinds: ['model', 'metric', 'dimension'],
    // Unlike a relation condition, a BARE ref is meaningful and common here:
    // `${ref(other_metric)}` composes metrics. The field resolver handles it
    // explicitly ("when field name is none, the name is a metric or dimension").
    bareRefs: true,
    // A metric reaches a source two ways: nesting it inside a model, or naming
    // one in the expression. At PROJECT level only the second is available, so
    // a ref is not a nicety — `count(*)` here can never resolve, and the
    // project stops parsing (`does not tie back to any source`). See
    // NESTED_OVERRIDES: nesting satisfies the same requirement structurally.
    minRefs: 1,
    why: 'An aggregate expression that may compose other metrics and model columns.',
  },
  'dimension.expression': {
    editor: EDITORS.CONTEXT_SQL,
    refKinds: ['model', 'dimension'],
    bareRefs: true,
    minRefs: 1,
    why: 'A row-level expression over model columns and other dimensions.',
  },
};

/**
 * Nested (model-scoped) metrics and dimensions are a DIFFERENT GRAMMAR under the
 * same field name — the only thing distinguishing them is where they sit in the
 * YAML. `sql_model.py`'s `set_parent_names_on_nested_objects` raises on any ref:
 *
 *   Nested metric '…' cannot use ref() syntax in expression. Nested metrics can
 *   only reference fields from their parent model directly.
 *
 * The Explorer's "computed column" is exactly this case — it promotes to a
 * metric/dimension with a `parentModel`, which `project_writer._new` nests under
 * `model.metrics` / `model.dimensions`.
 */
const NESTED_OVERRIDES = {
  'metric.expression': {
    editor: EDITORS.PLAIN_SQL,
    refKinds: [],
    bareRefs: false,
    maxRefs: 0,
    // Explicitly back to 0, undoing the project-level `minRefs: 1`: nesting IS
    // the tie to a source here, so `count(*)` is not just legal, it is the
    // normal shape. Without this reset the merge would demand a ref the other
    // rule forbids — an unsatisfiable field.
    minRefs: 0,
    why: 'Nested in a model: plain SQL over the parent model’s columns. Refs are a save-time error.',
  },
  'dimension.expression': {
    editor: EDITORS.PLAIN_SQL,
    refKinds: [],
    bareRefs: false,
    maxRefs: 0,
    minRefs: 0,
    why: 'Nested in a model: plain SQL over the parent model’s columns. Refs are a save-time error.',
  },
};

/**
 * Resolve how a field may be edited.
 *
 * @param {string} objectType - e.g. 'relation', 'metric', 'insight'
 * @param {string} field - schema field name; 'props' covers the whole prop tree
 * @param {object} [opts]
 * @param {boolean} [opts.nested] - the object is defined UNDER a model
 *   (embedded/model-scoped), which changes metric/dimension to `plain-sql`
 * @returns {object|null} the entry, or null when the field has no declared rule
 */
export function fieldTypeFor(objectType, field, { nested = false } = {}) {
  if (!objectType || !field) return null;
  // A Plotly prop path ('marker.color', 'x') resolves to the shared props rule.
  const key = objectType === 'insight' && field !== 'props' ? 'insight.props' : `${objectType}.${field}`;
  const base = FIELD_TYPES[key];
  if (!base) return null;
  const override = nested ? NESTED_OVERRIDES[key] : null;
  return { key, ...DEFAULTS, ...base, ...override };
}

/**
 * The library types a field's editor may insert or accept on drop.
 *
 * Replaces the per-call-site `allowedTypes` literals. Returns `[]` — no ref
 * affordances at all — for `plain-sql` fields, which is the point: an editor
 * should not offer an insertion the backend will reject on save.
 *
 * @returns {string[]}
 */
export function refKindsFor(objectType, field, opts) {
  return fieldTypeFor(objectType, field, opts)?.refKinds ?? [];
}

/**
 * The accessors legal on an input pill, given the input's type. Falls open to
 * the full set when the type isn't known yet, matching the project's
 * fail-open convention for not-yet-loaded metadata.
 *
 * @param {string} [inputType] - 'single-select' | 'multi-select'
 * @returns {string[]}
 */
export function accessorsForInput(inputType) {
  return INPUT_ACCESSORS[inputType] || ALL_INPUT_ACCESSORS;
}

/** Every declared key, for tests that assert call sites delegate here. */
export const DECLARED_FIELD_KEYS = Object.keys(FIELD_TYPES);

export default fieldTypeFor;
