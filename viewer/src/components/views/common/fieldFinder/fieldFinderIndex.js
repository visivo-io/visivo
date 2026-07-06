/**
 * fieldFinderIndex.js (VIS-1021)
 *
 * Builds and caches the per-type searchable index that backs the Field Finder
 * palette, and the deterministic tiered ranking over it.
 *
 * The index is assembled ONCE per chart type from artifacts already loaded by
 * the trace-props editor — the per-type `<type>.schema.json` (flattened to leaf
 * paths) joined with the curated `<type>.catalog.json` overlay (tier / keywords
 * / label). It NEVER loads the 5.4 MB `trace-properties.schema.json` or the
 * 910 KB `layout.schema.json` at runtime.
 *
 * Index entry shape:
 *   { path, label, description, keywords, tier, controlType, enumValues,
 *     isScalar, hidden }
 *
 *   - `controlType` (from resolveFieldType): number | color | enum | boolean |
 *     string | array | object | patternMultiselect | ref | query-string | ...
 *   - `isScalar`: true for number/color/enum/boolean/string — these are
 *     inline-editable in a palette result row. Everything else is COMPOUND
 *     (jump-and-focus into the grouped form).
 *   - `hidden`: `*src` data-source variants — reachable by exact path only,
 *     never ranked into fuzzy results.
 */

import { getStaticSchema } from '../SchemaEditor/utils/schemaUtils';
import { resolveFieldType, getEnumValues } from '../SchemaEditor/utils/fieldResolver';
import { resolveSynonym } from './fieldFinderSynonyms';

const SCALAR_CONTROL_TYPES = new Set(['number', 'color', 'enum', 'boolean', 'string']);

// Module-level cache: chart type → IndexEntry[]. Cached by resolved value so a
// repeat build for the same type returns the same reference.
const indexCache = new Map();

/** Humanize a dotted path leaf into a Title Case label ('line.dash' → 'Dash'). */
const humanizeLeaf = path => {
  const leaf = path.split('.').pop() || path;
  return leaf
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Walk a schema's properties, emitting a node for EVERY property — leaf scalars
 * AND compound container objects. (The SchemaEditor's `flattenSchemaProperties`
 * emits leaves only; the Field Finder also needs the container paths, e.g.
 * `marker.colorbar`, as jump-and-focus targets.) Recurses into nested objects.
 */
function walkSchemaNodes(schema, prefix, defs, out) {
  const properties = schema?.properties || {};
  Object.entries(properties).forEach(([name, propSchema]) => {
    if (name === 'type' && !prefix) return; // discriminator, handled elsewhere
    const path = prefix ? `${prefix}.${name}` : name;
    const resolved = getStaticSchema(propSchema, defs);
    const isNestedObject =
      resolved?.type === 'object' &&
      resolved.properties &&
      Object.keys(resolved.properties).length > 0;
    out.push({
      path,
      schema: propSchema,
      resolved,
      description: propSchema.description || resolved?.description || '',
    });
    if (isNestedObject) walkSchemaNodes(resolved, path, defs, out);
  });
  return out;
}

/**
 * Build (or return cached) the searchable index for a chart type.
 *
 * @param {string} type - chart type (e.g. 'scatter').
 * @param {object} schema - the loaded per-type JSON schema (with `$defs`).
 * @param {Array<object>} catalogEntries - the `<type>.catalog.json` overlay.
 * @returns {Array<object>} the index entries.
 */
export function buildFieldIndex(type, schema, catalogEntries = []) {
  if (type && indexCache.has(type)) return indexCache.get(type);
  if (!schema) return [];

  const defs = schema.$defs || {};
  const catalogByPath = new Map();
  (catalogEntries || []).forEach(c => {
    if (c && c.path) catalogByPath.set(c.path, c);
  });

  const flat = walkSchemaNodes(schema, '', defs, []);
  const entries = flat.map(node => {
    const cat = catalogByPath.get(node.path);
    const controlType = resolveFieldType(node.schema, defs);
    const enumValues = getEnumValues(node.schema, defs) || cat?.enumValues || null;
    return {
      path: node.path,
      label: cat?.label || humanizeLeaf(node.path),
      description: cat?.description || node.description || '',
      keywords: Array.isArray(cat?.keywords) ? cat.keywords : [],
      tier: cat?.tier || null,
      controlType,
      enumValues,
      isScalar: SCALAR_CONTROL_TYPES.has(controlType),
      // `*src` variants (e.g. `marker.colorsrc`) are data-binding plumbing —
      // reachable by exact path only, never ranked into fuzzy results.
      hidden: /(^|\.)[a-z0-9]+src$/i.test(node.path),
    };
  });

  if (type) indexCache.set(type, entries);
  return entries;
}

/** Test/HMR seam — drop cached indexes so a rebuild re-reads fresh artifacts. */
export function resetFieldIndexCache() {
  indexCache.clear();
}

// ─── Ranking ────────────────────────────────────────────────────────────────

/** Is `q` a subsequence of `s` (chars in order, gaps allowed)? */
const isSubsequence = (q, s) => {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j += 1) {
    if (s[j] === q[i]) i += 1;
  }
  return i === q.length;
};

/** Bounded Levenshtein: returns true if edit distance ≤ cap (cheap early-out). */
const withinEditDistance = (a, b, cap) => {
  if (Math.abs(a.length - b.length) > cap) return false;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return false; // whole row exceeds cap → no path back under it
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length] <= cap;
};

// Lower score = better. Tiers per the §0.8.1d design.
const TIER = {
  EXACT: 1, // exact label or leaf-segment match
  SYNONYM: 1.5, // curated trace-synonym hit (I-know-the-effect queries)
  PREFIX: 3, // label / leaf prefix
  FUZZY: 3.5, // subsequence / small edit-distance on the leaf
  KEYWORD: 4, // catalog keyword hit
  PATH: 5, // path substring
  DESCRIPTION: 6, // description substring
};

/** Catalog-tier tiebreak: A floats above B floats above the un-curated tail. */
const catalogRank = tier => (tier === 'A' ? 0 : tier === 'B' ? 1 : 2);

/**
 * Score one entry against a lowercased query. Returns a tier number (lower is
 * better) or Infinity for no match. Synonym-boosted paths are handled by the
 * caller (they inject TIER.SYNONYM), so this is the intrinsic text match.
 */
function scoreEntry(entry, q) {
  const label = entry.label.toLowerCase();
  const leaf = (entry.path.split('.').pop() || entry.path).toLowerCase();
  const path = entry.path.toLowerCase();
  const desc = entry.description.toLowerCase();

  if (label === q || leaf === q) return TIER.EXACT;
  if (label.startsWith(q) || leaf.startsWith(q)) return TIER.PREFIX;
  if (entry.keywords.some(k => k.toLowerCase() === q || k.toLowerCase().startsWith(q))) {
    return TIER.KEYWORD;
  }
  // Fuzzy only kicks in for queries long enough to be meaningful (≥3) so short
  // queries don't match everything.
  if (q.length >= 3) {
    const cap = q.length <= 5 ? 1 : 2;
    if (isSubsequence(q, leaf) || withinEditDistance(q, leaf, cap)) return TIER.FUZZY;
  }
  if (path.includes(q)) return TIER.PATH;
  if (desc.includes(q)) return TIER.DESCRIPTION;
  return Infinity;
}

/**
 * Rank the index for a query. Deterministic: identical inputs → identical order.
 *
 * @param {string} query
 * @param {Array<object>} entries - the per-type index.
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.mru] - most-recently-used paths (tiebreak boost).
 * @returns {{ results: Array<object>, synonym: object|null }}
 *   `results`: ranked matching entries (each carries a `_tier` for debugging).
 *   `synonym`: the resolved synonym record when the WHOLE query is a synonym
 *     term (so the palette can render a layout-scoped "belongs elsewhere" or a
 *     `scope:'none'` explanatory row). Null otherwise.
 */
export function rankFields(query, entries, opts = {}) {
  const q = (query || '').trim().toLowerCase();
  const mru = opts.mru instanceof Set ? opts.mru : new Set(opts.mru || []);
  const synonym = resolveSynonym(q);

  if (!q) return { results: [], synonym };

  // Trace-scoped synonym → force its paths to the SYNONYM tier (above prefix).
  const synonymPaths = synonym && synonym.scope === 'trace' ? new Set(synonym.paths) : new Set();

  const scored = [];
  entries.forEach(entry => {
    if (entry.hidden) return; // *src variants: exact-path only, never ranked
    let tier = scoreEntry(entry, q);
    if (synonymPaths.has(entry.path)) tier = Math.min(tier, TIER.SYNONYM);
    if (tier === Infinity) return;
    scored.push({ entry, tier });
  });

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    // MRU float within a tier.
    const am = mru.has(a.entry.path) ? 0 : 1;
    const bm = mru.has(b.entry.path) ? 0 : 1;
    if (am !== bm) return am - bm;
    const ac = catalogRank(a.entry.tier);
    const bc = catalogRank(b.entry.tier);
    if (ac !== bc) return ac - bc;
    if (a.entry.path.length !== b.entry.path.length) {
      return a.entry.path.length - b.entry.path.length;
    }
    return a.entry.path.localeCompare(b.entry.path);
  });

  return { results: scored.map(s => ({ ...s.entry, _tier: s.tier })), synonym };
}

/**
 * The empty-query discovery set: curated Tier-A then Tier-B, with MRU paths
 * floated to the very top (§0.8.1d "Recently/frequently used first").
 *
 * @param {Array<object>} entries
 * @param {Set<string>|string[]} [mru]
 * @returns {Array<object>}
 */
export function curatedEntries(entries, mru = []) {
  const mruSet = mru instanceof Set ? mru : new Set(mru || []);
  const curated = entries.filter(e => !e.hidden && (e.tier === 'A' || e.tier === 'B'));
  return curated.slice().sort((a, b) => {
    const am = mruSet.has(a.path) ? 0 : 1;
    const bm = mruSet.has(b.path) ? 0 : 1;
    if (am !== bm) return am - bm;
    const ac = catalogRank(a.tier);
    const bc = catalogRank(b.tier);
    if (ac !== bc) return ac - bc;
    return a.path.localeCompare(b.path);
  });
}
