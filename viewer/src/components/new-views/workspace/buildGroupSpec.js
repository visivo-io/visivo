/**
 * buildGroupSpec (VIS-991)
 *
 * PURE function that maps a Visivo object schema slice (from the project
 * `$defs`) into an ordered array of FieldGroup specs for the schema-form engine.
 * It takes the schema slice as an argument and never imports the (large) project
 * JSON itself, so it stays trivially unit-testable.
 *
 * Semantic taxonomy (display order):
 *   Essentials → Data·Source → Encoding → Style → Layout → Behavior → Advanced
 *
 * Rules:
 *   - REQUIRED fields land in Essentials and that group is always-open.
 *   - Fields PRESENT in the current `value` are `expanded` (rendered up-front).
 *   - Rare / unset fields are `collapsed` (surfaced behind "+ N more").
 *   - ANY field not mapped to a known group falls to Advanced — so NO field is
 *     ever dropped (the coverage invariant the engine relies on).
 *   - Only groups with ≥1 field are emitted.
 */

/**
 * Group definitions in display order. `id` is the stable key used for collapse
 * persistence (`{objectType}.{groupId}`); `icon` is an objectTypeConfigs/react-icons
 * key consumed by the FieldGroup header.
 */
export const GROUP_DEFS = [
  { id: 'essentials', label: 'Essentials', icon: 'star' },
  { id: 'data', label: 'Data·Source', icon: 'database' },
  { id: 'encoding', label: 'Encoding', icon: 'chart' },
  { id: 'style', label: 'Style', icon: 'palette' },
  { id: 'layout', label: 'Layout', icon: 'layout' },
  { id: 'behavior', label: 'Behavior', icon: 'gear' },
  { id: 'advanced', label: 'Advanced', icon: 'sliders' },
];

export const GROUP_ORDER = GROUP_DEFS.map(g => g.id);

const GROUP_BY_ID = GROUP_DEFS.reduce((acc, g) => {
  acc[g.id] = g;
  return acc;
}, {});

/**
 * Explicit field-name → group mappings (highest priority). Matched case-insensitively
 * on the top-level property name (the first segment of a dotted path).
 */
const FIELD_GROUP_MAP = {
  // Data · Source
  data: 'data',
  data_type: 'data',
  source: 'data',
  model: 'data',
  models: 'data',
  expression: 'data',
  condition: 'data',
  join_type: 'data',
  sql: 'data',
  table: 'data',
  database: 'data',
  schema: 'data',
  columns: 'data',
  query: 'data',
  options: 'data',
  // Encoding
  insights: 'encoding',
  insight: 'encoding',
  props: 'encoding',
  rows: 'encoding',
  values: 'encoding',
  // Style
  format_cells: 'style',
  content: 'style',
  markdown: 'style',
  color: 'style',
  // Layout
  layout: 'layout',
  align: 'layout',
  justify: 'layout',
  level: 'layout',
  height: 'layout',
  width: 'layout',
  rows_per_page: 'layout',
  // Behavior
  interactions: 'behavior',
  is_default: 'behavior',
  default: 'behavior',
  selection: 'behavior',
  changed: 'behavior',
  // Essentials (descriptive identity that is always nice up front, even if optional)
  name: 'essentials',
  description: 'essentials',
};

/**
 * Substring keyword fallbacks, scanned in order when no explicit mapping hits.
 */
const KEYWORD_GROUP_RULES = [
  { group: 'data', keywords: ['source', 'model', 'sql', 'query', 'column', 'table', 'schema', 'database', 'expression', 'condition', 'join', 'data'] },
  { group: 'encoding', keywords: ['insight', 'trace', 'prop', 'metric', 'dimension', 'series', 'axis'] },
  { group: 'style', keywords: ['color', 'style', 'format', 'font', 'theme', 'content', 'markdown'] },
  { group: 'layout', keywords: ['layout', 'align', 'justify', 'height', 'width', 'position', 'grid', 'row', 'level', 'page'] },
  { group: 'behavior', keywords: ['interaction', 'default', 'enable', 'select', 'sort', 'filter', 'click', 'hover'] },
];

/**
 * Internal-only fields that should never surface in any group's field list.
 * `path`/`file_path` are server-managed identity, `type` is the discriminator.
 */
const HIDDEN_FIELDS = new Set(['path', 'file_path', 'type']);

/**
 * Determine which group a top-level field belongs to. Always returns a known
 * group id — unmapped fields fall through to 'advanced' so nothing is dropped.
 *
 * @param {string} fieldName - the top-level property name
 * @returns {string} a group id from GROUP_ORDER
 */
export function groupForField(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') return 'advanced';
  const lower = fieldName.toLowerCase();

  if (FIELD_GROUP_MAP[lower]) return FIELD_GROUP_MAP[lower];

  for (const rule of KEYWORD_GROUP_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.group;
  }

  return 'advanced';
}

/**
 * Whether the current value object has a meaningful entry for `fieldName`.
 * Treats `null`, `undefined`, empty string, empty array and empty object as absent.
 *
 * @param {object} value - the current values object
 * @param {string} fieldName - top-level property name
 * @returns {boolean}
 */
export function isFieldPresent(value, fieldName) {
  if (!value || typeof value !== 'object') return false;
  if (!(fieldName in value)) return false;
  const v = value[fieldName];
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/**
 * Build the ordered FieldGroup spec for an object.
 *
 * @param {string} type - the object type (e.g. 'dimension') — passed through to
 *   the returned spec as `objectType` so the collapse-persistence key can be
 *   formed (`{objectType}.{groupId}`).
 * @param {object} schema - the schema slice for the object (a `$defs/<Type>`
 *   entry; may carry `$defs` for ref resolution downstream).
 * @param {object} value - the current values object (drives present/expanded).
 * @returns {Array<{ id, label, icon, objectType, alwaysOpen, fields }>} ordered
 *   group specs; each `field` is `{ name, schema, required, present, expanded }`.
 */
export function buildGroupSpec(type, schema, value = {}) {
  const objectType = typeof type === 'string' ? type : '';
  const properties = (schema && schema.properties) || {};
  const required = new Set((schema && schema.required) || []);

  // Bucket fields by group id, preserving schema declaration order.
  const buckets = GROUP_ORDER.reduce((acc, id) => {
    acc[id] = [];
    return acc;
  }, {});

  Object.entries(properties).forEach(([name, fieldSchema]) => {
    if (HIDDEN_FIELDS.has(name)) return;

    const isRequired = required.has(name);
    const present = isFieldPresent(value, name);

    // Required fields always live in Essentials regardless of name mapping.
    const groupId = isRequired ? 'essentials' : groupForField(name);

    buckets[groupId].push({
      name,
      schema: fieldSchema,
      required: isRequired,
      present,
      // Required OR present → expanded (rendered up-front); else collapsed
      // behind the "+ N more" affordance.
      expanded: isRequired || present,
    });
  });

  // Emit only non-empty groups, in canonical order.
  return GROUP_ORDER.map(id => {
    const def = GROUP_BY_ID[id];
    const fields = buckets[id];
    if (fields.length === 0) return null;
    return {
      id,
      label: def.label,
      icon: def.icon,
      objectType,
      // Essentials is always-open so required fields can never be hidden.
      alwaysOpen: id === 'essentials',
      fields,
    };
  }).filter(Boolean);
}

export default buildGroupSpec;
