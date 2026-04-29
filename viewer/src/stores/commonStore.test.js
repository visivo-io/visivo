/**
 * Tests for the URL-param-driven onboarding routing in commonStore.
 *
 * The store's `isOnboardingRequested` flag is derived at module init from
 * (a) the `onboarding=1` URL param and (b) whether onboarding has already
 * been completed (the onboardingState localStorage contract). Because the
 * flag is captured when the store module is first imported, each test resets
 * globals and re-imports the store via jest.isolateModules.
 */

// Mirrors the KEY constant in components/onboarding/onboardingState.js
const ONBOARDING_STATE_KEY = 'visivo.onboarding.v1';

const setLocation = (search = '', pathname = '/') => {
  delete window.location;
  window.location = {
    href: `http://localhost${pathname}${search}`,
    pathname,
    search,
    hash: '',
  };
};

const loadStore = () => {
  let useStore;
  jest.isolateModules(() => {
    useStore = require('./store').default;
  });
  return useStore;
};

describe('commonStore - onboarding URL routing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocation('', '/');
  });

  test('isOnboardingRequested true when ?onboarding=1 and onboarding not completed', () => {
    setLocation('?onboarding=1', '/');

    expect(loadStore().getState().isOnboardingRequested).toBe(true);
  });

  test('isOnboardingRequested false when onboarding already completed', () => {
    setLocation('?onboarding=1', '/');
    window.localStorage.setItem(
      ONBOARDING_STATE_KEY,
      JSON.stringify({ completed_at: new Date().toISOString() })
    );

    expect(loadStore().getState().isOnboardingRequested).toBe(false);
  });

  test('isOnboardingRequested false when URL has no onboarding param', () => {
    setLocation('', '/');

    expect(loadStore().getState().isOnboardingRequested).toBe(false);
  });
});
