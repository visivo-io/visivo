/**
 * A table's `columns`, `rows` and `values` entries are either an expression
 * string or a formatted entry `{ value, format }`, where `format` is a
 * d3-format spec for the entry's numbers.
 */

const isFormatted = entry => entry !== null && typeof entry === 'object';

/** The expression of an entry: the string itself, or a formatted entry's `value`. */
export const fieldExpression = entry => (isFormatted(entry) ? entry.value : entry);

/** The d3-format spec of an entry, or undefined for a plain string. */
export const fieldFormat = entry => (isFormatted(entry) && entry.format) || undefined;

/** The entry for `value` with `format`: a plain string when there is no format. */
export const withFormat = (value, format) => (format ? { value, format } : value);
