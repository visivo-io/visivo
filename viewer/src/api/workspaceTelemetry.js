import { isAvailable, getUrl } from '../contexts/URLContext';

/**
 * Workspace telemetry sink (VIS-822).
 *
 * `emitWorkspaceEvent` forwards each workspace event here; we POST it to the
 * local Flask server's `/api/telemetry/workspace-event/` endpoint, which
 * relays it through the CLI's server-side PostHog client. Routing through
 * the server (instead of shipping posthog-js + an API key in the bundle)
 * means the CLI telemetry opt-out (`VISIVO_TELEMETRY_DISABLED`,
 * `~/.visivo/config.yml`, project `defaults.telemetry_enabled`) and its
 * anonymization (machine-id distinct ids, `$ip: 0.0.0.0`) apply to frontend
 * events for free.
 *
 * Guarantees:
 *   - NEVER throws into the render path (every failure is swallowed).
 *   - No-op under jest (`JEST_WORKER_ID`), so unit tests never fire network
 *     calls — integration tests mock this module instead.
 *   - No-op in the dist/cloud viewer (the `workspaceTelemetry` URL key is
 *     `null` there — the standard urls.js local-only pattern) and before the
 *     URLConfig is initialized.
 */

const isJest = () =>
  typeof process !== 'undefined' && !!(process.env && process.env.JEST_WORKER_ID);

/**
 * Build the fetch request for a workspace event, or `null` when the sink is
 * unavailable (dist mode, URLConfig not initialized, malformed event).
 * Pure-ish (reads URL config) and exported so tests can cover the request
 * shape without dispatching network calls.
 *
 * @param {{eventName: string, payload?: object, ts?: number}} event
 * @returns {{url: string, options: object}|null}
 */
export function buildWorkspaceTelemetryRequest(event) {
  if (!event || typeof event.eventName !== 'string' || !event.eventName) return null;
  if (!isAvailable('workspaceTelemetry')) return null;
  return {
    url: getUrl('workspaceTelemetry'),
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: event.eventName,
        payload: event.payload || {},
        ts: event.ts,
      }),
      // Let the event survive page unloads (e.g. a publish immediately
      // followed by navigation).
      keepalive: true,
    },
  };
}

/**
 * Fire-and-forget a workspace event to the server-side telemetry relay.
 * Telemetry must never break the app: all errors are swallowed.
 *
 * @param {{eventName: string, payload?: object, ts?: number}} event
 */
export function postWorkspaceEvent(event) {
  if (isJest()) return;
  try {
    const request = buildWorkspaceTelemetryRequest(event);
    if (!request || typeof fetch !== 'function') return;
    fetch(request.url, request.options).catch(() => {});
  } catch {
    // Swallow — telemetry must never throw into the render path.
  }
}
