/* Telemetry shim. The onboarding flow has a contract with PostHog.

   This shim does two things on every fired event:
     1. Pushes the event into a window-scoped buffer (window.__onbEvents) that
        the e2e suite asserts on. This behavior is unchanged and load-bearing.
     2. Forwards the event to PostHog (surface: 'viewer') via the env-gated
        client in posthogClient.js — but ONLY when posthog has initialized,
        which only happens when VITE_POSTHOG_KEY is present at build time.

   With no key (jest/jsdom, or any build that hasn't enabled telemetry) posthog
   never initializes, so fireEvent stays a pure buffer push and the existing
   telemetry / onboarding tests pass unchanged. The viewer is a CLI/embedded
   surface and NEVER sends email or any PII. See posthogClient.js and
   specs/marketing-relaunch/event-taxonomy.md. */

import { capturePosthog } from './posthogClient';

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
  // Forward to PostHog. Guarded + env-gated: a no-op unless a key was present
  // at build time (so this stays a pure buffer push in jest/e2e). surface is
  // enforced inside capturePosthog. Wrapped so a forwarding failure can never
  // break the UI or the (already-recorded) buffer push.
  try {
    capturePosthog(event, props);
  } catch (e) {
    /* swallow: telemetry must never throw into the UI */
  }
}
