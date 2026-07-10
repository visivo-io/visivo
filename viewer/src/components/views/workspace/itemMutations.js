/**
 * itemMutations (VIS-993 §3) — dashboard structure configs, born valid.
 *
 * The single module through which Item/Row configs are CREATED and MUTATED by
 * the editing surfaces (ItemEditForm / RowEditForm / DashboardEditForm /
 * RightRailEditPanel / the canvas commit path). Every helper returns a config
 * the backend Item/Row validators accept as-is:
 *
 *   - an empty slot is a bare `{ width }` — NEVER `{ chart: '', table: '', … }`
 *     (the backend counts an empty string as "set" and rejects >1 leaf), and
 *     NEVER a `selector` key (`selector` is not an Item field; extra='forbid'
 *     400s it);
 *   - setting a leaf clears every competing leaf field AND `rows` (the
 *     `validate_unique_item_types` mutual exclusion) and writes the serialized
 *     `${ref(name)}` context form via formatRefExpression;
 *   - a new row always holds one empty slot, so it renders as a visible,
 *     droppable placeholder (VIS-989) instead of collapsing;
 *   - widths are normalized to integers ≥ 1 (the schema types `width` as
 *     integer — a raw `e.target.value` string must never persist).
 *
 * Because configs are born valid here, `sanitizeDashboardConfig` is retired:
 * the dashboard-structure save path only VERIFIES (validateAgainstSchema) —
 * it never repairs. All helpers are pure and never mutate their inputs.
 */

import { formatRefExpression } from '../../../utils/refString';
import { validateRecordConfig, validateRecordConfigSync } from './validateAgainstSchema';

/** The four mutually-exclusive leaf ref fields on a dashboard Item. */
export const LEAF_REF_FIELDS = ['chart', 'table', 'markdown', 'input'];

// `rows` shares the mutual exclusion with the leaf fields; `selector` is the
// legacy non-model scaffold key. All are dropped when a slot is (re)written.
const EXCLUSIVE_FIELDS = [...LEAF_REF_FIELDS, 'rows', 'selector'];

/** Normalize any raw width input to a valid integer ≥ 1 (schema: integer). */
const normalizeWidth = raw => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

/**
 * Copy `item` without its leaf/container/selector fields, normalizing `width`
 * when present. The shared base for every slot rewrite below.
 */
const bareSlot = item => {
  if (!item || typeof item !== 'object') return { width: 1 };
  const clean = { ...item };
  for (const field of EXCLUSIVE_FIELDS) delete clean[field];
  if ('width' in clean) clean.width = normalizeWidth(clean.width);
  return clean;
};

/**
 * A fresh empty layout slot: `{ width }` with no leaf keys at all.
 * @param {number|string} [width=1]
 */
export const createEmptyItem = (width = 1) => ({ width: normalizeWidth(width) });

/**
 * A fresh row holding ONE empty slot — a new row is never created with an
 * empty `items` array, so it stays a visible drop target (VIS-989).
 * @param {{height?: string|number, width?: number|string}} [opts]
 */
export const createRow = ({ height = 'medium', width = 1 } = {}) => ({
  height,
  items: [createEmptyItem(width)],
});

/** Clear the item's leaf/container fields, yielding a valid empty slot. */
export const clearItemLeaf = item => bareSlot(item);

/**
 * Point the item at the named leaf object, enforcing the backend's mutual
 * exclusion: every competing leaf field + `rows` is cleared first, then the
 * single `<type>: ${ref(name)}` ref is written (formatRefExpression form).
 * An unknown type or blank name degrades to a cleared slot — this module can
 * never emit an empty-string leaf or a non-model key.
 *
 * @param {object} item     the current item config.
 * @param {string} type     one of LEAF_REF_FIELDS.
 * @param {string} refName  the referenced object's name.
 */
export const setItemLeaf = (item, type, refName) => {
  const next = bareSlot(item);
  const name = typeof refName === 'string' ? refName.trim() : '';
  if (!LEAF_REF_FIELDS.includes(type) || !name) return next;
  next[type] = formatRefExpression(name);
  return next;
};

/**
 * Apply a RefDropZone-style `{ type, name } | null` change: a full ref sets
 * the leaf, anything else clears it.
 */
export const applyLeafRef = (item, ref) =>
  ref && ref.type && ref.name ? setItemLeaf(item, ref.type, ref.name) : clearItemLeaf(item);

/**
 * Turn the item into a row-container: the slot keeps its width and gains one
 * valid nested row (with its own empty slot); any leaf ref is dropped.
 */
export const convertItemToContainer = item => ({
  width: normalizeWidth(item?.width ?? 1),
  rows: [createRow()],
});

/** Collapse the item back to a bare empty leaf slot, preserving its width. */
export const convertItemToLeaf = item => ({ width: normalizeWidth(item?.width ?? 1) });

/**
 * Append one empty slot to the row's `items` (the "Add Item" affordance).
 * A rows-less/nullish input yields a fresh valid row.
 */
export const appendEmptyItem = row => {
  const base = row && typeof row === 'object' ? row : { height: 'medium' };
  const items = Array.isArray(base.items) ? base.items : [];
  return { ...base, items: [...items, createEmptyItem()] };
};

const isBlank = value => typeof value === 'string' && value.trim() === '';

// The five fields sharing the backend's `validate_unique_item_types` mutual
// exclusion (`rows` included; `selector` is NOT a model field at all).
const UNIQUE_TYPE_FIELDS = [...LEAF_REF_FIELDS, 'rows'];

const EXCLUSIVITY_MESSAGE =
  'only one of the "markdown", "chart", "table", "input", or "rows" properties should be set on an item';

/**
 * checkLeafExclusivity — the semantic half of the dashboard-structure gate
 * (VIS-993 §3). The backend rejects any item with MORE than one of
 * chart/table/markdown/input/rows set, but that rule is a Pydantic
 * model_validator with no JSON-schema encoding, so the AJV gate can't see it.
 * This walk mirrors the backend's `is not None` semantics exactly — an empty
 * string COUNTS as set — and reports errors in the gate's `{path, message,
 * keyword}` shape. Fails open on malformed input (backend stays authoritative).
 *
 * @param {object} config a dashboard config ({ rows, … }).
 * @returns {{valid: boolean, errors: Array<{path:string,message:string,keyword:string}>}}
 */
export const checkLeafExclusivity = config => {
  const errors = [];
  const walkItems = (items, basePath) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, ii) => {
      if (!item || typeof item !== 'object') return;
      const path = `${basePath}.items.${ii}`;
      const setCount = UNIQUE_TYPE_FIELDS.filter(
        field => item[field] !== null && item[field] !== undefined
      ).length;
      if (setCount > 1) {
        errors.push({ path, message: EXCLUSIVITY_MESSAGE, keyword: 'exclusive' });
      }
      if (Array.isArray(item.rows)) walkRows(item.rows, path);
    });
  };
  const walkRows = (rows, basePath) => {
    rows.forEach((row, ri) => {
      if (!row || typeof row !== 'object') return;
      walkItems(row.items, basePath ? `${basePath}.rows.${ri}` : `rows.${ri}`);
    });
  };
  if (config && typeof config === 'object' && Array.isArray(config.rows)) {
    walkRows(config.rows, '');
  }
  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
};

/**
 * runDashboardConfigGate — the ONE shared gate runner for dashboard-structure
 * persistence (VIS-993 §3). Both the canvas commit path (commitCanvasConfig)
 * and the rail's structure-form path (RightRailEditPanel.persistConfig) route
 * their verdict through here so the sequencing — leaf exclusivity → sync
 * schema fast path → async authoritative schema — and, critically, the
 * FAIL-OPEN error handling can never drift between the two surfaces.
 *
 * `onResult(blocked)` is invoked EXACTLY ONCE: synchronously whenever a
 * verdict is available without an async hop, else after the authoritative
 * check settles. `blocked` is `null` when persistence may proceed, or the
 * `{ valid:false, errors }` verdict when the gate holds it.
 *
 * FAIL-OPEN (the canvas-persist regression): a gate that CRASHES — sync throw
 * or async rejection — must never swallow the save. Before this runner, the
 * call sites consumed `validateRecordConfig(...)` with a bare `.then`, so any
 * internal gate error left the commit in limbo: the optimistic UI applied,
 * telemetry fired, but nothing persisted and not even the blocked event was
 * emitted. A crashed gate now resolves `onResult(null)` (persist; the backend
 * Pydantic validator stays authoritative) with a console.error for
 * observability. Only a real `{ valid:false }` VERDICT blocks.
 *
 * @param {object} config     the dashboard config that would be persisted.
 * @param {Function} onResult receives `null` (persist) or the blocking verdict.
 */
export const runDashboardConfigGate = (config, onResult) => {
  // The mutual-exclusion rule is a backend model_validator with no
  // JSON-schema encoding — check it first (cheap, schema-free).
  const exclusivity = checkLeafExclusivity(config);
  if (!exclusivity.valid) {
    onResult(exclusivity);
    return;
  }
  let sync;
  try {
    sync = validateRecordConfigSync('dashboard', config);
  } catch (err) {
    console.error('runDashboardConfigGate: sync gate crashed — failing open', err);
    onResult(null);
    return;
  }
  if (sync) {
    onResult(sync.valid ? null : sync);
    return;
  }
  // Schema not loaded yet (null) — defer to the async authoritative check.
  validateRecordConfig('dashboard', config)
    .then(result => onResult(result.valid ? null : result))
    .catch(err => {
      console.error('runDashboardConfigGate: async gate crashed — failing open', err);
      onResult(null);
    });
};

/**
 * Write the item's width from raw form input, normalized to an integer ≥ 1 so
 * a mid-edit `e.target.value` string can never persist as a non-integer. Real
 * leaf refs are preserved; legacy blank leaf keys + the non-model `selector`
 * are dropped so a width edit can never carry an invalid scaffold forward.
 */
export const setItemWidth = (item, rawWidth) => {
  const next = item && typeof item === 'object' ? { ...item } : {};
  delete next.selector;
  for (const field of LEAF_REF_FIELDS) {
    if (isBlank(next[field])) delete next[field];
  }
  next.width = normalizeWidth(rawWidth);
  return next;
};
