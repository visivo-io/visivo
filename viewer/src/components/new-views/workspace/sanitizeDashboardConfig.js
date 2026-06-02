/**
 * sanitizeDashboardConfig — VIS-802 / Track G G-1 (GAP-3 fix).
 *
 * The right-rail structure forms (Add row / Add item / mutual-exclusion resets)
 * scaffold items with EMPTY-STRING leaf fields — `{ width, chart:'', table:'',
 * markdown:'', input:'', selector:'' }`. The backend `Item.validate_unique_item_types`
 * validator counts any value that `is not None` as "set" (an empty string IS not
 * None), so such a scaffold reports 4–5 leaf types set and is rejected with a 400
 * ("only one of markdown/chart/table/input/rows should be set on an item").
 * `selector` is not even an Item field, so it is extra-forbidden too.
 *
 * Auto-save must never persist invalid state, so we normalise the config before
 * it leaves the client: drop empty/blank leaf refs, drop the non-model `selector`
 * key, and recurse into nested row-container items. The result is always
 * backend-valid — a clean item has at most ONE leaf ref (or `rows`), or is an
 * empty layout slot (`{ width }`), which the validator accepts.
 *
 * Pure + immutable: never mutates the input.
 */

const LEAF_REF_FIELDS = ['chart', 'table', 'markdown', 'input'];
// `selector` is not a field on the Item model (extra="forbid") — the scaffold
// wrote it as an empty string; strip it unconditionally.
const NON_ITEM_FIELDS = ['selector'];

const isBlank = value =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const sanitizeItem = item => {
  if (!item || typeof item !== 'object') return item;
  const clean = { ...item };

  // Drop the spurious non-model key entirely.
  for (const key of NON_ITEM_FIELDS) delete clean[key];

  // Drop blank leaf refs so only genuinely-set leaves remain (≤1 after the
  // form's mutual-exclusion reset).
  for (const field of LEAF_REF_FIELDS) {
    if (isBlank(clean[field])) delete clean[field];
  }

  // Row-container item: recurse into nested rows. An empty `rows` array is a
  // valid (if visually empty) container; preserve it.
  if (Array.isArray(clean.rows)) {
    clean.rows = clean.rows.map(sanitizeRow);
  }

  return clean;
};

const sanitizeRow = row => {
  if (!row || typeof row !== 'object') return row;
  const items = Array.isArray(row.items) ? row.items.map(sanitizeItem) : row.items;
  return { ...row, items };
};

/**
 * Return a deep-cleaned copy of a dashboard config so it always satisfies the
 * backend Item validator. Non-object / missing `rows` is returned unchanged.
 *
 * @param {object} config - the dashboard config ({ rows, ... }).
 * @returns {object} a new, sanitized config (input is never mutated).
 */
export const sanitizeDashboardConfig = config => {
  if (!config || typeof config !== 'object') return config;
  if (!Array.isArray(config.rows)) return config;
  return { ...config, rows: config.rows.map(sanitizeRow) };
};

export default sanitizeDashboardConfig;
