/**
 * translatePreviewError — Explore 2.0 Phase 6c-T1 (ux-audit.md's "error
 * translation" finding: cold-start #1, promote-roundtrip #1/#2, pills #3).
 *
 * Maps a raw engine/compile error message (DuckDB-WASM, the Python
 * compile-draft endpoint, or `Insight.get_query_info`) to plain-language
 * copy a first-time analyst can act on. The raw message is NEVER discarded —
 * callers should always keep it available behind a collapsed "technical
 * details" disclosure, never as the prominent headline/hint (never a hashed
 * internal table name, never a raw DuckDB catalog "Did you mean pg_*"
 * suggestion, never DAG-internals jargon like "has no dependent models").
 *
 * Known classes (see ux-audit.md's "Code grounding" section for the exact
 * shapes these come from):
 *   - A DuckDB "Catalog Error: Table with name <hash> does not exist" — an
 *     internal draft-lane materialization table that was never registered.
 *     `useDraftInsightPreview.js`'s own pre-execution guard makes this
 *     unreachable from the draft-preview path in practice; this stays as a
 *     defensive translation for any OTHER path (e.g. a promoted-lane engine
 *     error) that might still surface one.
 *   - "Insight '<name>' has no dependent models" (visivo/models/insight.py)
 *     — DAG-internals jargon for "nothing is bound to a column yet".
 *   - Anything else — a generic, honest headline; the raw message moves to
 *     the technical-details disclosure rather than ever being the prominent
 *     copy itself (this is what keeps DuckDB's internal-catalog "Did you
 *     mean pg_*" suggestions out of the headline even for error shapes this
 *     module doesn't specifically recognize).
 *
 * @param {string} rawMessage
 * @returns {{headline: string, hint: string, technical: string}}
 */
const HASHED_TABLE_PATTERN = /Table with name [0-9a-zA-Z_]{8,} does not exist/i;
const NO_DEPENDENT_MODELS_PATTERN = /has no dependent models/i;

export function translatePreviewError(rawMessage) {
  const message = rawMessage == null ? '' : String(rawMessage);

  if (HASHED_TABLE_PATTERN.test(message)) {
    return {
      headline: "This chart hasn't loaded any data yet.",
      hint: 'Run your query, then come back to this tab to see a preview.',
      technical: message,
    };
  }

  if (NO_DEPENDENT_MODELS_PATTERN.test(message)) {
    return {
      headline: "This chart isn't connected to any data yet.",
      hint: 'Drag a column from the Library onto the chart to map it to your query.',
      technical: message,
    };
  }

  return {
    headline: 'This preview failed to run.',
    hint: 'Check your query and chart settings below, or see the technical details.',
    technical: message,
  };
}

export default translatePreviewError;
