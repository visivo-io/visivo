/**
 * columnType — shared classifier for a raw DB column type string (e.g. from
 * a source schema introspection payload: `INTEGER`, `VARCHAR`, `DOUBLE`, …).
 *
 * Extracted from `LibrarySourceRow.jsx`'s `glyphForColumnType` (Explore 2.0
 * Phase 3a / D9) so the SAME numeric classification backs both the Library's
 * column-type glyph AND the D10 pill-grammar's "numeric column defaults to a
 * SUM aggregate on drop" heuristic (06-pill-aggregation-grammar.md §3) —
 * one regex, not two copies drifting apart.
 */

const NUMERIC_TYPE_PATTERN = /int|numeric|float|double|decimal|real|serial/;

/**
 * @param {string|null|undefined} type - a raw DB column type string.
 * @returns {boolean} true when the type reads as a numeric SQL type.
 */
export function isNumericColumnType(type) {
  return NUMERIC_TYPE_PATTERN.test(String(type || '').toLowerCase());
}
