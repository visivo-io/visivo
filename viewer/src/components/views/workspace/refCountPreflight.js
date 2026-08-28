/**
 * refCountPreflight — "does this field have the right NUMBER of refs?"
 *
 * The sibling of `refPreflight`, which asks whether each ref points at
 * something real. This one asks whether there are enough of them, or too many:
 *
 *   - `minRefs` — a project-level metric/dimension expression must name a
 *     model, because that reference is the only thing tying it to a source.
 *     `count(*)` saves fine and then stops the whole project parsing.
 *   - `maxRefs` — a metric/dimension nested INSIDE a model must contain none;
 *     `sql_model.py` rejects any ref outright.
 *
 * Both bounds come from `fieldTypes.js`, so the rule has one home. The point of
 * doing it here rather than only server-side is placement: this returns the
 * same `{path, message}` shape as the other pre-flight layers, so the message
 * lands UNDER the field it is about — the way "Condition is required" does —
 * instead of as a form-level banner detached from the input that caused it.
 *
 * FAILS OPEN on anything it cannot judge: an unknown type/field, or a field
 * with no declared bounds. The backend validator stays authoritative.
 */

import { fieldTypeFor } from '../common/fieldTypes';
import { extractRefNames } from '../../../utils/refString';

const SKIP = { valid: true, errors: [] };

/** The fields carrying ref-count bounds, by object type. */
const BOUNDED_FIELDS = {
  metric: ['expression'],
  dimension: ['expression'],
  relation: ['condition'],
};

const countRefs = value => (typeof value === 'string' ? extractRefNames(value).length : 0);

const tooFewMessage = (objectType, field, min) => {
  if (objectType === 'metric' || objectType === 'dimension') {
    return (
      `A project-level ${objectType} must reference at least one model — ` +
      `e.g. \${ref(model_name).column}. Only a ${objectType} defined inside a ` +
      `model can omit references, because nesting is what ties it to a source.`
    );
  }
  return `${field} must reference at least ${min} object${min === 1 ? '' : 's'}.`;
};

const tooManyMessage = (objectType, max) => {
  if (max === 0) {
    return (
      `A ${objectType} defined inside a model cannot use \${ref()} — ` +
      `write plain SQL over the parent model’s columns.`
    );
  }
  return `Use at most ${max} reference${max === 1 ? '' : 's'}.`;
};

/**
 * Check every ref-bounded field on a config against its registry entry.
 *
 * @param {string} objectType 'metric' | 'dimension' | 'relation' | …
 * @param {object} config the config that would be persisted
 * @param {object} [opts]
 * @param {boolean} [opts.nested] the object is defined UNDER a model, which
 *   swaps in a different grammar for the same field name
 * @returns {{valid: boolean, errors: Array<{path:string,message:string,keyword:'refCount'}>}}
 */
export function checkRefCounts(objectType, config, { nested = false } = {}) {
  if (!objectType || !config || typeof config !== 'object') return SKIP;
  const fields = BOUNDED_FIELDS[objectType];
  if (!fields) return SKIP;

  const errors = [];
  for (const field of fields) {
    const rule = fieldTypeFor(objectType, field, { nested });
    if (!rule) continue;
    const value = config[field];
    // An absent/empty expression is the `required` rule's business, not this
    // one — reporting both would put two errors on one field.
    if (typeof value !== 'string' || !value.trim()) continue;

    const count = countRefs(value);
    if (rule.minRefs > 0 && count < rule.minRefs) {
      errors.push({
        path: field,
        message: tooFewMessage(objectType, field, rule.minRefs),
        keyword: 'refCount',
      });
    } else if (rule.maxRefs !== null && rule.maxRefs !== undefined && count > rule.maxRefs) {
      errors.push({
        path: field,
        message: tooManyMessage(objectType, rule.maxRefs),
        keyword: 'refCount',
      });
    }
  }

  return errors.length === 0 ? SKIP : { valid: false, errors };
}

export default checkRefCounts;
