/**
 * Slot-shape classifier for the SliceMenu / SliceBadge feature.
 *
 * Given a leaf-property JSON schema (post-`oneOf` flattening), returns:
 *
 *   'scalar-only' — branches accept primitives only (no array sibling).
 *                   Default slice on chip drop is `[0]`.
 *
 *   'array-only'  — branches accept array(s) only (no primitive sibling).
 *                   Default is no slice (whole array binds).
 *
 *   'mixed'       — both array and primitive branches present.
 *                   Default is no slice.
 *
 *   'unknown'     — can't determine (missing schema, exotic shape).
 *                   Menu shows everything enabled — safe fallback.
 *
 * Mirrors the Python `_expected_scalar_class` helper in
 * `visivo/visivo/query/insight/prop_type_validator.py` but with the
 * additional array-only / mixed distinction needed by the menu UI.
 *
 * The two helpers stay separate; the Python one drives compile-time
 * type validation, this JS one drives the menu state.
 */

import { resolveRef } from './schemaUtils';

const PRIMITIVE_TYPES = new Set(['number', 'integer', 'string', 'boolean']);

/**
 * Walk one branch and tag what kind of value it accepts.
 *
 * Returns one of: 'primitive', 'array', 'query', 'other'.
 *  - 'primitive' — a scalar primitive (number / integer / string / boolean)
 *    or a $ref to a primitive-flavored def (color, colorscale).
 *  - 'array'     — `{ type: 'array' }`.
 *  - 'query'     — the `query-string` $ref. Doesn't count toward shape
 *    classification; it's an authoring vehicle, not a shape.
 *  - 'other'     — object schemas, oneOf nests, anything else.
 */
function classifyBranch(branch, defs) {
  if (!branch || typeof branch !== 'object') return 'other';

  if (branch.$ref === '#/$defs/query-string') return 'query';

  // A $ref to a primitive-flavored def (color / colorscale / xaxis /
  // yaxis are all string-flavored). Treat as primitive for shape
  // purposes — the user binds a single value to it.
  if (branch.$ref) {
    const resolved = resolveRef(branch.$ref, defs);
    if (resolved) return classifyBranch(resolved, defs);
    return 'other';
  }

  // Bare or compound type
  if (PRIMITIVE_TYPES.has(branch.type)) return 'primitive';
  if (branch.type === 'array') return 'array';

  // enum / const without an explicit type — treat as primitive (it's
  // always one of a fixed list of strings/numbers).
  if (Array.isArray(branch.enum) || branch.const !== undefined) return 'primitive';

  // Pattern with no explicit type → string-shaped
  if (branch.pattern && !branch.type) return 'primitive';

  return 'other';
}

/**
 * Recursively gather the union of all `classifyBranch` results across a
 * (possibly nested) `oneOf`/`anyOf` tree.
 */
function collectShapes(schema, defs, accumulator) {
  if (!schema) return;
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach(b => collectShapes(b, defs, accumulator));
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach(b => collectShapes(b, defs, accumulator));
    return;
  }
  accumulator.add(classifyBranch(schema, defs));
}

/**
 * Classify a property's accepted-shape from its JSON-schema node.
 *
 * @param {object} schema - The leaf property schema (the value of
 *   `properties.<name>` in the trace schema, possibly with oneOf/anyOf
 *   union branches).
 * @param {object} [defs={}] - The trace schema's `$defs` object for
 *   `$ref` resolution. Get it via `getSchemaDefs(traceSchema)` from
 *   `viewer/src/schemas/schemas.js`.
 * @returns {'scalar-only' | 'array-only' | 'mixed' | 'unknown'}
 */
export function getSlotShape(schema, defs = {}) {
  if (!schema || typeof schema !== 'object') return 'unknown';

  const shapes = new Set();
  collectShapes(schema, defs, shapes);

  const hasArray = shapes.has('array');
  const hasPrimitive = shapes.has('primitive');

  if (hasArray && hasPrimitive) return 'mixed';
  if (hasArray) return 'array-only';
  if (hasPrimitive) return 'scalar-only';
  return 'unknown';
}

/**
 * Per-slot menu policy: which slice options are enabled.
 *
 * @param {'scalar-only' | 'array-only' | 'mixed' | 'unknown'} shape
 * @returns {{
 *   first: boolean, last: boolean, atRow: boolean,
 *   range: boolean, all: boolean,
 *   defaultSlice: string | null,
 * }}
 */
export function menuPolicyFor(shape) {
  switch (shape) {
    case 'scalar-only':
      return {
        first: true,
        last: true,
        atRow: true,
        range: false,
        all: false,
        defaultSlice: '[0]',
      };
    case 'array-only':
      return {
        first: false,
        last: false,
        atRow: false,
        range: true,
        all: true,
        defaultSlice: null,
      };
    case 'mixed':
      return {
        first: true,
        last: true,
        atRow: true,
        range: true,
        all: true,
        defaultSlice: null,
      };
    case 'unknown':
    default:
      return {
        first: true,
        last: true,
        atRow: true,
        range: true,
        all: true,
        defaultSlice: null,
      };
  }
}
