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

const DEFAULT_INTERVAL_MS = 300;
const DEFAULT_TIMEOUT_MS = 120000;

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
 * Returns `{ok, result, error}` rather than throwing: for every caller here a
 * failed job is an outcome to render, not an exception. Callers that want to
 * throw can, at their own boundary.
 */
export const pollJob = async (fetchStatus, { intervalMs, timeoutMs, onProgress } = {}) => {
  const interval = intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + (timeoutMs ?? DEFAULT_TIMEOUT_MS);

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

    if (Date.now() >= deadline) {
      return { ok: false, error: 'Timed out waiting for the job', job };
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};
