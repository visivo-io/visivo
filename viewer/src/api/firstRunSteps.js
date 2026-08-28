import { isAvailable, getUrl } from '../contexts/URLContext';

/**
 * Time-to-value mark write-back (Guided First Run W1).
 *
 * This sends NO event. `markTimeToValueStep` has already emitted to PostHog;
 * what it cannot do on its own is make "once per journey" survive leaving the
 * browser origin the mark was made in.
 *
 * The viewer's idempotence ledger lives in `localStorage`, which is scoped to
 * `http://localhost:<port>` — so `visivo serve -p 8001`, a second browser, an
 * incognito window, or a cleared site-data all present as "no marks yet" while
 * `~/.visivo/first_run.json` still holds the SAME journey_id. Every viewer mark
 * would then fire a second time under that id, inflating the funnel and
 * destroying the median the 2.1 exit gate is read off.
 *
 * Posting the mark to `/api/telemetry/first-run/step/` records it in the
 * server-side ledger, and the next page load is seeded from there
 * (`viewer_journey_context().steps`), whichever origin it happens on.
 *
 * Guarantees, matching the workspace telemetry sink next door:
 *   - NEVER throws into the render path (every failure is swallowed).
 *   - No-op under jest (`JEST_WORKER_ID`), so unit tests fire no network calls.
 *   - No-op in the dist/cloud viewer (the URL key is `null` there) and before
 *     the URLConfig is initialized.
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
      // The terminal mark fires as a dashboard mounts, which is often followed
      // immediately by navigation; keepalive is what lets it land anyway.
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
    // Swallow — telemetry must never throw into the render path.
  }
}
