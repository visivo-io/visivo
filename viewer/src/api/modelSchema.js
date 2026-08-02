import { getUrl, isAvailable } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/**
 * A model's output columns, inferred on demand.
 *
 * This replaced `GET /api/model-schema-jobs/{name}/`, which read the artifact a
 * run had written — so a model that had never been run had no columns to give,
 * and callers got `{available: false}` with no way to tell "never run" from
 * "endpoint missing". The server now infers with SQLGlot against the source's
 * cached schema, touching no database, so the answer does not depend on a run
 * having happened.
 *
 * POST rather than GET because the draft form carries SQL in the body.
 */

/** Normalize a non-200 into the shape every caller already branches on. */
const unavailable = { available: false, columns: [] };

/**
 * Infer a saved model's output columns.
 *
 * @param {string} modelName
 * @param {object} [options]
 * @param {string} [options.sql] - Override the saved SQL (unsaved editor buffer).
 * @param {string} [options.sourceName] - Override the model's source.
 * @param {string} [options.projectId]
 * @returns {Promise<{available: boolean, columns: Array<{name, type, nullable}>,
 *                    source_name?: string, source_schema_cached?: boolean}>}
 */
export const fetchModelSchema = async (modelName, { sql, sourceName, projectId } = {}) => {
  if (!isAvailable('modelSchemaDetail')) {
    return unavailable;
  }

  const body = {};
  if (sql) body.sql = sql;
  if (sourceName) body.source_name = sourceName;

  const res = await apiFetch(
    withProjectId(getUrl('modelSchemaDetail', { name: modelName }), projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (res.status === 200) {
    return { available: true, ...(await res.json()) };
  }
  return unavailable;
};

/**
 * Infer output columns for SQL with no saved model behind it.
 *
 * The metric and dimension surfaces edit drafts, so the thing being asked about
 * may not exist as a saved object yet — the same reason the source
 * connection-test endpoint takes a config rather than a name.
 */
export const fetchDraftModelSchema = async (sql, sourceName, { projectId } = {}) => {
  if (!isAvailable('modelSchemasList')) {
    return unavailable;
  }

  const res = await apiFetch(withProjectId(getUrl('modelSchemasList'), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, source_name: sourceName }),
  });

  if (res.status === 200) {
    return { available: true, ...(await res.json()) };
  }
  return unavailable;
};

/**
 * Convenience: a model's column names as a string[].
 *
 * @returns {Promise<string[]>} Names, or [] when unavailable.
 */
export const fetchModelColumnNames = async (modelName, { projectId } = {}) => {
  const schema = await fetchModelSchema(modelName, { projectId });
  return (schema.columns || []).map(c => c.name);
};
