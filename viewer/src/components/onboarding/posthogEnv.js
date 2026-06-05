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
 * Telemetry is ON BY DEFAULT in the distribution build: when VITE_POSTHOG_KEY
 * is unset we fall back to the hardcoded public PostHog *ingestion* key
 * (DEFAULT_KEY). That key is write-only — it can only send events, never read
 * data or administer the project — and already ships to every client, so
 * hardcoding it is safe. Under jest this module is swapped for
 * posthogEnv.stub.js (which returns null), so jest stays a pure no-op.
 *
 * The opt-out gate lives in posthogClient.js (window.__VISIVO_TELEMETRY_DISABLED):
 * the LOCAL/CLI case respects the existing telemetry opt-out by setting that
 * flag from the served HTML; cloud never sets it, so cloud is always-on.
 */

const DEFAULT_HOST = 'https://us.i.posthog.com';

// Public, write-only PostHog ingestion key. Safe to hardcode: it ships to every
// client and cannot read data or administer the project. Turns viewer telemetry
// on by default in distribution. Override via VITE_POSTHOG_KEY at build time.
const DEFAULT_KEY = 'phc_DaLOz39kD2u4ZFNi6aXQuA7ncmnbAGoE8dLZc2z7Agj';

export function getPosthogConfig() {
  const env = import.meta.env || {};
  const key = env.VITE_POSTHOG_KEY || DEFAULT_KEY;
  if (!key) return null;
  return {
    key,
    host: env.VITE_POSTHOG_HOST || DEFAULT_HOST,
  };
}
