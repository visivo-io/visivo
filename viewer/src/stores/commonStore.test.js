/**
 * Tests for the URL-param-driven onboarding routing in commonStore.
 *
 * The store's `isOnboardingRequested` flag is derived at module init from
 * (a) the `onboarding=1` URL param and (b) localStorage. Because the flag is
 * captured when the store module is first imported, each test resets globals
 * and re-imports the store via jest.isolateModules.
 */

const ONBOARDING_KEY = 'visivo_onboarding_completed';

const setLocation = (search = '', pathname = '/') => {
  delete window.location;
  window.location = {
    href: `http://localhost${pathname}${search}`,
    pathname,
    search,
    hash: '',
  };
};

describe('commonStore - onboarding URL routing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocation('', '/');
    // Reset history.replaceState mock for each test
    if (window.history.replaceState && window.history.replaceState.mock) {
      window.history.replaceState.mockClear();
    }
  });

  test('isOnboardingRequested true when ?onboarding=1 and no localStorage flag', () => {
    setLocation('?onboarding=1', '/');

    let useStore;
    jest.isolateModules(() => {
      useStore = require('./store').default;
    });

    expect(useStore.getState().isOnboardingRequested).toBe(true);
  });

  test('isOnboardingRequested false when localStorage flag is set', () => {
    setLocation('?onboarding=1', '/');
    window.localStorage.setItem(ONBOARDING_KEY, 'true');

    let useStore;
    jest.isolateModules(() => {
      useStore = require('./store').default;
    });

    expect(useStore.getState().isOnboardingRequested).toBe(false);
  });

  test('isOnboardingRequested false when URL has no onboarding param', () => {
    setLocation('', '/');

    let useStore;
    jest.isolateModules(() => {
      useStore = require('./store').default;
    });

    expect(useStore.getState().isOnboardingRequested).toBe(false);
  });

  test('markOnboardingCompleted sets localStorage and removes the URL param', () => {
    setLocation('?onboarding=1&keep=yes', '/some-path');

    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    let useStore;
    jest.isolateModules(() => {
      useStore = require('./store').default;
    });

    expect(useStore.getState().isOnboardingRequested).toBe(true);

    useStore.getState().markOnboardingCompleted();

    expect(window.localStorage.getItem(ONBOARDING_KEY)).toBe('true');
    expect(useStore.getState().isOnboardingRequested).toBe(false);

    expect(replaceStateSpy).toHaveBeenCalled();
    const lastCall = replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1];
    const newUrl = lastCall[2];
    expect(newUrl).not.toContain('onboarding=1');
    expect(newUrl).toContain('keep=yes');

    replaceStateSpy.mockRestore();
  });

  test('markOnboardingCompleted is safe when onboarding param is absent', () => {
    setLocation('', '/');

    let useStore;
    jest.isolateModules(() => {
      useStore = require('./store').default;
    });

    expect(() => useStore.getState().markOnboardingCompleted()).not.toThrow();
    expect(window.localStorage.getItem(ONBOARDING_KEY)).toBe('true');
    expect(useStore.getState().isOnboardingRequested).toBe(false);
  });
});
