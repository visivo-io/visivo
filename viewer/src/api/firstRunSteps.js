import { isAvailable, getUrl } from '../contexts/URLContext';

/**
 * Time-to-value mark write-back (Guided First Run W1). Sends no event —
 * `markTimeToValueStep` has already emitted it.
 *
 * The viewer's idempotence ledger lives in `localStorage`, scoped to
 * `http://localhost:<port>`; posting the mark to the server records it in
 * `~/.visivo/first_run.json`, which is not origin-scoped, so the next page load
 * on any origin is seeded with what already fired.
 *
 * Like the workspace telemetry sink next door: never throws into the render
 * path, no-ops under jest, and no-ops in the dist/cloud viewer where the URL
 * key is null.
 */

const isJest = () =>
  typeof process !== 'undefined' && !!(process.env && process.env.JEST_WORKER_ID);

/**
 * Build the fetch request for a mark write-back, or `null` when the sink is
 * unavailable. Exported so tests can cover the request shape without
 * dispatching network calls.
 *
 * @param {{journeyId?: string, stepId: string, atMs?: number}} mark
 * @returns {{url: string, options: object}|null}
 */
export function buildFirstRunStepRequest(mark) {
  if (!mark || typeof mark.stepId !== 'string' || !mark.stepId) return null;
  if (!isAvailable('firstRunStep')) return null;
  return {
    url: getUrl('firstRunStep'),
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step_id: mark.stepId,
        journey_id: mark.journeyId ?? null,
        at_ms: mark.atMs ?? null,
      }),
      // The terminal mark fires on mount, often just before a navigation that
      // would otherwise cancel the request.
      keepalive: true,
    },
  };
}

/**
 * Fire-and-forget a mark write-back. Telemetry must never break the app.
 *
 * @param {{journeyId?: string, stepId: string, atMs?: number}} mark
 */
export function postFirstRunStep(mark) {
  if (isJest()) return;
  try {
    const request = buildFirstRunStepRequest(mark);
    if (!request || typeof fetch !== 'function') return;
    fetch(request.url, request.options).catch(() => {});
  } catch {
    /* never throw into the render path */
  }
}
