import { formatRefExpression } from '../../../utils/refString';

/**
 * pillGrammar — the D8/D10 pill state machine (Explore 2.0 Phase 3b,
 * specs/plan/explorer-workspace-unification/06-pill-aggregation-grammar.md
 * §3/§5, research/s5-droppable-retrofit-design.md §3). Generalizes
 * `pivotDraft.js`'s `SINGLE_REF`/`AGG_WRAP` regex pair (the pivot shelf's
 * proven column-drop grammar) with a bare-ref form and a metric/dimension-ref
 * disambiguation the pivot shelf never needed (table-pivot chips are always
 * column drops, never metric-ref drops).
 *
 * Recognized states (each maps 1:1 to a `<FieldPill>` rendering, see
 * `PillMenu.jsx`):
 *
 *   dimension   — a bare column ref, `?{${ref(model).column}}`.
 *   aggregate   — a preset-wrapped column ref, `?{agg(${ref(model).column})}`.
 *   metricRef   — a bare ref whose name resolves to a known Metric, OR a
 *                 `${ref(model).field}` ref whose `field` collides with a
 *                 known Metric's global name (see "global-name-first" below).
 *   dimensionRef — same as metricRef, but for a known Dimension.
 *   custom      — reserved for the Phase 4 custom-aggregation editor's
 *                 committed state; `parse` never produces this today (an
 *                 expression that doesn't match one of the shapes above falls
 *                 to `opaque`, per the "never silently rewrite" rule) —
 *                 `serialize` still handles it (verbatim passthrough) so the
 *                 Phase 4 editor doesn't need a grammar change to adopt it.
 *   opaque      — anything else. Locked, rendered as the raw chip elsewhere
 *                 (PropertyRow's RefTextArea fallback), and NEVER rewritten —
 *                 mirrors `pivotDraft.makeRawValueChip`'s rule.
 *
 * GLOBAL-NAME-FIRST RESOLUTION (the riskiest assumption S5 flagged, verified
 * empirically 2026-07-17 — see s5-droppable-retrofit-design.md's "RESULT"
 * section): the backend's `field_resolver.py:resolve_ref` resolves
 * `${ref(model).field}` by looking up `field` as a GLOBAL Metric/Dimension DAG
 * node FIRST — the ref's stated `model` is only consulted in the fallback
 * "implicit dimension on this model" path, i.e. when `field` does NOT match
 * any project-wide Metric/Dimension name. This means `${ref(orders_q).x}` and
 * `${ref(totally_different_model).x}` resolve IDENTICALLY whenever `x` is a
 * real global Metric/Dimension — silently, even when the stated model differs
 * from the field's true parent (confirmed: this can succeed with
 * wrong-provenance data when the true parent happens to be joined elsewhere
 * in the same query, and fails with an opaque hashed-CTE binder error
 * otherwise — never a "wrong model" error naming the mismatch).
 *
 * `parse` therefore checks candidate field names against the known
 * metric/dimension name lists BEFORE trusting the ref's stated model. When a
 * collision is detected AND the true parent differs from the stated model,
 * the returned state carries `statedModel`/`resolvedParent` so `PillMenu` can
 * render 06 §5's preflight warning ("this field is defined on `model_b`, not
 * `model_a`") — a frontend-only guard, since fixing `resolve_ref` itself is a
 * backend behavior change out of this phase's scope (risk of breaking
 * existing projects that unintentionally rely on today's semantics).
 *
 * Every parsed state carries the original `raw` text. `serialize` is used
 * ONLY when a user takes an explicit action (preset toggle, Remove) — a
 * passive render never calls it, so passive re-parsing can never silently
 * rewrite an expression, even in the collision case above (where a
 * byte-faithful `serialize(parse(x))` round-trip isn't guaranteed once the
 * caller drops the original `raw` and rebuilds a state from scratch).
 */

// The seven presets 06 §7/§8 settled on (the pivot shelf's six + MEDIAN,
// dialect-gated — see `MEDIAN_SUPPORTED_DIALECTS` below). Order matches the
// pill menu's rendering order (06 §4's mock).
export const PRESET_AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'median'];

/**
 * Dialect allowlist for offering MEDIAN in the "Use as" preset menu.
 *
 * HAND-MAINTAINED, never a runtime "did sqlglot throw" probe — S5 ran the
 * repo's actual sqlglot across all 8 supported dialects and found mysql/
 * sqlite both transpile `MEDIAN(x)` into syntactically-plausible but
 * SILENTLY WRONG SQL (`PERCENTILE_CONT(x, 0.5)`) with zero errors or warnings
 * even under `ErrorLevel.WARN`. Mirrors the Python-canonical
 * `visivo/query/sqlglot_utils.py`'s `MEDIAN_SUPPORTED_DIALECTS` — keep the
 * two in sync by hand (same convention as `queryString.js`/`slotShape.js`
 * mirroring other Python-canonical grammars).
 */
export const MEDIAN_SUPPORTED_DIALECTS = new Set([
  'duckdb',
  'snowflake',
  'bigquery',
  'redshift',
  'postgres',
  'clickhouse',
]);

/**
 * Whether the "MEDIAN" preset should be offered for a given source dialect.
 * Fail-OPEN (mirrors `SchemaLeafForm.jsx`'s dialect resolution + the
 * `expressionPreflight`/`expressions.js` fail-open contract): an
 * unresolved/duckdb/null dialect shows the full preset list rather than
 * defensively hiding MEDIAN — DuckDB natively supports it.
 */
export function isMedianSupported(dialect) {
  if (!dialect) return true;
  return MEDIAN_SUPPORTED_DIALECTS.has(String(dialect).toLowerCase());
}

// Reuses pivotDraft's exact anchored single-ref pattern.
const SINGLE_REF = /^\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\.\s*([^}\s]+)\s*\}$/;
// New: a bare ref with no `.field` — only ever a metric/dimension-ref pill.
const BARE_REF = /^\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\}$/;
// Reuses pivotDraft's exact leading-function-call pattern.
const AGG_WRAP = /^\s*(\w+)\s*\(([\s\S]*)\)\s*$/;

const findGlobalField = (name, { metricFields, dimensionFields }) => {
  const metric = (metricFields || []).find(f => f.name === name);
  if (metric) return { kind: 'metricRef', field: metric };
  const dimension = (dimensionFields || []).find(f => f.name === name);
  if (dimension) return { kind: 'dimensionRef', field: dimension };
  return null;
};

/**
 * parse(expr, { metricFields, dimensionFields }) -> pill state
 *
 * @param {string} expr - the raw expression body (no surrounding `?{}`; the
 *   caller — `PropertyRow` — has already stripped that via `parseQueryString`).
 * @param {object} [opts]
 * @param {Array<{name: string, parentModel?: string}>} [opts.metricFields] -
 *   every known Metric, for the global-name-first lookup + "Save as metric"
 *   Phase-4 dedup groundwork. Pure data in, mirrors `pivotDraft`'s
 *   pure-function shape (no store reach-in) — the caller builds this from
 *   `useStore(s => s.metrics)`.
 * @param {Array<{name: string, parentModel?: string}>} [opts.dimensionFields] -
 *   every known Dimension, same shape.
 * @returns {{
 *   kind: 'dimension'|'aggregate'|'metricRef'|'dimensionRef'|'custom'|'opaque',
 *   ref?: string, column?: string, agg?: string, raw: string,
 *   statedModel?: string, resolvedParent?: string,
 * }}
 */
export function parse(expr, opts = {}) {
  const raw = typeof expr === 'string' ? expr : '';
  if (!raw) return { kind: 'opaque', raw };

  const bare = raw.match(BARE_REF);
  if (bare) {
    const name = bare[1].trim();
    const global = findGlobalField(name, opts);
    if (global) return { kind: global.kind, ref: name, raw };
    return { kind: 'opaque', raw };
  }

  const trySingleRef = text => {
    const m = text.match(SINGLE_REF);
    if (!m) return null;
    return { statedModel: m[1].trim(), field: m[2].trim() };
  };

  // Build the recognized-state result for a resolved single-ref, given an
  // optional wrapping aggregation function name (null for a bare column ref).
  const buildResult = (refParts, agg) => {
    const { statedModel, field } = refParts;
    const global = findGlobalField(field, opts);
    if (global) {
      // An aggregate wrapping a metric/dimension-ref isn't a state the
      // grammar defines (06 §3's table has no "SUM of a metric ref" row) —
      // fall through to opaque rather than inventing a composite kind.
      if (agg) return null;
      const result = { kind: global.kind, ref: field, raw };
      const resolvedParent = global.field?.parentModel;
      if (resolvedParent && resolvedParent !== statedModel) {
        result.statedModel = statedModel;
        result.resolvedParent = resolvedParent;
      }
      return result;
    }
    if (agg) {
      if (!PRESET_AGGREGATIONS.includes(agg)) return null;
      return { kind: 'aggregate', agg, ref: statedModel, column: field, raw };
    }
    return { kind: 'dimension', ref: statedModel, column: field, raw };
  };

  const direct = trySingleRef(raw);
  if (direct) {
    const result = buildResult(direct, null);
    if (result) return result;
  }

  const aggMatch = raw.match(AGG_WRAP);
  if (aggMatch) {
    const fn = aggMatch[1].toLowerCase();
    const inner = trySingleRef(aggMatch[2].trim());
    if (inner) {
      const result = buildResult(inner, fn);
      if (result) return result;
    }
  }

  return { kind: 'opaque', raw };
}

/**
 * serialize(state) -> expr string. Called ONLY on an explicit user action
 * (a preset selection in `PillMenu`) — never as part of passive rendering —
 * so a value the user hasn't touched never gets silently rewritten even when
 * `state.raw` is absent (a freshly-built state from a menu action carries no
 * `raw`; opaque/custom states always pass their `raw` through verbatim).
 */
export function serialize(state) {
  if (!state) return '';
  switch (state.kind) {
    case 'dimension':
      return formatRefExpression(state.ref, state.column);
    case 'aggregate':
      return `${state.agg}(${formatRefExpression(state.ref, state.column)})`;
    case 'metricRef':
    case 'dimensionRef':
      return formatRefExpression(state.ref);
    case 'custom':
    case 'opaque':
    default:
      return state.raw ?? '';
  }
}
