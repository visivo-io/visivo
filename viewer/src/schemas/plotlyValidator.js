/**
 * Plotly Trace Prop Validator (VIS-1020 §4)
 *
 * Validates a chart's `props` object against the committed per-type Plotly JSON
 * schema (draft 2020-12) loaded by schemas.js. Uses a single shared AJV 2020
 * instance and caches the compiled validator per chart type (mirrors the
 * `schemaCache` style in schemas.js).
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { getSchema } from './schemas';

// One shared AJV instance for all per-type schemas.
// - strict:false   -> tolerate Plotly's non-standard keywords (editType, etc.)
// - allErrors:true -> collect every violation, not just the first
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

// Module-level cache of compiled validators, keyed by chart type.
// Mirrors the schemaCache pattern in schemas.js.
const validatorCache = new Map();

/**
 * Convert an AJV instancePath ('/marker/line/width') into a dot-path
 * ('marker.line.width'). Strips the leading slash and joins segments with '.'.
 * Returns '' for root-level errors (instancePath === '').
 * @param {string} instancePath
 * @returns {string}
 */
function instancePathToDotPath(instancePath) {
  if (!instancePath) return '';
  return instancePath
    .split('/')
    .filter(Boolean)
    .join('.');
}

/**
 * Build a human-readable message from an AJV error, augmenting enum errors with
 * their allowed values and additionalProperties errors with the offending key.
 * @param {object} error - an AJV error object
 * @returns {string}
 */
function formatErrorMessage(error) {
  const base = error.message || 'is invalid';

  if (error.keyword === 'enum' && error.params?.allowedValues) {
    return `${base} (${error.params.allowedValues.join(', ')})`;
  }

  if (error.keyword === 'additionalProperties' && error.params?.additionalProperty) {
    return `${base} (${error.params.additionalProperty})`;
  }

  return base;
}

/**
 * Get (and cache) the compiled AJV validator for a chart type.
 * @param {string} type - chart type (e.g. 'scatter')
 * @returns {Promise<Function|null>} compiled validate fn, or null if no schema
 */
async function getValidator(type) {
  if (validatorCache.has(type)) {
    return validatorCache.get(type);
  }

  const schema = await getSchema(type);
  if (!schema) {
    return null;
  }

  // All committed per-type Plotly schemas share an IDENTICAL top-level `$id`
  // (https://visivo.io/trace-properties/schema). AJV registers every compiled
  // schema by `$id` in the shared instance's registry, so compiling a SECOND
  // distinct type would throw "schema with key or id ... already exists" — which
  // silently kills validation after the first type-switch (VIS-1020 review fix).
  // Strip the shared `$id` before compiling; the schemas' internal refs are
  // relative (`#/$defs/...`) and resolve without it. Cached per type below.
  const { $id, ...schemaWithoutId } = schema;
  const validate = ajv.compile(schemaWithoutId);
  validatorCache.set(type, validate);
  return validate;
}

/**
 * Validate a Plotly trace `props` object against its per-type schema.
 *
 * The `props` object may include a `type` key; the Plotly schema declares a
 * `type` property, so it validates cleanly. Validation walks the full nested
 * tree, so style props at any depth (e.g. marker.line.width, line.dash) are
 * checked and reported with their full dot-path.
 *
 * @param {string} type - chart type (e.g. 'scatter', 'bar')
 * @param {object} props - the trace props object to validate
 * @returns {Promise<{valid: boolean, errors: Array<{path: string, message: string}>}>}
 */
export async function validateProps(type, props) {
  const validate = await getValidator(type);

  if (!validate) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Unknown chart type' }],
    };
  }

  const valid = validate(props);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors || []).map(error => ({
    path: instancePathToDotPath(error.instancePath),
    message: formatErrorMessage(error),
  }));

  return { valid: false, errors };
}

/**
 * Clear the compiled-validator cache (for tests).
 */
export function clearValidatorCache() {
  validatorCache.clear();
}
