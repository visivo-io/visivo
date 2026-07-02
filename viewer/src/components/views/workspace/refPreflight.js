/**
 * refPreflight (VIS-993 layer 2, sync half)
 *
 * Dangling-`ref()` detection — the semantic pre-flight in front of the
 * validation-as-save gate. A ref pointing at nothing is schema-valid but
 * doomed: under runs-on-changes it caches fine and then fails a real DAG run
 * (in cloud, blocking Commit on `run_failed`). Catching it client-side means
 * no save, no run, no red indicator.
 *
 * Blocking is HIGH-CONFIDENCE only: a name counts as dangling when it is
 * absent from the union of names across EVERY store collection, and at least
 * one collection is populated. When nothing is loaded (boot, lazy stores, a
 * trimmed test store) the check fails open — the backend and the run remain
 * the authoritative net, this gate only ever adds protection.
 */

import { COLLECTION_KEY } from './collectionKeys';
import { extractRefNames } from '../../../utils/refString';

// Full-string bare form (`ref(name)`), the pre-serialization shape the
// backend's RefStringType accepts. Embedded bare refs are deliberately NOT
// matched — inside SQL a bare `ref(` substring is too ambiguous; the
// serialized `${ref(...)}` context form is matched anywhere via
// extractRefNames.
const BARE_REF_PATTERN = /^ref\(\s*([^)]+)\s*\)$/;

/** Strip one layer of matching quotes: `'My Chart'` / `"My Chart"` → `My Chart`. */
const unquote = name => {
  const trimmed = name.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (trimmed.length >= 2 && first === last && (first === "'" || first === '"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const refNamesInString = value => {
  const names = extractRefNames(value).map(unquote);
  const bare = value.match(BARE_REF_PATTERN);
  if (bare) names.push(unquote(bare[1]));
  return names;
};

/**
 * The union of object names across every store collection. `null` when no
 * collection holds a single entry — the caller must fail open (we cannot
 * distinguish an empty project from not-yet-fetched stores).
 */
const knownNameUnion = state => {
  const union = new Set();
  for (const key of Object.values(COLLECTION_KEY)) {
    const list = state?.[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (entry?.name) union.add(entry.name);
    }
  }
  return union.size > 0 ? union : null;
};

const SKIP = { valid: true, errors: [], skipped: true };

/**
 * Walk a config and report every `ref()` whose target exists in no store
 * collection.
 *
 * @param {object} config the config that would be persisted
 * @param {object} state  the store state (useStore.getState())
 * @returns {{valid: boolean, errors: Array<{path:string,message:string,keyword:'ref'}>, skipped?: boolean}}
 */
export function checkRefTargets(config, state) {
  if (config === undefined || config === null) return SKIP;
  const union = knownNameUnion(state);
  if (!union) return SKIP;

  const errors = [];
  const walk = (node, path) => {
    if (typeof node === 'string') {
      for (const name of refNamesInString(node)) {
        if (!union.has(name)) {
          errors.push({
            path,
            message: `ref '${name}' does not match any existing object`,
            keyword: 'ref',
          });
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i)));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(config, '');

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}
