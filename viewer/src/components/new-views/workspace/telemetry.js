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
  // Outside production, mirror emissions onto a window buffer so end-to-end
  // tests (Playwright) can assert telemetry without a real analytics sink.
  // Guarded so production builds never attach a debug buffer.
  if (
    typeof window !== 'undefined' &&
    !(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production')
  ) {
    if (!Array.isArray(window.__VISIVO_WORKSPACE_EVENTS__)) {
      window.__VISIVO_WORKSPACE_EVENTS__ = [];
    }
    window.__VISIVO_WORKSPACE_EVENTS__.push(event);
  }
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
  // Dev visibility only — keep silent in CI/test to avoid the
  // setupTests.js "unexpected console call" guard.
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
