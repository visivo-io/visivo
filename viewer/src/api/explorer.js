import { pollJob } from './jobs';
import { apiFetch } from './utils';

/**
 * Run an on-demand job to completion: start it, then poll to a terminal state.
 *
 * Nothing here is specific to sources — any endpoint that answers
 * `202 {job_id}` and exposes its job at `<basePath><job_id>/` can use it, which
 * is the shape model-query-jobs already has.
 *
 * `response` is the already-issued start request, so callers keep control of
 * the method and body. Returns `{ok, result, error}`.
 */
const runOnDemandJob = async (basePath, response) => {
  if (response.status !== 202) {
    // A 4xx/5xx may carry a JSON reason, plain text, or nothing at all.
    let body = {};
    try {
      body = await response.json();
    } catch {
      // fall through to the generic message
    }
    return { ok: false, error: body?.error || body?.message || 'Server rejected the request' };
  }

  const { job_id: jobId } = await response.json();
  if (!jobId) return { ok: false, error: 'Server accepted the job but named no id' };

  return pollJob(async () => {
    const poll = await apiFetch(`${basePath}${jobId}/`);
    if (poll.status !== 200) throw new Error('Lost track of the job');
    return poll.json();
  });
};

export const fetchSourceMetadata = async () => {
  const path = '/api/project/sources_metadata/';
  const job = await runOnDemandJob(path, await apiFetch(path));
  return job.ok ? job.result : null;
};

// Lazy-loading API functions

export const fetchDatabases = async sourceName => {
  const response = await apiFetch(`/api/project/sources/${encodeURIComponent(sourceName)}/databases/`);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const fetchSchemas = async (sourceName, databaseName) => {
  const response = await apiFetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const fetchTables = async (sourceName, databaseName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables/`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables/`;

  const response = await apiFetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const testSourceConnection = async sourceName => {
  const response = await apiFetch(
    `/api/project/sources/${encodeURIComponent(sourceName)}/test-connection/`
  );
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};

export const testSourceConnectionFromConfig = async sourceConfig => {
  const path = '/api/sources/test-connection/';
  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sourceConfig),
  });
  const job = await runOnDemandJob(path, response);
  // The form renders {status, error}; a rejected request and a failed
  // connection look the same to it, which is right — both mean "didn't
  // connect", and the error text says which.
  return job.ok ? job.result : { status: 'connection_failed', error: job.error };
};

// POST for read: payload contains full working state (SQL, props, layout) that exceeds GET URL length limits.
export const fetchDiff = async (payload) => {
  const response = await apiFetch('/api/explorer/diff/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 200) {
    return await response.json();
  }
  return null;
};

export const fetchColumns = async (sourceName, databaseName, tableName, schemaName = null) => {
  const url = schemaName
    ? `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns/`
    : `/api/project/sources/${encodeURIComponent(sourceName)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns/`;

  const response = await apiFetch(url);
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
};
