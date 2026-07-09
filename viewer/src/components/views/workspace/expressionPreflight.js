/**
 * expressionPreflight (VIS-993 layer 2, async half)
 *
 * SQL parse validation for expression-bearing fields — the piece of the
 * semantic pre-flight the schema cannot see: `AVG(value)}` is a perfectly
 * valid STRING per the $defs, but sqlglot rejects it, so under
 * runs-on-changes it would cache fine and then fail a real DAG run (in
 * cloud, blocking Commit on run_failed).
 *
 * Runs at fire time inside useRecordSave's async gate (network call — never
 * in the sync path). The backend endpoint substitutes Visivo context tokens
 * (${ref(m).col}) before parsing, so composite metrics and ref-bearing
 * relation conditions validate correctly.
 *
 * Fail-open policy: no expression fields for the type, empty values (the
 * schema owns required-ness), endpoint unavailable (dist/cloud), or network
 * failure → { valid: true, skipped: true }. Successful verdicts are cached
 * per (type, field, expression) so a debounce cadence costs one POST per
 * distinct value; failures to REACH the endpoint are never cached.
 */

import { validateExpressions } from '../../../api/expressions';

// The fields per object type whose string values must parse as SQL.
const EXPRESSION_FIELDS = {
  metric: ['expression'],
  dimension: ['expression'],
  relation: ['condition'],
};

const SKIP = { valid: true, errors: [], skipped: true };

// verdict cache: `${type}:${field}:${dialect}:${expression}` → {valid, error}.
// The dialect is part of the key: the same expression can parse under one source
// dialect and fail under another, so verdicts must not collide across dialects.
const cache = new Map();
const CACHE_MAX = 200;

const cacheKey = (type, field, expression, sourceDialect) =>
  `${type}:${field}:${sourceDialect || 'duckdb'}:${expression}`;

const remember = (key, verdict) => {
  if (cache.size >= CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, verdict);
};

/** Test seam + project-switch invalidation (cleared with the schema caches). */
export function clearExpressionCache() {
  cache.clear();
}

/**
 * Validate the expression-bearing fields of a record config.
 *
 * @param {string} type    canonical object type ('metric', 'dimension', 'relation')
 * @param {object} config  the config that would be persisted
 * @param {string} [sourceDialect]  optional dialect hint for the backend parser
 * @returns {Promise<{valid: boolean, errors: Array<{path:string,message:string,keyword:'expression'}>, skipped?: boolean}>}
 */
export async function checkExpressions(type, config, sourceDialect) {
  const fields = EXPRESSION_FIELDS[type];
  if (!fields || !config) return SKIP;

  const pending = [];
  const errors = [];
  for (const field of fields) {
    const value = config[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    const key = cacheKey(type, field, value, sourceDialect);
    const cached = cache.get(key);
    if (cached) {
      if (!cached.valid) {
        errors.push({ path: field, message: cached.error, keyword: 'expression' });
      }
      continue;
    }
    pending.push({ field, value, key });
  }

  if (pending.length === 0 && errors.length === 0) {
    // Both conjuncts of the enclosing `if` are already true here, so the only
    // remaining question is whether the record has ANY expression field set.
    return !fields.some(f => config[f]) ? SKIP : { valid: true, errors: [] };
  }

  if (pending.length > 0) {
    let response;
    try {
      response = await validateExpressions(
        pending.map(p => ({ name: p.field, expression: p.value })),
        sourceDialect
      );
    } catch (err) {
      // Endpoint unreachable — never block on a check we couldn't run, and
      // never cache the non-verdict.
      return errors.length === 0 ? SKIP : { valid: false, errors };
    }

    // A well-behaved endpoint returns { results: [...] }, but never trust the
    // shape: a malformed 200 body (results absent, an object, or holding
    // nullish entries) must not throw out of this pre-flight — that would
    // reject the whole save (the backend stays authoritative). Treat an
    // unusable body exactly like an unreachable endpoint: fail open.
    const rawResults = Array.isArray(response?.results) ? response.results : null;
    if (!rawResults) {
      return errors.length === 0 ? SKIP : { valid: false, errors };
    }
    const byName = new Map(
      rawResults.filter(r => r && typeof r === 'object' && 'name' in r).map(r => [r.name, r])
    );
    for (const p of pending) {
      const result = byName.get(p.field);
      if (!result) continue;
      const verdict = {
        valid: result.valid !== false,
        error: result.error || 'Expression does not parse',
      };
      remember(p.key, verdict);
      if (!verdict.valid) {
        errors.push({ path: p.field, message: verdict.error, keyword: 'expression' });
      }
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}
