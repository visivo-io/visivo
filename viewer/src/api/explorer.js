import { apiFetch } from './utils';

const JOB_POLL_INTERVAL_MS = 300;
const JOB_POLL_TIMEOUT_MS = 120000;

/**
 * Run a source op to completion: start it, then poll its job to a terminal
 * state.
 *
 * Source ops talk to a warehouse, so they take as long as the warehouse takes.
 * Both servers therefore answer `202 {job_id}` and expose a job to poll —
 * cloud because it must (the ops run on a warm runner pool whose pods deny all
 * ingress, so there is no request it could hold open), and the local server to
 * match. One contract means one code path here, and it means `visivo serve`
 * exercises the same path production does instead of leaving it to be tested
 * for the first time in cloud.
 *
 * `basePath` owns the job: `<basePath><job_id>/`, mirroring model-query-jobs.
 * Returns `{ok, result, error}`.
 */
const runSourceOpJob = async (basePath, response) => {
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

  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    const poll = await apiFetch(`${basePath}${jobId}/`);
    if (poll.status !== 200) {
      return { ok: false, error: 'Lost track of the job' };
    }
    const job = await poll.json();
    if (job.status === 'completed') return { ok: true, result: job.result };
    if (job.status === 'failed' || job.status === 'cancelled') {
      return { ok: false, error: job.error || `Job ${job.status}` };
    }
  }
  return { ok: false, error: 'Timed out waiting for the job' };
};

export const fetchSourceMetadata = async () => {
  const path = '/api/project/sources_metadata/';
  const job = await runSourceOpJob(path, await apiFetch(path));
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
  const job = await runSourceOpJob(path, response);
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
