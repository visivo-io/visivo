/**
 * fieldFinderSynonyms.js (VIS-1021)
 *
 * A small curated map of natural-language terms → Plotly prop paths, each
 * tagged with the SCOPE it belongs to. The per-insight Field Finder edits a
 * single trace's `props` (the trace-props editor), so it surfaces ONLY
 * `scope: 'trace'` synonyms — a term that resolves to a chart/layout concept
 * (`scope: 'layout'`) must NOT masquerade as an editable trace prop here, and a
 * term that isn't a native property at all (`scope: 'none'`) resolves to a
 * single explanatory row instead of a (wrong) field.
 *
 * This deliberately stays SMALL and hand-curated — it captures the handful of
 * high-intent "I know the effect I want, not the prop name" queries. The
 * catalog's own `keywords[]` cover the broad long tail; this covers the cases
 * where the user's word doesn't appear in any keyword/description at all.
 *
 * Entry shape: term → { paths?: string[], scope, note? }
 *   - scope 'trace': `paths` are real trace-prop dot-paths the finder can edit.
 *   - scope 'layout': the concept lives in the chart/layout editor, not here →
 *     the trace finder filters it out (returns zero results for that term).
 *   - scope 'none': not a built-in property at all → `note` explains what to do
 *     instead (e.g. add a separate insight); rendered as one explanatory row.
 */

export const SYNONYM_MAP = {
  // ── trace-scoped (editable here) ──────────────────────────────────────────
  dashed: { paths: ['line.dash'], scope: 'trace' },
  dotted: { paths: ['line.dash'], scope: 'trace' },
  'dash style': { paths: ['line.dash'], scope: 'trace' },
  thickness: { paths: ['line.width'], scope: 'trace' },
  'line thickness': { paths: ['line.width'], scope: 'trace' },
  transparency: { paths: ['opacity'], scope: 'trace' },
  alpha: { paths: ['opacity'], scope: 'trace' },
  'fill color': { paths: ['marker.color', 'fillcolor'], scope: 'trace' },
  'point size': { paths: ['marker.size'], scope: 'trace' },
  'dot size': { paths: ['marker.size'], scope: 'trace' },
  'point color': { paths: ['marker.color'], scope: 'trace' },
  'point shape': { paths: ['marker.symbol'], scope: 'trace' },
  'marker shape': { paths: ['marker.symbol'], scope: 'trace' },
  'hover text': { paths: ['hovertext', 'hovertemplate'], scope: 'trace' },
  'color bar': { paths: ['marker.colorbar'], scope: 'trace' },
  'color scale': { paths: ['marker.colorscale'], scope: 'trace' },
  'smooth line': { paths: ['line.shape'], scope: 'trace' },
  'curved line': { paths: ['line.shape'], scope: 'trace' },
  'fill area': { paths: ['fill'], scope: 'trace' },

  // ── layout-scoped (belongs to the chart/layout editor — NOT here) ─────────
  stacked: { scope: 'layout' },
  'stacked bars': { scope: 'layout' },
  grouped: { scope: 'layout' },
  'grouped bars': { scope: 'layout' },
  'log scale': { scope: 'layout' },
  logarithmic: { scope: 'layout' },
  'chart title': { scope: 'layout' },
  'axis title': { scope: 'layout' },
  legend: { scope: 'layout' },
  gridlines: { scope: 'layout' },
  'x axis range': { scope: 'layout' },
  'y axis range': { scope: 'layout' },

  // ── not a built-in property (explanatory) ─────────────────────────────────
  'trend line': {
    scope: 'none',
    note: 'Not a built-in trace property — add a separate trend/regression insight to the chart.',
  },
  'trend': {
    scope: 'none',
    note: 'Not a built-in trace property — add a separate trend/regression insight to the chart.',
  },
  'regression': {
    scope: 'none',
    note: 'Not a built-in trace property — add a separate regression insight to the chart.',
  },
  'moving average': {
    scope: 'none',
    note: 'Not a built-in trace property — compute it in the insight query or add a separate insight.',
  },
};

/**
 * Resolve a query against the synonym map. Matches the whole (trimmed,
 * lowercased) query as a term, exactly — synonyms are intent phrases, so a
 * substring match would over-fire.
 *
 * @param {string} query - the raw search query.
 * @returns {{ term: string, paths: string[], scope: string, note?: string }|null}
 */
export function resolveSynonym(query) {
  if (!query || typeof query !== 'string') return null;
  const term = query.trim().toLowerCase();
  if (!term) return null;
  const hit = SYNONYM_MAP[term];
  if (!hit) return null;
  return { term, paths: hit.paths || [], scope: hit.scope, note: hit.note };
}

export default SYNONYM_MAP;
