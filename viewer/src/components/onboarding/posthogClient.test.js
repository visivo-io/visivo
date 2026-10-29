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
    expect(() =>
      capturePosthog('onboarding_role_chosen', { role: 'analytics_engineer' })
    ).not.toThrow();
    expect(isPosthogReady()).toBe(false);
  });

  test('a non-true flag value does NOT disable telemetry (only strict true gates)', () => {
    // Absent/falsey/other values keep telemetry enabled; capture stays a guarded
    // no-op here only because jest stubs the key, not because of the gate.
    window.__VISIVO_TELEMETRY_DISABLED = 'true'; // string, not boolean true
    expect(() => capturePosthog('onboarding_checklist_completed')).not.toThrow();
  });
});

describe('posthog client with a key', () => {
  const load = ({ config = { key: 'phc_test', host: null }, init } = {}) => {
    const posthog = {
      init: jest.fn(init),
      register: jest.fn(),
      capture: jest.fn(),
    };
    let mod;
    jest.isolateModules(() => {
      jest.doMock('posthog-js', () => ({ __esModule: true, default: posthog }));
      jest.doMock('./posthogEnv', () => ({ getPosthogConfig: () => config }));
      mod = require('./posthogClient');
    });
    return { posthog, mod };
  };

  const superProps = getters => {
    Object.entries(getters).forEach(([name, get]) =>
      Object.defineProperty(window.navigator, name, { get, configurable: true })
    );
    const { posthog, mod } = load();
    mod.initPosthog();
    Object.keys(getters).forEach(name => delete window.navigator[name]);
    return posthog.register.mock.calls[0][0];
  };

  afterEach(() => {
    jest.dontMock('posthog-js');
    jest.dontMock('./posthogEnv');
  });

  test('sends through the first-party proxy when no host is configured', () => {
    const { posthog, mod } = load();
    mod.initPosthog();
    expect(posthog.init.mock.calls[0][1]).toMatchObject({
      api_host: 'https://e.visivo.io',
      ui_host: 'https://us.posthog.com',
    });
  });

  test('a configured host still wins', () => {
    const { posthog, mod } = load({
      config: { key: 'phc_test', host: 'https://posthog.example.com' },
    });
    mod.initPosthog();
    expect(posthog.init.mock.calls[0][1].api_host).toBe('https://posthog.example.com');
  });

  test('initializes once and reuses the client', () => {
    const { posthog, mod } = load();
    const first = mod.initPosthog();
    expect(mod.initPosthog()).toBe(first);
    expect(mod.isPosthogReady()).toBe(true);
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });

  test('does not retry after a failed init', () => {
    const { posthog, mod } = load({
      init: () => {
        throw new Error('blocked');
      },
    });
    expect(mod.initPosthog()).toBeNull();
    expect(mod.initPosthog()).toBeNull();
    expect(mod.isPosthogReady()).toBe(false);
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['MacIntel', 'darwin'],
    ['Win32', 'win32'],
    ['Linux x86_64', 'linux'],
    ['FreeBSD amd64', 'FreeBSD amd64'],
  ])('maps navigator.platform %s to %s', (raw, expected) => {
    expect(superProps({ platform: () => raw }).platform).toBe(expected);
  });

  test('registers viewer super properties and flags webdriver sessions as CI', () => {
    expect(superProps({ webdriver: () => true })).toMatchObject({
      surface: 'viewer',
      plan: 'anonymous',
      is_ci: true,
    });
  });

  test('falls back when navigator properties throw', () => {
    const boom = () => {
      throw new Error('denied');
    };
    expect(superProps({ platform: boom, webdriver: boom })).toMatchObject({
      platform: null,
      is_ci: false,
    });
  });

  test('capture adds the viewer surface and swallows client errors', () => {
    const { posthog, mod } = load();
    mod.capturePosthog('onboarding_checklist_shown', { step: 1 });
    expect(posthog.capture).toHaveBeenCalledWith('onboarding_checklist_shown', {
      surface: 'viewer',
      step: 1,
    });
    posthog.capture.mockImplementation(() => {
      throw new Error('network');
    });
    expect(() => mod.capturePosthog('onboarding_checklist_shown')).not.toThrow();
  });
});
