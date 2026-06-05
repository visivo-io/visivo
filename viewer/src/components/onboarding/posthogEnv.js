/* Vite-only env reader for the onboarding -> PostHog shim.
 *
 * This is the ONLY module that touches `import.meta.env`. Vite statically
 * replaces `import.meta.env.VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` at build
 * time. Jest compiles modules to CommonJS scripts where the `import.meta`
 * token is a hard *parse* error (not catchable at runtime), so this file is
 * swapped for `posthogEnv.stub.js` under jest via the `moduleNameMapper` entry
 * in package.json. Keeping the `import.meta` access isolated here means the
 * rest of the shim (telemetry.js, posthogClient.js) stays jest-safe.
 *
 * No key in the env => returns null => posthog never initializes (see
 * posthogClient.js). The key is intentionally NOT hardcoded anywhere; turning
 * telemetry on in the distribution build is a deliberate later step (set
 * VITE_POSTHOG_KEY in that build's env).
 */

const DEFAULT_HOST = 'https://us.i.posthog.com';

export function getPosthogConfig() {
  const env = import.meta.env || {};
  const key = env.VITE_POSTHOG_KEY;
  if (!key) return null;
  return {
    key,
    host: env.VITE_POSTHOG_HOST || DEFAULT_HOST,
  };
}
