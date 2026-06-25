/**
 * buildTraceGroupSpec.js — pure trace-prop grouping (VIS-1020 §3)
 *
 * Maps a per-type Plotly trace schema + curated catalog entries + a path→group
 * sidecar map into an ordered `groupSpec[]` that `FieldGroupList` / `FieldGroup`
 * (VIS-991) render unchanged.
 *
 * It is PURE: the (large) per-type schema, catalog entries, groups map, and the
 * current value object are ALL passed in. Nothing is imported here — no big JSON,
 * no loaders — so the function stays trivially unit-testable.
 *
 * Emitted display order (only groups with ≥1 field are kept):
 *   1. Essentials       (★★, icon 'essentials')  — catalog Tier-A paths, open, required-first
 *   2. Key fields (<type>) (★, icon 'key')         — catalog Tier-B paths
 *   3. Encoding         (⛁, icon 'encoding')      — groupsMap 'encoding' minus Essentials/Key
 *   4. Style            (🎨, icon 'style')         — groupsMap 'style' minus catalog
 *   5. Layout           (🗂, icon 'layout')        — groupsMap 'layout', collapsed
 *   6. Animation        (▷, icon 'animation')     — groupsMap 'animation', collapsed
 *   7. Other            (⋯, icon 'other')          — groupsMap 'other' + ANY schema leaf
 *                                                    not placed elsewhere, collapsed
 *
 * Coverage invariant (asserted in the test): the field universe is
 *   (flattened schema leaf paths) ∪ (groupsMap paths) ∪ (catalog paths)
 * and EVERY member lands in exactly one emitted group — nothing is ever dropped.
 *
 * Each emitted group matches the FieldGroup spec shape precisely. Each field is
 * `{ name, path, label, schema, tier, required, present, expanded, ... }` where
 * `name === path` is the dot-path PropertyRow consumes (`getValueAtPath` /
 * `setValueAtPath` resolve it), and `schema` is the resolved schema node at that
 * path so PropertyRow can render the right widget.
 */

/**
 * Ordered group definitions. `id` is the stable collapse-persistence key
 * (`{objectType}.{groupId}`); `icon` is a FieldGroup `GROUP_ICONS` key (with a
 * graceful fallback); `glyph` is the literal §3 marker; `defaultOpen` drives
 * `alwaysOpen` (Essentials) and the collapsed/expanded posture of the rest.
 */
export const TRACE_GROUP_DEFS = [
  { id: 'essentials', title: 'Essentials', icon: 'essentials', glyph: '★★', defaultOpen: true },
  { id: 'key', title: 'Key fields', icon: 'key', glyph: '★', defaultOpen: true },
  { id: 'encoding', title: 'Encoding', icon: 'encoding', glyph: '⛁', defaultOpen: true },
  { id: 'style', title: 'Style', icon: 'style', glyph: '🎨', defaultOpen: true },
  { id: 'layout', title: 'Layout', icon: 'layout', glyph: '🗂', defaultOpen: false },
  { id: 'animation', title: 'Animation', icon: 'animation', glyph: '▷', defaultOpen: false },
  { id: 'other', title: 'Other', icon: 'other', glyph: '⋯', defaultOpen: false },
];

export const TRACE_GROUP_ORDER = TRACE_GROUP_DEFS.map(g => g.id);

const GROUP_DEF_BY_ID = TRACE_GROUP_DEFS.reduce((acc, g) => {
  acc[g.id] = g;
  return acc;
}, {});

/**
 * The discriminator field is never an editable trace prop; it is excluded from
 * the field universe entirely.
 */
const HIDDEN_PATHS = new Set(['type']);

/**
 * Number of fields rendered up-front in a group before the "+ N more" affordance
 * kicks in. Mirrors FieldGroup's expanded/rest split for non-essential groups.
 */
const VISIBLE_HEAD = 3;

// ─── Schema resolution helpers (no external imports) ────────────────────────

/**
 * Resolve a local `#/$defs/...` $ref against the schema's `$defs`.
 */
function resolveRef(ref, defs) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return null;
  return defs[ref.replace('#/$defs/', '')] || null;
}

/**
 * Collapse a oneOf/anyOf/$ref property node down to its static (non
 * query-string) schema so we can detect nested objects and pick a render type.
 * Mirrors SchemaEditor/utils/schemaUtils#getStaticSchema, inlined to keep this
 * module dependency-free.
 */
function staticSchema(schema, defs) {
  if (!schema) return null;

  if (schema.$ref) {
    if (schema.$ref === '#/$defs/query-string') return null;
    return resolveRef(schema.$ref, defs) || schema;
  }

  const options = schema.oneOf || schema.anyOf;
  if (options) {
    const staticOptions = options.filter(opt => opt && opt.$ref !== '#/$defs/query-string');
    if (staticOptions.length === 0) return null;

    const single = staticOptions.find(opt => opt.type !== 'array' || !opt.items);
    if (single) {
      if (single.oneOf || single.anyOf) return staticSchema(single, defs);
      if (single.$ref) return resolveRef(single.$ref, defs) || single;
      return single;
    }

    const arr = staticOptions.find(opt => opt.type === 'array' && opt.items);
    if (arr) return arr;

    const first = staticOptions[0];
    if (first.oneOf || first.anyOf) return staticSchema(first, defs);
    if (first.$ref) return resolveRef(first.$ref, defs) || first;
    return first;
  }

  return schema;
}

/**
 * Whether a resolved schema node is a nested object with its own properties.
 */
function isNestedObject(resolved) {
  return !!(
    resolved &&
    resolved.type === 'object' &&
    resolved.properties &&
    Object.keys(resolved.properties).length > 0
  );
}

/**
 * Walk the per-type schema and return a Map of leaf dot-path → raw property
 * schema node. Only leaves (non-object props, or objects with no properties)
 * are returned; nested objects are expanded into their children. `type` at the
 * top level is excluded.
 *
 * @param {object} schema - per-type trace schema (has `.properties`, `.$defs`)
 * @returns {Map<string, object>} leaf path → raw schema node
 */
function flattenSchemaLeaves(schema) {
  const out = new Map();
  if (!schema || typeof schema !== 'object') return out;
  const defs = schema.$defs || {};

  const walk = (node, prefix) => {
    const properties = (node && node.properties) || {};
    Object.entries(properties).forEach(([name, propSchema]) => {
      const path = prefix ? `${prefix}.${name}` : name;
      if (!prefix && HIDDEN_PATHS.has(name)) return;

      const resolved = staticSchema(propSchema, defs);
      if (isNestedObject(resolved)) {
        walk(resolved, path);
      } else {
        out.set(path, propSchema);
      }
    });
  };

  walk(schema, '');
  return out;
}

/**
 * Resolve the raw schema node at an arbitrary dot-path, walking through oneOf /
 * anyOf / $ref object wrappers. Returns `{}` when the path can't be resolved
 * (e.g. a synthetic groupsMap key absent from the schema) so the field still
 * renders rather than being dropped.
 *
 * @param {object} schema - per-type trace schema
 * @param {string} dotPath - e.g. 'marker.color'
 * @returns {object} raw schema node, or `{}` if unresolvable
 */
export function resolveSchemaAtPath(schema, dotPath) {
  if (!schema || !dotPath) return {};
  const defs = schema.$defs || {};
  const parts = dotPath.split('.');

  let node = schema;
  for (let i = 0; i < parts.length; i++) {
    if (!node) return {};
    // Find the properties bag for the current node, unwrapping oneOf/anyOf/$ref.
    let props = node.properties;
    if (!props) {
      const resolved = staticSchema(node, defs);
      props = resolved && resolved.properties;
    }
    if (!props) return {};
    node = props[parts[i]];
  }

  return node || {};
}

/**
 * Humanize a dot-path into a readable label when the catalog has none.
 * 'marker.color' → 'Marker Color', 'error_x.array' → 'Error X Array'.
 */
export function humanizePath(path) {
  if (!path || typeof path !== 'string') return '';
  return path
    .split('.')
    .join(' ')
    .split('_')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Whether the current value object carries a meaningful entry at `dotPath`.
 * null / undefined / empty-string / empty-array / empty-object count as absent.
 */
export function isPathPresent(value, dotPath) {
  if (!value || typeof value !== 'object' || !dotPath) return false;
  const v = dotPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), value);
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

// ─── Field construction ─────────────────────────────────────────────────────

/**
 * Build a single field spec for a dot-path.
 *
 * @param {string} path - dot-path (becomes both `name` and `path`)
 * @param {object} schema - per-type trace schema (for node resolution)
 * @param {object|undefined} catalogEntry - the catalog entry, if any
 * @param {object} value - current value object
 * @param {boolean} required - whether the field is required (Essentials)
 * @returns {object} field spec consumed by FieldGroup
 */
function makeField(path, schema, catalogEntry, value, required) {
  const present = isPathPresent(value, path);
  return {
    // FieldGroup reads `field.name` for PropertyRow's `path`. `path` is the
    // §3-contract alias; both hold the same dot-path.
    name: path,
    path,
    label: (catalogEntry && catalogEntry.label) || humanizePath(path),
    schema: resolveSchemaAtPath(schema, path),
    tier: (catalogEntry && catalogEntry.tier) || null,
    description: (catalogEntry && catalogEntry.description) || '',
    required: !!required,
    present,
    // Required OR present → rendered up-front; otherwise behind "+ N more".
    expanded: !!required || present,
  };
}

/**
 * Decide field display order within Essentials: required-first, then catalog
 * order (already the input order of `fields`).
 */
function requiredFirst(fields) {
  const req = fields.filter(f => f.required);
  const rest = fields.filter(f => !f.required);
  return [...req, ...rest];
}

/**
 * Compute the `hiddenCount` for a non-essential group: how many fields sit
 * beyond the first `VISIBLE_HEAD` (surfaced behind "+ N more"). Only counts the
 * collapsed tail (fields that are not `expanded`), matching FieldGroup, but is
 * floored by the simple ">3 beyond the first 3" rule from §3.
 */
function computeHiddenCount(fields) {
  const tail = fields.filter(f => !f.expanded);
  if (fields.length <= VISIBLE_HEAD) return 0;
  // Fields beyond the first VISIBLE_HEAD that are part of the collapsed tail.
  return Math.min(tail.length, fields.length - VISIBLE_HEAD);
}

// ─── Main builder ───────────────────────────────────────────────────────────

/**
 * Build the ordered trace-prop group spec.
 *
 * @param {object} args
 * @param {string} args.type - chart/trace type (e.g. 'scatter'); echoed as
 *   `objectType` on every group + woven into the "Key fields (<type>)" title.
 * @param {object} args.schema - per-type Plotly trace schema (`.properties`,
 *   optional `.$defs`, `.required`).
 * @param {Array<object>} args.catalogEntries - curated Tier-A/B catalog entries
 *   `{ path, label, tier, description, ... }`.
 * @param {Record<string,string>} args.groupsMap - flat path→group sidecar map
 *   (`encoding` | `style` | `layout` | `animation` | `other`).
 * @param {object} args.value - current trace-prop values object.
 * @returns {Array<object>} ordered groupSpec (only non-empty groups), each shaped
 *   `{ id, title, label, icon, glyph, objectType, defaultOpen, alwaysOpen,
 *      hiddenCount, fields }`.
 */
export function buildTraceGroupSpec({
  type,
  schema,
  catalogEntries = [],
  groupsMap = {},
  value = {},
} = {}) {
  const objectType = typeof type === 'string' ? type : '';
  const safeSchema = schema && typeof schema === 'object' ? schema : {};
  const safeCatalog = Array.isArray(catalogEntries) ? catalogEntries : [];
  const safeGroups = groupsMap && typeof groupsMap === 'object' ? groupsMap : {};
  const safeValue = value && typeof value === 'object' ? value : {};

  const requiredSet = new Set((safeSchema.required || []).filter(p => !HIDDEN_PATHS.has(p)));

  // Catalog by tier, de-duplicated by path (first wins, preserving order).
  const catalogByPath = new Map();
  safeCatalog.forEach(entry => {
    if (entry && typeof entry.path === 'string' && !catalogByPath.has(entry.path)) {
      catalogByPath.set(entry.path, entry);
    }
  });
  const tierAPaths = safeCatalog
    .filter(e => e && e.tier === 'A' && typeof e.path === 'string')
    .map(e => e.path);
  const tierBPaths = safeCatalog
    .filter(e => e && e.tier === 'B' && typeof e.path === 'string')
    .map(e => e.path);

  // Paths already claimed by Essentials / Key fields — excluded downstream so
  // each path lands in exactly one group.
  const claimed = new Set();
  const dedupe = paths => {
    const seen = new Set();
    const out = [];
    paths.forEach(p => {
      if (typeof p !== 'string' || seen.has(p)) return;
      seen.add(p);
      out.push(p);
    });
    return out;
  };

  // 1. Essentials — Tier-A catalog paths, required-first.
  const essentialPaths = dedupe(tierAPaths);
  essentialPaths.forEach(p => claimed.add(p));

  // 2. Key fields (<type>) — Tier-B catalog paths (minus anything in Essentials).
  const keyPaths = dedupe(tierBPaths).filter(p => !claimed.has(p));
  keyPaths.forEach(p => claimed.add(p));

  // groupsMap partitioned by target group.
  const groupsByTarget = { encoding: [], style: [], layout: [], animation: [], other: [] };
  Object.entries(safeGroups).forEach(([path, group]) => {
    if (HIDDEN_PATHS.has(path)) return;
    if (groupsByTarget[group]) {
      groupsByTarget[group].push(path);
    } else {
      // Unknown group value → fold into Other so nothing is dropped.
      groupsByTarget.other.push(path);
    }
  });

  // 3. Encoding — groupsMap 'encoding' minus Essentials/Key.
  const encodingPaths = dedupe(groupsByTarget.encoding).filter(p => !claimed.has(p));
  encodingPaths.forEach(p => claimed.add(p));

  // 4. Style — groupsMap 'style' minus catalog (Essentials + Key).
  const stylePaths = dedupe(groupsByTarget.style).filter(p => !claimed.has(p));
  stylePaths.forEach(p => claimed.add(p));

  // 5. Layout — groupsMap 'layout'.
  const layoutPaths = dedupe(groupsByTarget.layout).filter(p => !claimed.has(p));
  layoutPaths.forEach(p => claimed.add(p));

  // 6. Animation — groupsMap 'animation'.
  const animationPaths = dedupe(groupsByTarget.animation).filter(p => !claimed.has(p));
  animationPaths.forEach(p => claimed.add(p));

  // 7. Other — groupsMap 'other' + ANY schema leaf not placed anywhere yet, so
  //    that no schema property is ever dropped (the coverage invariant).
  const schemaLeaves = flattenSchemaLeaves(safeSchema);
  const otherPaths = dedupe(groupsByTarget.other).filter(p => !claimed.has(p));
  otherPaths.forEach(p => claimed.add(p));
  schemaLeaves.forEach((_node, leafPath) => {
    if (!claimed.has(leafPath)) {
      claimed.add(leafPath);
      otherPaths.push(leafPath);
    }
  });

  // Assemble fields per group.
  const buildFields = (paths, { allRequired = false } = {}) =>
    paths.map(p =>
      makeField(p, safeSchema, catalogByPath.get(p), safeValue, allRequired || requiredSet.has(p))
    );

  const bucketed = {
    essentials: requiredFirst(buildFields(essentialPaths)),
    key: buildFields(keyPaths),
    encoding: buildFields(encodingPaths),
    style: buildFields(stylePaths),
    layout: buildFields(layoutPaths),
    animation: buildFields(animationPaths),
    other: buildFields(otherPaths),
  };

  // Emit only non-empty groups, in canonical order.
  return TRACE_GROUP_ORDER.map(id => {
    const def = GROUP_DEF_BY_ID[id];
    const fields = bucketed[id];
    if (!fields || fields.length === 0) return null;

    // "Key fields (<type>)" weaves the type into the title literally.
    const title = id === 'key' ? `Key fields (${objectType})` : def.title;
    // Non-essential groups surface a "+ N more" count; Essentials never hides.
    const hiddenCount = id === 'essentials' ? 0 : computeHiddenCount(fields);

    return {
      id,
      title,
      // FieldGroup reads `group.label` for its header text — alias to title.
      label: title,
      icon: def.icon,
      glyph: def.glyph,
      objectType,
      defaultOpen: def.defaultOpen,
      // FieldGroup reads `group.alwaysOpen`; Essentials must never collapse.
      alwaysOpen: id === 'essentials',
      hiddenCount,
      fields,
    };
  }).filter(Boolean);
}

export default buildTraceGroupSpec;
