/**
 * Generate a unique name by appending a `<separator><N>` suffix when the base
 * name is taken.
 *
 * ### Which separator
 *
 * The house style for generated object names is HYPHENS (`orders-query`,
 * `new-chart`), so the collision suffix is a hyphen too — `new-chart-2`, not
 * `new-chart_2`. This used to be hard-coded to `_`, which left every "+ New"
 * and Explorer-generated name mixing both conventions the moment a name
 * collided.
 *
 * Two names CANNOT take a hyphen: `dimension` and `metric` must be valid SQL
 * identifiers, and the backend rejects dashes for them (`region-2` is a
 * validation error, `region_2` is fine). Those call sites pass `separator: '_'`
 * explicitly rather than relying on the base name's shape, because a
 * user-named dimension (`region`) carries no separator to infer from.
 *
 * With no explicit separator, the base name's own style wins — a hyphenated
 * base keeps hyphens, an underscored base keeps underscores (`orders_to_users`
 * → `orders_to_users_2`, which reads far better than `orders_to_users-2`) —
 * falling back to the hyphen house style when the base has neither.
 *
 * @param {string} prefix - Desired name
 * @param {Set|Array|Object} existingNames - Names already in use (Set, Array, or Object keys)
 * @param {object} [options]
 * @param {'-'|'_'} [options.separator] - Force the suffix separator. Required
 *   for SQL-identifier names (dimension/metric), which must never take a dash.
 * @returns {string} Guaranteed unique name
 */
export function generateUniqueName(prefix, existingNames, { separator } = {}) {
  const nameSet =
    existingNames instanceof Set
      ? existingNames
      : Array.isArray(existingNames)
        ? new Set(existingNames)
        : new Set(Object.keys(existingNames || {}));

  if (!nameSet.has(prefix)) return prefix;

  const sep = separator || suffixSeparatorFor(prefix);

  let counter = 2;
  while (nameSet.has(`${prefix}${sep}${counter}`)) {
    counter++;
  }
  return `${prefix}${sep}${counter}`;
}

/**
 * The separator that matches a base name's own style: hyphen when it already
 * uses one, underscore when it only uses underscores, hyphen otherwise (the
 * house style for a base like `chart` that carries no separator at all).
 */
export function suffixSeparatorFor(prefix) {
  const base = String(prefix || '');
  if (base.includes('-')) return '-';
  if (base.includes('_')) return '_';
  return '-';
}

/**
 * Matches a generated collision suffix in EITHER convention — `_2` (what we
 * used to mint, and what is still correct for SQL-identifier names) and `-2`.
 * Callers that recognise auto-generated names must accept both, or a rename
 * suggestion silently stops firing for half of them.
 */
export const UNIQUE_SUFFIX_PATTERN = '[_-]\\d+';
