/**
 * insightFreshnessSignature — the single, shared definition of "what does
 * this insight's rendered output depend on right now" (P6-D1/D2/D3/D8
 * closure, specs/plan/explorer-workspace-unification/research/
 * e2e-gap-review.md "Phase 6 delta pass").
 *
 * Used by BOTH:
 *   - `useDraftInsightPreview.js`'s own recompute-trigger signature (the
 *     draft lane: "should I recompile this insight against DuckDB right
 *     now").
 *   - `ExplorerChartPreview.jsx`'s promoted-lane freshness check (the real
 *     lane: "does the promoted-moment signature still match the CURRENT
 *     signature").
 *
 * These two call sites MUST stay byte-identical in what they consider
 * "changed" — a model-SQL edit that the draft lane treats as recompute-
 * worthy has to be the EXACT same edit that unlocks the promoted lane's
 * fallback to draft, or the two lanes can disagree about what's stale.
 * Duplicating this logic (the pre-P6-D2 shape) is how that drift happened
 * the first time.
 */

/** Per-model fingerprint: SQL text, source, and row count (a model edit that
 * changes NONE of these produces no observably different query result, so
 * it deliberately does not affect the signature). */
export const buildModelsSignature = modelStates =>
  Object.entries(modelStates || {}).map(([name, s]) => ({
    name,
    sql: s?.sql,
    sourceName: s?.sourceName,
    rowCount: s?.queryResult?.rows?.length || 0,
  }));

/** Full per-insight freshness signature: the insight's own type/props/
 * interactions PLUS every referenced-project model's fingerprint (P6-D2 —
 * a model/computed-column edit changes the rendered result without
 * necessarily touching the insight's own props text). JSON-stringified so
 * callers get a single comparable/cacheable primitive. */
export const buildInsightFreshnessSignature = (insightState, modelStates) =>
  JSON.stringify({
    type: insightState?.type,
    props: insightState?.props,
    interactions: insightState?.interactions,
    modelsSig: buildModelsSignature(modelStates),
  });
