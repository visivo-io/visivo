/**
 * Workspace telemetry stub (VIS-775 / Track B B2).
 *
 * The viewer has no frontend telemetry framework yet — server-side telemetry
 * lives in `visivo/telemetry/` (Flask middleware + PostHog client). When the
 * frontend gets its own analytics sink (PostHog browser SDK or similar), wire
 * `emitWorkspaceEvent` to forward to it.
 *
 * The spec for VIS-775 (`specs/dashboard-building/implementation/01-tracks-and-phasing.md`
 * Track B B2) requires firing `workspace_mode_entered` on shell mount with the
 * scoped dashboard name (or `null` for unscoped). We log the event to the
 * console in dev so the shape is visible during local testing, and we expose
 * a hook so tests can spy on emissions without coupling to a sink.
 *
 * TODO(VIS-?): replace with real telemetry call once the viewer adopts a
 * browser-side analytics module. Keep the function signature stable so
 * call-sites don't need to change.
 */

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
