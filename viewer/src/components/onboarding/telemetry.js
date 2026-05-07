/* Telemetry shim. The onboarding flow has a contract with PostHog, but the
   viewer doesn't ship a PostHog client today. We keep the call sites stable
   so a real client can be wired up here later (or events forwarded to the
   server). For now we log to the browser when DEBUG=true via a query param
   or window flag, and we keep the last N events in a window-scoped buffer
   so e2e tests can assert on them. */

const BUF_KEY = '__onbEvents';
const MAX = 200;

export function getEventBuffer() {
  if (typeof window === 'undefined') return [];
  return window[BUF_KEY] || [];
}

export function clearEventBuffer() {
  if (typeof window !== 'undefined') {
    window[BUF_KEY] = [];
  }
}

export function fireEvent(event, props = {}) {
  if (typeof window === 'undefined') return;
  const entry = { event, props, ts: Date.now() };
  if (!window[BUF_KEY]) {
    window[BUF_KEY] = [];
  }
  const buf = window[BUF_KEY];
  buf.push(entry);
  if (buf.length > MAX) buf.shift();
  if (window.__visivoOnbDebug) {
    /* eslint-disable-next-line no-console */
    console.debug('[onb]', event, props);
  }
}
