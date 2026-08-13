import { getUrl, isAvailable } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

/**
 * Wrapper around fetch that provides meaningful error messages for network failures.
 * When fetch() itself throws (e.g. server crashed, connection refused), the browser
 * gives a generic "Failed to fetch" TypeError. This wraps it with context.
 */
const fetchWithContext = async (url, options, context) => {
  try {
    return await apiFetch(url, options);
  } catch (err) {
    throw new Error(`${context}: server unreachable at ${url} (${err.message})`);
  }
};

/**
 * Parse error response body, handling both JSON {"message": "..."} and plain text.
 */
const parseErrorResponse = async response => {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return json.message || text;
    } catch {
      return text;
    }
  } catch {
    return response.statusText;
  }
};

/**
 * Fetch list of all sources with cached schema availability
 * @returns {Promise<Object[]>} Array of source objects with schema metadata
 */
export const fetchSourceSchemaJobs = async (projectId = null) => {
  if (!isAvailable('sourceSchemaJobsList')) {
    console.warn('Source schema jobs endpoint not available in this environment');
    return [];
  }

  const url = withProjectId(getUrl('sourceSchemaJobsList'), projectId);
  const response = await fetchWithContext(url, undefined, 'Loading sources');

  if (!response.ok) {
    const errorDetail = await parseErrorResponse(response);
    throw new Error(`Loading sources failed (${response.status}): ${errorDetail}`);
  }

  return response.json();
};

/**
 * Fetch cached schema for a specific source
 * @param {string} sourceName - Name of the source
 * @param {string} runId - Optional run_id to fetch from specific version (main vs preview)
 * @returns {Promise<Object|null>} Schema data or null if not cached
 */
export const fetchSourceSchema = async (sourceName, runId = null, projectId = null) => {
  if (!isAvailable('sourceSchemaJobDetail')) {
    console.warn('Source schema endpoint not available in this environment');
    return null;
  }

  let url = withProjectId(
    getUrl('sourceSchemaJobDetail', { identifier: sourceName }),
    projectId
  );
  if (runId) {
    url += `?run_id=${encodeURIComponent(runId)}`;
  }
  const response = await fetchWithContext(url, undefined, `Loading schema for '${sourceName}'`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorDetail = await parseErrorResponse(response);
    throw new Error(
      `Loading schema for '${sourceName}' failed (${response.status}): ${errorDetail}`
    );
  }

  return response.json();
};

/**
 * Trigger on-demand schema generation for a source
 * @param {string} sourceName - Name of the source
 * @returns {Promise<Object>} Object containing run_id
 */
export const generateSourceSchema = async (sourceName, projectId = null) => {
  if (!isAvailable('sourceSchemaJobsList')) {
    throw new Error('Schema generation not available in this environment');
  }

  // POST to the collection — same path the list GET uses.
  const url = withProjectId(getUrl('sourceSchemaJobsList'), projectId);
  const response = await fetchWithContext(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: { source_name: sourceName },
        run: true,
      }),
    },
    `Generating schema for '${sourceName}'`
  );

  if (!response.ok) {
    const errorDetail = await parseErrorResponse(response);
    throw new Error(
      `Generating schema for '${sourceName}' failed (${response.status}): ${errorDetail}`
    );
  }

  return response.json();
};

/**
 * Fetch the status of a schema generation run
 * @param {string} runId - Run ID from generateSourceSchema
 * @returns {Promise<Object>} Run status object
 */
export const fetchSchemaGenerationStatus = async (runId, projectId = null) => {
  if (!isAvailable('sourceSchemaJobDetail')) {
    throw new Error('Schema generation status not available in this environment');
  }

  // Same route as fetchSourceSchema: the server's detail segment is an
  // `<identifier>` that accepts either a source name or a run id.
  const url = withProjectId(getUrl('sourceSchemaJobDetail', { identifier: runId }), projectId);
  const response = await fetchWithContext(url, undefined, 'Checking schema generation status');

  if (!response.ok) {
    const errorDetail = await parseErrorResponse(response);
    throw new Error(`Schema generation status check failed (${response.status}): ${errorDetail}`);
  }

  return response.json();
};

// ---------------------------------------------------------------------------
// Deriving the sliced shapes from a whole envelope
//
// `fetchSourceSchema` returns the entire stored envelope, which already
// contains everything the `/tables/` and `/tables/<t>/columns/` endpoints
// return — those endpoints load the same record and throw most of it away.
//
// A caller that needs EVERY column (the ERD, SQL autocomplete) is therefore
// strictly better off fetching once and slicing here: one request instead of
// 1 + N. The tree browser still uses the endpoints, because it shows a few of
// many tables and a wide warehouse envelope is ~840KB at 300 tables.
//
// These reproduce the server's shapes exactly, so a caller can be repointed
// without changing how it reads the result.
// ---------------------------------------------------------------------------

/** `[{name, column_count, metadata}]`, matching `GET .../<name>/tables/`. */
export const tablesFromEnvelope = (envelope, { search = '' } = {}) => {
  const tables = (envelope || {}).tables || {};
  const needle = (search || '').trim().toLowerCase();
  return Object.entries(tables)
    .filter(([name]) => !needle || name.toLowerCase().includes(needle))
    .map(([name, table]) => ({
      name,
      column_count: Object.keys((table || {}).columns || {}).length,
      metadata: (table || {}).metadata || {},
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

/**
 * Non-fatal problems hit while the schema was built, as `[string]`.
 *
 * A schema job succeeds when it could connect, even if some tables could not
 * be reflected — failing outright would block every downstream job over a
 * permissions error on one table. The cost of that choice is that a partial
 * result looks exactly like a complete one, so these have to be shown next to
 * the tables rather than left in the envelope.
 */
export const warningsFromEnvelope = envelope => {
  const errors = ((envelope || {}).metadata || {}).errors;
  return Array.isArray(errors) ? errors.filter(Boolean) : [];
};

/**
 * `[{name, type, nullable}]` for one table, matching
 * `GET .../<name>/tables/<table>/columns/`. Unknown table -> `[]`, the same
 * answer the endpoint gives.
 */
export const columnsFromEnvelope = (envelope, tableName, { search = '' } = {}) => {
  const table = ((envelope || {}).tables || {})[tableName] || {};
  const columns = table.columns || {};
  const needle = (search || '').trim().toLowerCase();
  return Object.entries(columns)
    .filter(([name]) => !needle || name.toLowerCase().includes(needle))
    .map(([name, meta]) => ({
      name,
      type: (meta || {}).type,
      nullable: (meta || {}).nullable ?? true,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};
