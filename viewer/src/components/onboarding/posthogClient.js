/* Env-gated PostHog client for the onboarding telemetry shim (VIS-843).
 *
 * Contract (specs/marketing-relaunch/event-taxonomy.md):
 *  - Sink is PostHog via posthog-js. Event names are snake_case.
 *  - Every captured event carries `surface: 'viewer'` plus the shared context
 *    (visivo_version, platform, plan, is_ci), registered ONCE as PostHog super
 *    properties so they ride on every event.
 *  - ENV-GATED: posthog initializes ONLY when a key is present (read by
 *    posthogEnv.js from import.meta.env.VITE_POSTHOG_KEY; host defaults to
 *    https://us.i.posthog.com or VITE_POSTHOG_HOST). With no key (jest/jsdom,
 *    or any build where the key is not set) posthog NEVER initializes and every
 *    capture is a guarded no-op.
 *  - PRIVACY: the viewer is a CLI/embedded surface. It NEVER sends email or any
 *    PII and never calls identify(); account linking is server-side only.
 *  - The key is never hardcoded; enabling it in the distribution build is a
 *    deliberate later step (set VITE_POSTHOG_KEY in that build's env).
 *
 * posthog-js is statically imported so Vite/Rollup bundles it, but it is only
 * .init()'d when a key is present. With no key (the jest path) init() returns
 * early, posthog never initializes, and fireEvent stays a pure buffer push, so
 * the existing telemetry / onboarding tests pass unchanged. Importing the
 * library does NOT start tracking on its own.
 */

import posthog from 'posthog-js';
import { getPosthogConfig } from './posthogEnv';

const SURFACE = 'viewer';

let client = null; // the posthog-js instance once initialized
let initStarted = false;

/* Best-effort, PII-free shared context for the super properties. These are
 * intentionally derived client-side with safe fallbacks; the build/server can
 * later inject precise values via env without changing call sites. */
function buildSuperProperties() {
  let platform = null;
  let isCi = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.platform) {
      const p = navigator.platform.toLowerCase();
      if (p.includes('mac')) platform = 'darwin';
      else if (p.includes('win')) platform = 'win32';
      else if (p.includes('linux')) platform = 'linux';
      else platform = navigator.platform;
    }
  } catch (e) {
    platform = null;
  }
  try {
    isCi =
      typeof navigator !== 'undefined' &&
      typeof navigator.webdriver === 'boolean' &&
      navigator.webdriver === true;
  } catch (e) {
    isCi = false;
  }
  return {
    surface: SURFACE,
    visivo_version: null,
    platform,
    plan: 'anonymous',
    is_ci: isCi,
  };
}

/* Initialize posthog at most once, and only when an env key is present.
 * Returns the client (or null if not configured / not initializable). */
export function initPosthog() {
  if (client) return client;
  if (initStarted) return client;
  initStarted = true;

  if (typeof window === 'undefined') return null;

  const config = getPosthogConfig();
  if (!config || !config.key) return null;

  try {
    posthog.init(config.key, {
      api_host: config.host,
      // Viewer is a CLI/embedded surface: never autocapture PII-bearing DOM,
      // and never load the session-recording bundle.
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
    });
    posthog.register(buildSuperProperties());
    client = posthog;
    return client;
  } catch (e) {
    // Never let telemetry break the app; fall back to a buffer-only no-op.
    client = null;
    return null;
  }
}

/* Guarded capture. No-op unless posthog has been initialized (i.e. a key was
 * present). `surface: 'viewer'` is enforced here as well as via super props.
 * Never accepts or forwards email/PII — callers pass only event metadata. */
export function capturePosthog(event, props = {}) {
  const instance = client || initPosthog();
  if (!instance) return;
  try {
    instance.capture(event, { surface: SURFACE, ...props });
  } catch (e) {
    /* swallow: telemetry must never throw into the UI */
  }
}

/* Test/introspection helper. */
export function isPosthogReady() {
  return !!client;
}
