import { formatRefExpression } from '../../../../utils/refString';
import { AGGREGATIONS } from './PivotShelf';

/**
 * pivotDraft — VIS-1008 pure (de)serialisation helpers shared by PivotPlayground.
 *
 * The playground owns its draft as STRUCTURED chips for ergonomics:
 *   { columns: [{ field, source, label }],
 *     rows:    [{ field, source, label }],
 *     values:  [{ field, source, label, agg }] }
 *
 * The pivot PIPELINE (usePivotData / buildPivotQuery) and the saved table config
 * speak `${ref(name).field}` strings (+ `agg(${ref(name).field})` for values).
 * These helpers convert between the two representations and seed the chip draft
 * from an existing table record's ref-string config so the build lens opens
 * pre-populated with whatever the table already pivots on.
 */

const DEFAULT_AGG = 'sum';

// Capture `${ref(name).field}` → [name, field]. Anchored single-ref form.
const SINGLE_REF = /^\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\.\s*([^}\s]+)\s*\}$/;
// Capture the FIRST `${ref(name).field}` anywhere (used inside value expressions).
const EMBEDDED_REF = /\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\.\s*([^}\s]+)\s*\}/;
// Capture a leading aggregation function: `sum(...)` → ['sum', ...].
const AGG_WRAP = /^\s*(\w+)\s*\(([\s\S]*)\)\s*$/;

const humanise = name =>
  String(name || '')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

/** Parse a single `${ref(name).field}` ref string into a chip, or null. */
export const parseFieldRefToChip = refString => {
  if (typeof refString !== 'string') return null;
  const m = refString.match(SINGLE_REF);
  if (!m) return null;
  const source = m[1].trim();
  const field = m[2].trim();
  return { field, source, label: humanise(field) };
};

/**
 * Parse a value expression (`sum(${ref(name).field})`) into a value chip with a
 * recognised aggregation, or null. Falls back to the default aggregation when
 * the function isn't one of the supported aggregations.
 */
export const parseValueExprToChip = valueExpr => {
  if (typeof valueExpr !== 'string') return null;
  const aggMatch = valueExpr.match(AGG_WRAP);
  let agg = DEFAULT_AGG;
  let inner = valueExpr;
  if (aggMatch) {
    const fn = aggMatch[1].toLowerCase();
    if (AGGREGATIONS.includes(fn)) {
      agg = fn;
      inner = aggMatch[2];
    }
  }
  const refMatch = inner.match(EMBEDDED_REF);
  if (!refMatch) return null;
  const source = refMatch[1].trim();
  const field = refMatch[2].trim();
  return { field, source, label: humanise(field), agg };
};

/** Seed a structured chip draft from a table record's ref-string pivot config. */
export const seedDraftFromRecord = record => {
  const cfg = record || {};
  return {
    columns: (cfg.columns || []).map(parseFieldRefToChip).filter(Boolean),
    rows: (cfg.rows || []).map(parseFieldRefToChip).filter(Boolean),
    values: (cfg.values || []).map(parseValueExprToChip).filter(Boolean),
  };
};

/** Serialise a structured chip draft into the pipeline / save ref-string shape. */
export const serializeDraft = draft => {
  const d = draft || {};
  return {
    columns: (d.columns || []).map(c => formatRefExpression(c.source, c.field)),
    rows: (d.rows || []).map(c => formatRefExpression(c.source, c.field)),
    values: (d.values || []).map(
      c => `${c.agg || DEFAULT_AGG}(${formatRefExpression(c.source, c.field)})`
    ),
  };
};

/**
 * The DuckDB pivot config the result pipeline consumes. A runnable config is:
 *   - a PIVOT — pivot `columns` + aggregated `values`; `rows` (the grouping) are
 *     OPTIONAL: with rows it's a classic pivot, without rows it collapses to a
 *     single aggregated row pivoted across the column values; or
 *   - a column-select — `columns` only (no aggregation).
 * Anything else (e.g. columns with no values and no rows-as-select, or values
 * with no pivot column) returns null so the panel shows its empty hint instead
 * of erroring.
 */
export const draftToPivotConfig = draft => {
  const { columns, rows, values } = serializeDraft(draft);
  if (columns.length && values.length) return { columns, rows, values };
  if (columns.length && !rows.length && !values.length) return { columns };
  return null;
};

/** A value chip defaults its aggregation to sum when a field is dropped on Values. */
export const makeValueChip = field => ({ ...field, agg: DEFAULT_AGG });

export { DEFAULT_AGG };
