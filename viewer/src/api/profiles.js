import { getUrl, isAvailable } from '../contexts/URLContext';
import { pollJob } from './jobs';
import { withProjectId } from './projectScope';
import { apiFetch, throwApiError } from './utils';

// Cloud answers 202 and the profile is polled. A profile is one bounded sample
// plus one COUNT(*), so a minute covers a cold runner and a slow warehouse.
const POLL_INTERVAL_MS = 750;
const POLL_TIMEOUT_MS = 60000;

const fail = (message, errorType, extra = {}) => {
  const err = new Error(message);
  err.errorType = errorType;
  Object.assign(err, extra);
  throw err;
};

/**
 * Poll a cloud profile job to its end and return its `{profile, shape_cards}`.
 *
 * The job envelope is the shared one (`jobs.js`): `status` in
 * queued | running | completed | failed | cancelled, `result` on completion,
 * `error` otherwise. The runner reports a profiler exception as
 * `TypeName: message`, so a `QueryTimeout` is recognisable by its prefix and
 * maps to the same `'timeout'` the local server's 504 does.
 */
const awaitProfileJob = async (jobId, { projectId, signal }) => {
  const url = withProjectId(getUrl('profileJobDetail', { jobId }), projectId);
  const outcome = await pollJob(
    async () => {
      const poll = await apiFetch(url, signal ? { signal } : {});
      if (poll.status !== 200) await throwApiError(poll, 'Lost track of the profile job');
      return poll.json();
    },
    { intervalMs: POLL_INTERVAL_MS, timeoutMs: POLL_TIMEOUT_MS }
  );
  if (outcome.ok) return outcome.result;

  const { job, error } = outcome;
  if (signal?.aborted) fail('Profile cancelled', 'aborted');
  // A job still queued/running when pollJob gave up is the deadline, not the
  // job, saying no.
  if (job && (job.status === 'queued' || job.status === 'running')) fail(error, 'timeout');
  if (job?.status === 'cancelled') fail(error, 'cancelled');
  return fail(error, /^QueryTimeout\b/.test(error || '') ? 'timeout' : undefined);
};

/**
 * Profile a built model or any SQL on a source, server-side (VIS-1413).
 *
 * One classifier for the Explorer and the agent: the response carries the
 * unified column profile (`name, type, null_count, null_percentage, distinct,
 * min, max, avg, median, std_dev, q25, q75, p99, zeros_pct, avg_length,
 * top_values`) and a `shape_cards` list classifying each column.
 *
 * Both servers answer the same POST. The local server profiles inline and
 * answers 200; cloud runs it on the runner, answers `202 {job_id}`, and this
 * polls the job to its end — the caller sees one promise either way.
 *
 * @param {object} params - exactly one of `modelName` or `sourceName` + `sql`.
 * @param {string} [params.modelName]
 * @param {string} [params.sourceName]
 * @param {string} [params.sql]
 * @param {string[]} [params.columns] - at most 40 column names to profile.
 * @param {number} [params.sampleRows] - rows sampled for a query profile.
 * @param {string} [params.projectId] - cloud scopes the request to a project.
 * @param {AbortSignal} [params.signal] - cancels the request and the poll.
 * @returns {Promise<{profile: object, shape_cards: object[]}>}
 * @throws {Error} with `.errorType` `'unavailable'`, `'timeout'`, `'aborted'`,
 *   `'cancelled'`, or the server's.
 */
export const fetchProfile = async ({
  modelName,
  sourceName,
  sql,
  columns,
  sampleRows,
  projectId = null,
  signal,
} = {}) => {
  if (!isAvailable('profiles')) {
    fail('Profiling is not available in this deployment mode', 'unavailable');
  }
  const body = modelName ? { model_name: modelName } : { source_name: sourceName, sql };
  if (columns) body.columns = columns;
  if (sampleRows) body.sample_rows = sampleRows;

  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (signal) init.signal = signal;
  const response = await apiFetch(withProjectId(getUrl('profiles'), projectId), init);

  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 202) {
    const { job_id: jobId } = await response.json();
    if (!jobId) fail('Server accepted the profile job but named no id', undefined, { status: 202 });
    return awaitProfileJob(jobId, { projectId, signal });
  }
  return throwApiError(response, 'Failed to profile');
};
