import { apiFetch } from './utils';

const JOB_POLL_INTERVAL_MS = 500;
const JOB_POLL_TIMEOUT_MS = 120000;

/**
 * Resolve a source op that the server chose to run asynchronously.
 *
 * The two servers answer differently and callers shouldn't have to care. The
 * local server does the work inside the request and returns `200` with the
 * result. Cloud runs it in a warm runner pool — nothing can dial into one of
 * those pods, so the work is pulled rather than pushed and there is no request
 * to hold open — and returns `202 {job_id}` for the client to poll.
 *
 * Returns `{ok, result, error}`, or `null` when the response wasn't a job at
 * all, which is how a caller tells "poll finished" from "handle this yourself".
 */
const resolveJob = async response => {
  if (response.status !== 202) return null;

  const { job_id: jobId } = await response.json();
  if (!jobId) return { ok: false, error: 'Server accepted the job but named no id' };

  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    const poll = await apiFetch(`/api/runner-jobs/${jobId}/`);
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
  const response = await apiFetch('/api/project/sources_metadata/');
  const job = await resolveJob(response);
  if (job) {
    return job.ok ? job.result : null;
  }
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    return null;
  }
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
  const response = await apiFetch(`/api/sources/test-connection/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sourceConfig),
  });
  const job = await resolveJob(response);
  if (job) {
    return job.ok
      ? job.result
      : { status: 'connection_failed', error: job.error };
  }
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    const error = await response.text();
    try {
      return JSON.parse(error);
    } catch {
      return { status: 'connection_failed', error: 'Failed to test connection' };
    }
  }
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
