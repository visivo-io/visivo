import copyItemLink from './copyItemLink';
import copy from 'copy-to-clipboard';

jest.mock('copy-to-clipboard', () => jest.fn());

describe('copyItemLink', () => {
  const setScrollY = value =>
    Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true });

  beforeEach(() => {
    copy.mockClear();
    window.history.replaceState({}, '', '/');
    setScrollY(0);
  });

  it('copies the current URL with element_id set to the scroll offset', () => {
    window.history.replaceState({}, '', '/project/my-dash?foo=1');
    setScrollY(420);

    copyItemLink();

    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith('http://localhost/project/my-dash?foo=1&element_id=420');
  });

  it('overwrites a stale element_id instead of appending a duplicate', () => {
    window.history.replaceState({}, '', '/project/my-dash?element_id=7');
    setScrollY(0);

    copyItemLink();

    expect(copy).toHaveBeenCalledWith('http://localhost/project/my-dash?element_id=0');
  });

  it('is a silent no-op when window is unavailable (SSR-like pass)', () => {
    const originalWindow = global.window;
    // eslint-disable-next-line no-native-reassign
    delete global.window;
    try {
      expect(typeof window).toBe('undefined');
      expect(() => copyItemLink()).not.toThrow();
      expect(copy).not.toHaveBeenCalled();
    } finally {
      global.window = originalWindow;
    }
  });
});
