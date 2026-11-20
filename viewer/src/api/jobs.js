/**
 * Polling for on-demand jobs.
 *
 * Every op that reaches a warehouse — run a query, test a connection,
 * introspect a schema — is a job on both servers: the request answers
 * `202 {job_id}` and the client polls until the job reaches a terminal state.
 *
 * Cloud has no alternative. Those ops run on a warm runner pool whose pods deny
 * all ingress, so there is no request core could hold open. The local server
 * matches it so the viewer has one code path, and so `visivo serve` exercises
 * the same one production does.
 *
 * The job envelope is shared by both servers:
 *   {job_id, status, progress, progress_message, result, error}
 * with `status` in queued | running | completed | failed | cancelled.
 */

import { apiFetch } from './utils';

const DEFAULT_INTERVAL_MS = 300;
const DEFAULT_TIMEOUT_MS = 120000;
// Cloud's runner pool scales to zero; its first pod has taken up to ~4 minutes to start.
const DEFAULT_QUEUED_TIMEOUT_MS = 360000;
const QUEUED_INTERVAL_MS = 2000;
const QUEUED_FAST_POLLS_MS = 5000;

/**
 * Poll a job to a terminal state.
 *
 * `fetchStatus` returns the job envelope; it owns its own URL scheme, which is
 * what lets callers differ (some build a path, some go through URLContext)
 * while sharing this loop.
 *
 * Polls immediately, then waits between attempts — a job that is already done
 * shouldn't pay the interval, and locally most of them are.
 *
 * `timeoutMs` counts from when the job leaves `queued`. A job still waiting for
 * a runner gets `queuedTimeoutMs`, and is polled more slowly after a few seconds.
 *
 * Returns `{ok, result, error}` rather than throwing: for every caller here a
 * failed job is an outcome to render, not an exception. Callers that want to
 * throw can, at their own boundary.
 */
export const pollJob = async (
  fetchStatus,
  { intervalMs, timeoutMs, queuedTimeoutMs, onProgress } = {}
) => {
  const interval = intervalMs ?? DEFAULT_INTERVAL_MS;
  const runLimit = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const queuedLimit = queuedTimeoutMs ?? DEFAULT_QUEUED_TIMEOUT_MS;
  const started = Date.now();
  let runningSince = null;
  let sawQueued = false;

  for (;;) {
    let job;
    try {
      job = await fetchStatus();
    } catch (err) {
      return { ok: false, error: err?.message || 'Lost track of the job' };
    }

    if (onProgress) onProgress(job);

    if (job.status === 'completed') return { ok: true, result: job.result, job };
    if (job.status === 'failed' || job.status === 'cancelled') {
      return { ok: false, error: job.error || `Job ${job.status}`, job };
    }

    const now = Date.now();
    const queued = job.status === 'queued';
    if (queued) sawQueued = true;
    else if (runningSince === null) runningSince = sawQueued ? now : started;
    if (queued && now - started >= queuedLimit) {
      return { ok: false, error: 'Timed out waiting for a runner to start the job', job };
    }
    if (!queued && now - runningSince >= runLimit) {
      return { ok: false, error: 'Timed out waiting for the job', job };
    }
    const wait =
      queued && now - started >= QUEUED_FAST_POLLS_MS
        ? Math.max(interval, QUEUED_INTERVAL_MS)
        : interval;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
};

/**
 * Run an on-demand job to completion: take the already-issued start response,
 * then poll to a terminal state.
 *
 * `response` is passed in rather than issued here so callers keep control of
 * the method, body, and URL resolution. `jobUrl(jobId)` says where the job is
 * polled, from a registry key, so the poll path is one the contract check
 * can see.
 *
 * Returns `{ok, result, error}`.
 */
export const runOnDemandJob = async (jobUrl, response) => {
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
    const poll = await apiFetch(jobUrl(jobId));
    if (poll.status !== 200) throw new Error('Lost track of the job');
    return poll.json();
  });
};
