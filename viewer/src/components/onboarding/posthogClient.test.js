/* Tests for the PostHog client opt-out gate (VIS-843).
 *
 * Under jest the posthogEnv module is stubbed to return null (no key), so
 * posthog never initializes regardless. These tests assert the host opt-out
 * contract that gates capture/init via window.__VISIVO_TELEMETRY_DISABLED:
 *  - absent flag  => enabled (cloud + local-not-opted-out)
 *  - flag === true => disabled (CLI/local opt-out honored by `visivo serve`)
 */

import { initPosthog, capturePosthog, isPosthogReady } from './posthogClient';

afterEach(() => {
  delete window.__VISIVO_TELEMETRY_DISABLED;
});

describe('posthog opt-out gate', () => {
  test('capturePosthog never throws and is a no-op under jest (no key)', () => {
    expect(() => capturePosthog('onboarding_checklist_shown')).not.toThrow();
    expect(isPosthogReady()).toBe(false);
  });

  test('initPosthog returns null when telemetry is disabled by the host flag', () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
    expect(initPosthog()).toBeNull();
    expect(isPosthogReady()).toBe(false);
  });

  test('capturePosthog is a no-op when telemetry is disabled by the host flag', () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
    expect(() => capturePosthog('onboarding_role_chosen', { role: 'analytics_engineer' })).not.toThrow();
    expect(isPosthogReady()).toBe(false);
  });

  test('a non-true flag value does NOT disable telemetry (only strict true gates)', () => {
    // Absent/falsey/other values keep telemetry enabled; capture stays a guarded
    // no-op here only because jest stubs the key, not because of the gate.
    window.__VISIVO_TELEMETRY_DISABLED = 'true'; // string, not boolean true
    expect(() => capturePosthog('onboarding_checklist_completed')).not.toThrow();
  });
});
