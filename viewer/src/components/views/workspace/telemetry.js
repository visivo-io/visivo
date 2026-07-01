/**
 * Workspace telemetry (VIS-775 / Track B B2, sink wired in VIS-822 / Track K).
 *
 * `emitWorkspaceEvent(name, payload)` fans each event out to three places:
 *
 *   1. The in-memory test listener (`setWorkspaceTelemetryListener`) — when
 *      set, it REPLACES the other sinks so unit tests observe emissions
 *      without any side effects.
 *   2. The `visivo:workspace-telemetry` CustomEvent — out-of-process
 *      observers (Playwright e2e stories) subscribe to this.
 *   3. The PostHog sink (`postWorkspaceEvent`) — POSTs the event to the local
 *      Flask server's `/api/telemetry/workspace-event/` relay, which tracks
 *      it through the CLI's server-side PostHog client (so the CLI telemetry
 *      opt-out and anonymization apply). A no-op under jest and in the
 *      dist/cloud viewer (the URL key is `null` there).
 *
 * Event names + payload shapes follow
 * `specs/dashboard-building/03-architecture-proposal.md` §3.4; keep the
 * function signature stable so call-sites don't need to change.
 */

import { postWorkspaceEvent } from '../../../api/workspaceTelemetry';

let listener = null;

/**
 * Fire a workspace telemetry event.
 *
 * @param {string} eventName — canonical event name (e.g. `workspace_mode_entered`).
 * @param {object} [payload] — JSON-serialisable properties for the event.
 */
export function emitWorkspaceEvent(eventName, payload = {}) {
  if (!eventName) return;
  const event = { eventName, payload, ts: Date.now() };
  // In tests `listener` is set by `setWorkspaceTelemetryListener` to capture
  // emissions without going through a console.
  if (listener) {
    try {
      listener(event);
    } catch {
      // Swallow listener errors so a faulty subscriber can't break the shell.
    }
    return;
  }
  // Browser-side fan-out so out-of-process observers (E2E tests, a future
  // analytics sink) can subscribe without coupling to the in-memory listener
  // or to `process.env` (undefined under Vite). Wrapped in a guard so it's a
  // no-op in jsdom/SSR where `window.dispatchEvent`/`CustomEvent` may be
  // absent, and so a faulty subscriber can't break the shell.
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    try {
      window.dispatchEvent(new window.CustomEvent('visivo:workspace-telemetry', { detail: event }));
    } catch {
      // ignore — telemetry must never throw into the render path.
    }
  }
  // Forward to the PostHog sink (VIS-822). The sink module guards itself
  // (jest no-op, dist no-op, all errors swallowed) but we belt-and-suspenders
  // the call so telemetry can never throw into the render path.
  try {
    postWorkspaceEvent(event);
  } catch {
    // ignore — telemetry must never break the app.
  }
  // Dev visibility only — keep silent in CI/test to avoid the
  // setupTests.js "unexpected console call" guard. Under Vite `process` is
  // undefined in the browser, so out-of-process observers must use the
  // `visivo:workspace-telemetry` CustomEvent above; this console line is a
  // best-effort jest/SSR convenience only.
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug(`[workspace-telemetry] ${eventName}`, payload);
  }
}

/**
 * Subscribe to workspace telemetry events. Returns an unsubscribe function.
 * Intended for tests; production code should send events through a real
 * analytics sink once one exists.
 */
export function setWorkspaceTelemetryListener(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/**
 * `time_to_first_publish_in_build_mode` (VIS-806 / Track H H-1, Q22 metric).
 *
 * The Workspace marks Build-mode entry on mount; the publish flow calls
 * `emitFirstPublishTelemetry()` on every successful publish, but only the
 * FIRST publish after a Build-mode entry emits — re-entering the Workspace
 * re-arms the metric. Elapsed time is `null` when a publish happens without
 * a recorded entry (e.g. publish from the legacy /editor surface).
 */
let buildModeEnteredAt = null;
let firstPublishEmitted = false;

export function markBuildModeEntered() {
  buildModeEnteredAt = Date.now();
  firstPublishEmitted = false;
}

export function emitFirstPublishTelemetry() {
  if (firstPublishEmitted) return;
  firstPublishEmitted = true;
  emitWorkspaceEvent('time_to_first_publish_in_build_mode', {
    msSinceBuildModeEntered: buildModeEnteredAt ? Date.now() - buildModeEnteredAt : null,
  });
}
