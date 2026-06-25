/**
 * traceCatalogLoader.js (VIS-1020)
 *
 * Lazy, cached loader for the per-type curated trace-prop catalog files
 * (`<type>.catalog.json`) and the per-type path→group maps
 * (`<type>.groups.json`) that live alongside this module in `src/schemas/`.
 *
 * Each `<type>.catalog.json` is an array of curated Tier-A/B entries:
 *   { path, label, tier, description, keywords, enumValues, example,
 *     schemaValType, schemaEditType }
 *
 * Each `<type>.groups.json` is a flat path→group map:
 *   { "<dotPath>": "<group>" }
 *
 * Both are loaded on demand via dynamic import and memoized at module level so
 * repeat calls for the same type never re-import. A type with no catalog/groups
 * file resolves gracefully to `[]` / `{}` instead of throwing.
 */

// Module-level caches keyed by chart type. We cache the resolved value
// (array / object), not the in-flight promise, so identity is stable across
// awaited calls and a second call returns the exact same reference.
const catalogCache = {};
const groupsCache = {};

/**
 * Lazily load and cache the curated catalog entries for a chart type.
 * @param {string} type - The chart type (e.g. 'scatter', 'bar').
 * @returns {Promise<Array<object>>} Array of catalog entries, or `[]` if none.
 */
export async function loadCatalog(type) {
  if (!type) return [];
  if (type in catalogCache) {
    return catalogCache[type];
  }

  let entries = [];
  try {
    const mod = await import(`./${type}.catalog.json`);
    const loaded = mod.default || mod;
    entries = Array.isArray(loaded) ? loaded : [];
  } catch {
    // No catalog file for this type — resolve gracefully to an empty list.
    entries = [];
  }

  catalogCache[type] = entries;
  return entries;
}

/**
 * Lazily load and cache the path→group map for a chart type.
 * @param {string} type - The chart type (e.g. 'scatter', 'bar').
 * @returns {Promise<Record<string, string>>} Groups map, or `{}` if none.
 */
export async function loadTraceGroups(type) {
  if (!type) return {};
  if (type in groupsCache) {
    return groupsCache[type];
  }

  let groups = {};
  try {
    const mod = await import(`./${type}.groups.json`);
    const loaded = mod.default || mod;
    groups = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
  } catch {
    // No groups file for this type — resolve gracefully to an empty map.
    groups = {};
  }

  groupsCache[type] = groups;
  return groups;
}

/**
 * Filter catalog entries down to Tier-A (data-binding essentials).
 * Synchronous — call after the entries have been loaded.
 * @param {Array<object>} entries - Catalog entries from `loadCatalog`.
 * @returns {Array<object>} Entries whose `tier === 'A'`.
 */
export function tierA(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => entry && entry.tier === 'A');
}

/**
 * Filter catalog entries down to Tier-B (key visual/style props).
 * Synchronous — call after the entries have been loaded.
 * @param {Array<object>} entries - Catalog entries from `loadCatalog`.
 * @returns {Array<object>} Entries whose `tier === 'B'`.
 */
export function tierB(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => entry && entry.tier === 'B');
}

/**
 * Clear both module-level caches. Intended for tests so each case starts from
 * a clean slate (and so import-spy assertions see fresh imports).
 */
export function clearCatalogCache() {
  for (const key of Object.keys(catalogCache)) {
    delete catalogCache[key];
  }
  for (const key of Object.keys(groupsCache)) {
    delete groupsCache[key];
  }
}
