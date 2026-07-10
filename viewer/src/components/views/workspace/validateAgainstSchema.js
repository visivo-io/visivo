/**
 * validateAgainstSchema (VIS-993 layer 1)
 *
 * $defs-driven config validation — the schema half of the validation-as-save
 * gate. Under runs-on-changes every persisted data-resource save fires a real
 * DAG run, and in cloud a failed run 409-blocks Commit, so nothing invalid may
 * reach the draft cache: `useRecordSave` consults this module before handing a
 * config to the type's `saveX` action.
 *
 * Validates against the bundled `visivo_project_schema.json` `$defs` slice for
 * the type — the SAME snapshot the schema-form engine (VIS-991) renders from,
 * so what the form shows and what the gate enforces cannot drift. One shared
 * AJV 2020-12 instance with per-type compiled-validator caching (the
 * plotlyValidator pattern; strict:false tolerates Pydantic's extra keywords).
 *
 * Fail-open policy: unknown types, unloadable schema, or nothing-to-validate
 * return `{ valid: true, skipped: true }` — the backend Pydantic validator
 * remains authoritative (§0.5 #19); this gate only ever ADDS protection, never
 * bricks a save path the backend would accept.
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { getDefNameForType, preloadProjectSchema, getObjectSchema } from '../../../schemas/projectSchema';
import { validateProps } from '../../../schemas/plotlyValidator';

let ajv = null;

// Compiled validators keyed by $defs name.
const validatorCache = new Map();

// Synthetic id the root schema is registered under. The $defs graph embeds a
// NESTED $id (the trace-properties schema Insight.props points at), so slices
// cannot be compiled independently — the second compile would re-register that
// nested id ("resolves to more than one schema"). Instead the ROOT is added to
// AJV exactly once and every per-type validator is a $ref wrapper into it.
const ROOT_ID = 'visivo://project-schema';

// Whether the root schema has been registered with AJV (enables the sync path).
let rootReady = false;

const freshAjv = () => {
  // unicodeRegExp:false — the Pydantic-generated ref patterns contain escapes
  // (\" and \-) that Python's `re` accepts but JS rejects under the `u` flag
  // AJV otherwise applies; compiling without `u` treats them as identity
  // escapes, matching the backend's semantics.
  // logger:false — the generated schema annotates secrets with the JSON-Schema
  // UI format "password", which ajv-formats doesn't know; the warning is noise
  // (formats are annotation-only here) and would trip test console guards.
  const instance = new Ajv2020({
    strict: false,
    allErrors: true,
    unicodeRegExp: false,
    logger: false,
  });
  addFormats(instance);
  return instance;
};

/** '/items/0/width' -> 'items.0.width'; '' stays '' (root-level). */
const toDotPath = instancePath =>
  instancePath ? instancePath.replace(/^\//, '').replace(/\//g, '.') : '';

/**
 * Normalise AJV errors into the gate's shape. For `required` and
 * `additionalProperties` the offending property name is folded into the
 * message so forms can render it without digging into AJV params.
 */
const normalizeErrors = ajvErrors =>
  (ajvErrors || []).map(err => {
    let path = toDotPath(err.instancePath);
    let message = err.message || 'invalid value';
    if (err.keyword === 'required' && err.params?.missingProperty) {
      message = `must have required property '${err.params.missingProperty}'`;
    } else if (err.keyword === 'additionalProperties' && err.params?.additionalProperty) {
      message = `unknown property '${err.params.additionalProperty}'`;
      path = path ? `${path}.${err.params.additionalProperty}` : err.params.additionalProperty;
    }
    return { path, message, keyword: err.keyword };
  });

/**
 * anyOf unions (Ref-string vs embedded-object arms) produce one error per
 * failed arm plus the anyOf wrapper — noise for a form. Keep the wrapper's
 * siblings only when no more specific error exists at the same path.
 */
const dedupeUnionNoise = errors => {
  const anyOfPaths = new Set(errors.filter(e => e.keyword === 'anyOf').map(e => e.path));
  if (anyOfPaths.size === 0) return errors;
  return errors.filter(e => {
    if (e.keyword === 'anyOf') return true;
    // Drop per-arm errors that sit at or under a failed union — the union
    // error is the actionable one ("does not match any allowed form").
    for (const p of anyOfPaths) {
      if (e.path === p || (p && e.path.startsWith(`${p}.`))) return false;
    }
    return true;
  });
};

const registerRoot = defs => {
  if (rootReady) return;
  ajv = freshAjv();
  // The Pydantic generator stamps the SAME nested $id
  // (https://visivo.io/trace-properties/schema) on all 51 trace-type defs.
  // Nothing $refs those URIs (verified: zero absolute refs in the snapshot),
  // but AJV refuses to register a document where one id resolves to more than
  // one schema — so strip every nested $id before registration.
  const stripped = JSON.parse(
    JSON.stringify(defs, (key, value) => (key === '$id' ? undefined : value))
  );
  // PERFORMANCE: Insight.props is a 51-arm union of the full Plotly trace
  // defs. Validating an INVALID props object against it explores every arm
  // (allErrors) — hundreds of ms on the UI thread per gate check, and it
  // cascades into Chart via embedded insights. The union is relaxed to a
  // plain object here; props precision comes from the per-type
  // plotlyValidator (validateRecordConfig runs it for insights when
  // props.type is present), which compiles ONE trace schema instead.
  if (stripped.Insight?.properties?.props) {
    stripped.Insight.properties.props = { type: 'object' };
  }
  ajv.addSchema({ $defs: stripped, $id: ROOT_ID });
  rootReady = true;
};

const compileForDef = defName => {
  if (validatorCache.has(defName)) return validatorCache.get(defName);
  const validate = ajv.compile({ $ref: `${ROOT_ID}#/$defs/${defName}` });
  validatorCache.set(defName, validate);
  return validate;
};

const runValidator = (validate, config) => {
  const ok = validate(config);
  if (ok) return { valid: true, errors: [] };
  return { valid: false, errors: dedupeUnionNoise(normalizeErrors(validate.errors)) };
};

const SKIP = { valid: true, errors: [], skipped: true };

/**
 * Fail-open guard for gate-internal work (VIS-993 canvas-persist regression).
 * The module's contract is that internal failures NEVER produce a rejection
 * or a throw — a crashed gate must yield SKIP so persistence proceeds and the
 * backend Pydantic validator stays authoritative. Before this guard, an error
 * inside registerRoot/runValidator REJECTED the async gate promise; every
 * call site consumed the gate with a bare `.then`, so the save was silently
 * swallowed: the optimistic UI applied but nothing persisted and not even the
 * blocked-telemetry fired (the "canvas resize doesn't save" field failure).
 */
const failOpen = (label, fn) => {
  try {
    return fn();
  } catch (err) {
    console.error(`validateAgainstSchema: ${label} failed — failing open`, err);
    return SKIP;
  }
};

/**
 * Authoritative (async) validation of a record config against its $defs slice.
 *
 * @param {string} type   canonical object type ('dimension', 'markdown', …)
 * @param {object} config the config that would be persisted
 * @returns {Promise<{valid: boolean, errors: Array<{path:string,message:string,keyword:string}>, skipped?: boolean}>}
 */
export async function validateRecordConfig(type, config) {
  if (config === undefined || config === null) return SKIP;
  const defName = getDefNameForType(type);
  if (!defName) return SKIP;

  let validate = validatorCache.get(defName);
  if (!validate) {
    if (!rootReady) {
      // getObjectSchema returns the $defs-attached slice (and caches it) —
      // its $defs IS the full graph, which we register once. Registration
      // errors FAIL OPEN (see failOpen): a rejection here used to silently
      // swallow the caller's save.
      const slice = await getObjectSchema(type);
      if (!slice?.$defs) return SKIP;
      const registered = failOpen('registerRoot', () => {
        registerRoot(slice.$defs);
        return true;
      });
      if (registered !== true) return SKIP;
    }
    try {
      validate = compileForDef(defName);
    } catch (err) {
      // A schema AJV can't compile must not brick saving — backend stays
      // authoritative.
      console.error(`validateAgainstSchema: compile failed for ${defName}`, err);
      return SKIP;
    }
  }
  const structural = failOpen('validate', () => runValidator(validate, config));

  // Insight props precision: the registered graph relaxes props to a plain
  // object (see registerRoot), so run the per-type Plotly validator here and
  // merge its dot-path errors under 'props.'.
  if (defName === 'Insight' && config?.props?.type) {
    try {
      const propsResult = await validateProps(config.props.type, config.props);
      if (propsResult && propsResult.valid === false) {
        const propErrors = (propsResult.errors || []).map(e => ({
          path: e.path ? `props.${e.path}` : 'props',
          message: e.message || 'invalid value',
          keyword: e.keyword || 'props',
        }));
        return { valid: false, errors: [...structural.errors, ...propErrors] };
      }
    } catch (err) {
      // Plotly schema unavailable for the type — structural result stands.
    }
  }
  return structural;
}

/**
 * Sync fast path for inline UX (mark fields the moment the user types).
 * Returns null when the schema isn't loaded yet — callers defer to the
 * async gate at persist time.
 *
 * @returns {{valid:boolean,errors:Array}|null}
 */
export function validateRecordConfigSync(type, config) {
  if (config === undefined || config === null) return SKIP;
  const defName = getDefNameForType(type);
  if (!defName) return SKIP;

  let validate = validatorCache.get(defName);
  if (!validate) {
    if (!rootReady) return null;
    try {
      validate = compileForDef(defName);
    } catch (err) {
      console.error(`validateAgainstSchema: compile failed for ${defName}`, err);
      return SKIP;
    }
  }
  return failOpen('validate', () => runValidator(validate, config));
}

/**
 * Warm the schema + make the sync fast path available (e.g. on workspace
 * mount). Safe to call repeatedly.
 */
export async function preloadValidationSchema() {
  await preloadProjectSchema();
  if (!rootReady) {
    // Any type resolves the root; 'dimension' is a stable mapping.
    const slice = await getObjectSchema('dimension');
    if (slice?.$defs) {
      failOpen('registerRoot (preload)', () => {
        registerRoot(slice.$defs);
        return true;
      });
    }
  }
}

/** Test seam: drop compiled validators + the registered root. */
export function clearValidationCache() {
  validatorCache.clear();
  rootReady = false;
  ajv = null;
}
